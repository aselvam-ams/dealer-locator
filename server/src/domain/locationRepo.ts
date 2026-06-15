import type { PoolClient } from 'pg';
import type { Location, ProvenanceField, ProvenanceSource, StopTowState } from '@dealer/shared';
import { pool, withTransaction } from '../db/pool.js';
import { applyProvenanceWrite } from './provenance.js';
import { writeJournal } from './journal.js';

export interface LocationWithMeta extends Location {
  stop_tow: StopTowState | null;
  location_type_ids: string[];
}

const SELECT = `
  SELECT l.*, st.enabled AS st_enabled, st.locked_by_oem AS st_locked,
         st.scope AS st_scope, st.postcode AS st_postcode, st.auto_rule AS st_auto,
         st.set_by AS st_set_by, st.set_at AS st_set_at, st.reason AS st_reason,
         st.stop_tow_id AS st_id,
         COALESCE(array_agg(llt.location_type_id) FILTER (WHERE llt.location_type_id IS NOT NULL), '{}') AS type_ids
    FROM location l
    LEFT JOIN stop_tow st ON st.location_id = l.location_id
    LEFT JOIN location_location_type llt ON llt.location_id = l.location_id
`;

function rowToLocation(row: any): LocationWithMeta {
  return {
    location_id: row.location_id,
    tenant_id: row.tenant_id,
    external_ref: row.external_ref,
    dealer_group_id: row.dealer_group_id,
    name: row.name,
    address: row.address,
    suburb: row.suburb,
    state: row.state,
    postcode: row.postcode,
    country: row.country,
    latitude: row.latitude,
    longitude: row.longitude,
    phone: row.phone,
    email: row.email,
    opening_hours: row.opening_hours,
    location_type_ids: row.type_ids ?? [],
    is_sales_only: row.is_sales_only,
    is_hidden: row.is_hidden,
    ev_certified: row.ev_certified,
    service_capabilities: row.service_capabilities,
    tyre_stock: row.tyre_stock,
    created_at: row.created_at,
    updated_at: row.updated_at,
    stop_tow: row.st_id
      ? {
          stop_tow_id: row.st_id,
          location_id: row.location_id,
          enabled: row.st_enabled,
          scope: row.st_scope,
          postcode: row.st_postcode,
          auto_rule: row.st_auto,
          locked_by_oem: row.st_locked,
          set_by: row.st_set_by,
          set_at: row.st_set_at,
          reason: row.st_reason,
        }
      : null,
  };
}

export async function getLocation(locationId: string): Promise<LocationWithMeta | null> {
  const r = await pool.query(
    `${SELECT} WHERE l.location_id = $1 GROUP BY l.location_id, st.stop_tow_id`,
    [locationId],
  );
  return r.rowCount ? rowToLocation(r.rows[0]) : null;
}

export async function listByTenant(tenantId: string): Promise<LocationWithMeta[]> {
  const r = await pool.query(
    `${SELECT} WHERE l.tenant_id = $1 GROUP BY l.location_id, st.stop_tow_id
      ORDER BY l.state, l.suburb`,
    [tenantId],
  );
  return r.rows.map(rowToLocation);
}

// Fields a user may edit through the management UI, by provenance source.
const PROVENANCE_FIELDS = ['name', 'address', 'phone', 'email', 'opening_hours', 'ev_certified', 'service_capabilities'] as const;
type PField = (typeof PROVENANCE_FIELDS)[number];

const PLAIN_FIELDS = ['is_sales_only', 'is_hidden'] as const;
type PlainField = (typeof PLAIN_FIELDS)[number];

export interface FieldUpdates {
  provenance?: Partial<Record<PField, unknown>>;
  plain?: Partial<Record<PlainField, boolean>>;
}

/**
 * Apply field updates with provenance + journalling. `source` is derived from
 * the editor's role (dealer | oem | ams). AMS edits lock the field
 * (spec Section 7.2 override rule).
 */
export async function updateLocationFields(
  locationId: string,
  updates: FieldUpdates,
  source: ProvenanceSource,
  actor: { userId: string; role: string },
): Promise<LocationWithMeta> {
  return withTransaction(async (client: PoolClient) => {
    const existing = await client.query(`SELECT * FROM location WHERE location_id = $1`, [locationId]);
    if (!existing.rowCount) throw new Error('Location not found');
    const row = existing.rows[0];
    const tenantId = row.tenant_id;
    const sets: string[] = [];
    const params: unknown[] = [];
    let p = 1;

    for (const f of PROVENANCE_FIELDS) {
      if (updates.provenance && f in updates.provenance) {
        const current = row[f] as ProvenanceField<unknown>;
        const { field, changed } = applyProvenanceWrite(
          current,
          { value: updates.provenance[f], source, updatedBy: actor.userId },
        );
        if (field === current) continue; // blocked by AMS lock
        sets.push(`${f} = $${p++}`);
        params.push(JSON.stringify(field));
        if (changed) {
          await writeJournal(
            {
              entityType: 'location',
              entityId: locationId,
              tenantId,
              action: 'update',
              field: f,
              oldValue: current.value,
              newValue: field.value,
              actorUserId: actor.userId,
              actorRole: actor.role,
            },
            client,
          );
        }
      }
    }
    for (const f of PLAIN_FIELDS) {
      if (updates.plain && f in updates.plain) {
        sets.push(`${f} = $${p++}`);
        params.push(updates.plain[f]);
        await writeJournal(
          {
            entityType: 'location',
            entityId: locationId,
            tenantId,
            action: 'update',
            field: f,
            oldValue: row[f],
            newValue: updates.plain[f],
            actorUserId: actor.userId,
            actorRole: actor.role,
          },
          client,
        );
      }
    }
    if (sets.length) {
      sets.push(`updated_at = now()`);
      params.push(locationId);
      await client.query(`UPDATE location SET ${sets.join(', ')} WHERE location_id = $${p}`, params);
    }
    const updated = await client.query(
      `${SELECT} WHERE l.location_id = $1 GROUP BY l.location_id, st.stop_tow_id`,
      [locationId],
    );
    return rowToLocation(updated.rows[0]);
  });
}

export async function getLocationHistory(locationId: string) {
  const r = await pool.query(
    `SELECT * FROM journal
      WHERE (entity_type = 'location' AND entity_id = $1)
         OR (entity_type = 'stop_tow' AND entity_id = $1)
      ORDER BY occurred_at DESC, journal_id DESC LIMIT 200`,
    [locationId],
  );
  return r.rows;
}
