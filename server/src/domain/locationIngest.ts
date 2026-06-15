import type { PoolClient } from 'pg';
import type { ProvenanceField, ProvenanceSource } from '@dealer/shared';
import type { CanonicalLocationInput } from '../adapters/oemIngest/index.js';
import { makeField, applyProvenanceWrite } from './provenance.js';
import { writeJournal } from './journal.js';

const OVERRIDABLE = [
  'name',
  'address',
  'phone',
  'email',
  'opening_hours',
  'ev_certified',
  'service_capabilities',
] as const;

type OverridableField = (typeof OVERRIDABLE)[number];

/**
 * Idempotent upsert of a canonical location on (tenant_id, external_ref),
 * respecting field-level provenance (spec FR-3 / Section 7.2). Each changed
 * provenance field writes a Journal row.
 */
export async function upsertCanonical(
  client: PoolClient,
  tenantId: string,
  input: CanonicalLocationInput,
  source: ProvenanceSource,
  actorUserId: string | null,
  actorRole: string | null,
): Promise<{ locationId: string; created: boolean }> {
  const at = new Date().toISOString();
  const existing = await client.query(
    `SELECT location_id, name, address, phone, email, opening_hours,
            ev_certified, service_capabilities
       FROM location WHERE tenant_id = $1 AND external_ref = $2`,
    [tenantId, input.external_ref],
  );

  const incomingValues: Record<OverridableField, unknown> = {
    name: input.name,
    address: input.address,
    phone: input.phone,
    email: input.email,
    opening_hours: input.opening_hours,
    ev_certified: input.ev_certified,
    service_capabilities: input.service_capabilities,
  };

  if (existing.rowCount === 0) {
    const fields = Object.fromEntries(
      OVERRIDABLE.map((f) => [f, makeField(incomingValues[f], source, { updatedBy: actorUserId, at })]),
    ) as Record<OverridableField, ProvenanceField<unknown>>;

    const inserted = await client.query(
      `INSERT INTO location
         (tenant_id, external_ref, dealer_group_id, name, address, phone, email,
          opening_hours, ev_certified, service_capabilities,
          suburb, state, postcode, country, latitude, longitude, geom, is_sales_only)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'AU',$14,$15,
               ST_SetSRID(ST_MakePoint($15,$14),4326)::geography,$16)
       RETURNING location_id`,
      [
        tenantId,
        input.external_ref,
        input.dealer_group_id ?? null,
        JSON.stringify(fields.name),
        JSON.stringify(fields.address),
        JSON.stringify(fields.phone),
        JSON.stringify(fields.email),
        JSON.stringify(fields.opening_hours),
        JSON.stringify(fields.ev_certified),
        JSON.stringify(fields.service_capabilities),
        input.suburb,
        input.state,
        input.postcode,
        input.latitude,
        input.longitude,
        input.is_sales_only ?? false,
      ],
    );
    const locationId = inserted.rows[0].location_id as string;
    // ensure a stop_tow row exists
    await client.query(
      `INSERT INTO stop_tow (location_id, enabled) VALUES ($1, FALSE)
         ON CONFLICT (location_id) DO NOTHING`,
      [locationId],
    );
    await writeJournal(
      {
        entityType: 'location',
        entityId: locationId,
        tenantId,
        action: 'create',
        newValue: { external_ref: input.external_ref, source },
        actorUserId,
        actorRole,
        occurredAt: at,
      },
      client,
    );
    return { locationId, created: true };
  }

  const row = existing.rows[0];
  const locationId = row.location_id as string;
  const updates: string[] = [];
  const params: unknown[] = [];
  let p = 1;

  for (const f of OVERRIDABLE) {
    const current = row[f] as ProvenanceField<unknown>;
    const { field, changed } = applyProvenanceWrite(
      current,
      { value: incomingValues[f], source, updatedBy: actorUserId },
      at,
    );
    // Skip when an OEM sync is blocked by an AMS lock (field unchanged identity).
    if (field === current) continue;
    if (!changed && field.source === current.source) continue;
    updates.push(`${f} = $${p++}`);
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
          actorUserId,
          actorRole,
          occurredAt: at,
        },
        client,
      );
    }
  }

  // Always refresh geo + plain fields (these are not provenance-tracked).
  updates.push(`suburb = $${p++}`); params.push(input.suburb);
  updates.push(`state = $${p++}`); params.push(input.state);
  updates.push(`postcode = $${p++}`); params.push(input.postcode);
  updates.push(`latitude = $${p++}`); params.push(input.latitude);
  updates.push(`longitude = $${p++}`); params.push(input.longitude);
  updates.push(`geom = ST_SetSRID(ST_MakePoint($${p}, $${p + 1}),4326)::geography`);
  params.push(input.longitude, input.latitude); p += 2;
  updates.push(`updated_at = now()`);

  params.push(locationId);
  await client.query(
    `UPDATE location SET ${updates.join(', ')} WHERE location_id = $${p}`,
    params,
  );
  return { locationId, created: false };
}
