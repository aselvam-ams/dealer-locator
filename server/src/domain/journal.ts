import type { PoolClient } from 'pg';
import { pool } from '../db/pool.js';

export interface JournalEntry {
  entityType: string;
  entityId: string;
  tenantId?: string | null;
  action: string;
  field?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
  actorUserId?: string | null;
  actorRole?: string | null;
  /** Explicit event time; defaults to now(). Used by Change Register per-change timestamps. */
  occurredAt?: string;
}

type Queryable = Pick<PoolClient, 'query'> | typeof pool;

/** Append a row to the immutable Journal (spec Section 7.7). */
export async function writeJournal(entry: JournalEntry, db: Queryable = pool) {
  await db.query(
    `INSERT INTO journal
       (entity_type, entity_id, tenant_id, action, field, old_value, new_value,
        actor_user_id, actor_role, occurred_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, COALESCE($10::timestamptz, now()))`,
    [
      entry.entityType,
      entry.entityId,
      entry.tenantId ?? null,
      entry.action,
      entry.field ?? null,
      entry.oldValue === undefined ? null : JSON.stringify(entry.oldValue),
      entry.newValue === undefined ? null : JSON.stringify(entry.newValue),
      entry.actorUserId ?? null,
      entry.actorRole ?? null,
      entry.occurredAt ?? null,
    ],
  );
}
