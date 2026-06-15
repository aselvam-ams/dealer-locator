import type { PoolClient } from 'pg';
import type { Role, StopTowAutoRule, StopTowState } from '@dealer/shared';
import { pool, withTransaction } from '../db/pool.js';
import { writeJournal } from './journal.js';

export interface StopTowActor {
  userId: string;
  role: Role;
}

/** Dealers may toggle only when the location is not OEM-locked (spec Section 10). */
export function canRoleToggle(role: Role, lockedByOem: boolean): boolean {
  if (role === 'admin' || role === 'ams_power_user' || role === 'oem_office') return true;
  if (role === 'dealer') return !lockedByOem;
  return false; // consultants / service providers cannot toggle
}

/** Only OEM Office / AMS may set the lock (spec Section 10). */
export function canRoleLock(role: Role): boolean {
  return role === 'admin' || role === 'ams_power_user' || role === 'oem_office';
}

async function readStopTow(client: PoolClient | typeof pool, locationId: string) {
  const r = await client.query(
    `SELECT st.*, l.tenant_id FROM stop_tow st
       JOIN location l ON l.location_id = st.location_id
      WHERE st.location_id = $1`,
    [locationId],
  );
  return r.rows[0] as (StopTowState & { tenant_id: string }) | undefined;
}

/** Toggle Stop Tow for one location, enforcing the lock and journalling. */
export async function setStopTow(
  locationId: string,
  opts: { enabled: boolean; reason?: string | null; autoRule?: StopTowAutoRule | null },
  actor: StopTowActor,
): Promise<StopTowState> {
  return withTransaction(async (client) => {
    const current = await readStopTow(client, locationId);
    if (!current) throw new Httpish(404, 'Location has no stop_tow row');
    if (!canRoleToggle(actor.role, current.locked_by_oem)) {
      throw new Httpish(403, 'Stop Tow is locked by OEM; dealer cannot toggle');
    }
    const updated = await client.query(
      `UPDATE stop_tow
          SET enabled = $1, reason = $2, auto_rule = $3,
              scope = 'location', set_by = $4, set_at = now()
        WHERE location_id = $5 RETURNING *`,
      [
        opts.enabled,
        opts.reason ?? null,
        opts.autoRule ? JSON.stringify(opts.autoRule) : null,
        actor.userId,
        locationId,
      ],
    );
    await writeJournal(
      {
        entityType: 'stop_tow',
        entityId: locationId,
        tenantId: current.tenant_id,
        action: 'stop_tow.set',
        field: 'enabled',
        oldValue: current.enabled,
        newValue: opts.enabled,
        actorUserId: actor.userId,
        actorRole: actor.role,
      },
      client,
    );
    return updated.rows[0];
  });
}

/** Set / clear the OEM lock (spec Section 10). */
export async function setLock(
  locationId: string,
  locked: boolean,
  actor: StopTowActor,
): Promise<StopTowState> {
  if (!canRoleLock(actor.role)) throw new Httpish(403, 'Only OEM Office / AMS can lock Stop Tow');
  return withTransaction(async (client) => {
    const current = await readStopTow(client, locationId);
    if (!current) throw new Httpish(404, 'Location has no stop_tow row');
    const updated = await client.query(
      `UPDATE stop_tow SET locked_by_oem = $1, set_by = $2, set_at = now()
        WHERE location_id = $3 RETURNING *`,
      [locked, actor.userId, locationId],
    );
    await writeJournal(
      {
        entityType: 'stop_tow',
        entityId: locationId,
        tenantId: current.tenant_id,
        action: 'stop_tow.lock',
        field: 'locked_by_oem',
        oldValue: current.locked_by_oem,
        newValue: locked,
        actorUserId: actor.userId,
        actorRole: actor.role,
      },
      client,
    );
    return updated.rows[0];
  });
}

/**
 * Bulk Stop Tow by postcode: applies to all tenant locations in that postcode,
 * each producing its own Journal entry (spec Section 10).
 */
export async function bulkByPostcode(
  tenantId: string,
  postcode: string,
  enabled: boolean,
  actor: StopTowActor,
  reason?: string | null,
): Promise<number> {
  return withTransaction(async (client) => {
    const rows = await client.query(
      `SELECT st.location_id, st.enabled, st.locked_by_oem
         FROM stop_tow st JOIN location l ON l.location_id = st.location_id
        WHERE l.tenant_id = $1 AND l.postcode = $2`,
      [tenantId, postcode],
    );
    let count = 0;
    for (const row of rows.rows) {
      if (!canRoleToggle(actor.role, row.locked_by_oem)) continue; // skip locked when dealer
      await client.query(
        `UPDATE stop_tow
            SET enabled = $1, reason = $2, scope = 'postcode-bulk', postcode = $3,
                set_by = $4, set_at = now()
          WHERE location_id = $5`,
        [enabled, reason ?? null, postcode, actor.userId, row.location_id],
      );
      await writeJournal(
        {
          entityType: 'stop_tow',
          entityId: row.location_id,
          tenantId,
          action: 'stop_tow.bulk',
          field: 'enabled',
          oldValue: row.enabled,
          newValue: enabled,
          actorUserId: actor.userId,
          actorRole: actor.role,
        },
        client,
      );
      count++;
    }
    return count;
  });
}

/**
 * Evaluate date/days auto-rules and flip enabled where due (spec Section 10).
 * Returns the number of locations flipped. Intended to run on a schedule; the
 * MVP can also invoke it on demand.
 */
export async function applyAutoRules(now: Date = new Date()): Promise<number> {
  return withTransaction(async (client) => {
    const rows = await client.query(
      `SELECT st.*, l.tenant_id FROM stop_tow st
         JOIN location l ON l.location_id = st.location_id
        WHERE st.auto_rule IS NOT NULL`,
    );
    let flipped = 0;
    for (const row of rows.rows) {
      const rule = row.auto_rule as StopTowAutoRule;
      const due =
        rule.type === 'date'
          ? new Date(String(rule.value)) <= now
          : new Date(new Date(row.set_at).getTime() + Number(rule.value) * 86400000) <= now;
      if (!due) continue;
      const newEnabled = !row.enabled;
      await client.query(
        `UPDATE stop_tow SET enabled = $1, auto_rule = NULL, set_at = now()
          WHERE location_id = $2`,
        [newEnabled, row.location_id],
      );
      await writeJournal(
        {
          entityType: 'stop_tow',
          entityId: row.location_id,
          tenantId: row.tenant_id,
          action: 'stop_tow.auto',
          field: 'enabled',
          oldValue: row.enabled,
          newValue: newEnabled,
          actorRole: 'system',
        },
        client,
      );
      flipped++;
    }
    return flipped;
  });
}

/** Lightweight carrier so routes can map a status code without a framework dep. */
export class Httpish extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
