import { pool } from '../db/pool.js';

export interface ChangeRegisterEntry {
  entity_type: string;
  entity_id: string;
  action: string;
  field: string | null;
  old_value: unknown;
  new_value: unknown;
  /** Per-change timestamp (spec FR-6 / Deone's clarification). */
  occurred_at: string;
}

export interface ChangeRegisterDelta {
  tenant_id: string;
  window_from: string | null;
  window_to: string;
  entries: ChangeRegisterEntry[];
}

/**
 * Build a Change Register delta for a tenant from the Journal within a time
 * window (spec FR-6 / Section 11). Carries per-change timestamps.
 */
export async function buildDelta(
  tenantId: string,
  since: string | null,
): Promise<ChangeRegisterDelta> {
  const windowTo = new Date().toISOString();
  const r = await pool.query(
    `SELECT entity_type, entity_id, action, field, old_value, new_value, occurred_at
       FROM journal
      WHERE tenant_id = $1
        AND entity_type IN ('location', 'stop_tow')
        AND ($2::timestamptz IS NULL OR occurred_at > $2)
        AND occurred_at <= $3
      ORDER BY occurred_at ASC`,
    [tenantId, since, windowTo],
  );
  return {
    tenant_id: tenantId,
    window_from: since,
    window_to: windowTo,
    entries: r.rows as ChangeRegisterEntry[],
  };
}
