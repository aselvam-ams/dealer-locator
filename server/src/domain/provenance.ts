import type { ProvenanceField, ProvenanceSource } from '@dealer/shared';

/** Build a provenance-wrapped field value. */
export function makeField<T>(
  value: T,
  source: ProvenanceSource,
  opts: { locked?: boolean; updatedBy?: string | null; at?: string } = {},
): ProvenanceField<T> {
  return {
    value,
    source,
    locked: opts.locked ?? false,
    updated_by: opts.updatedBy ?? null,
    updated_at: opts.at ?? new Date().toISOString(),
  };
}

/**
 * Field-level override rule (spec Section 7.2):
 *
 *  - An OEM API sync writes the OEM value only into fields where the current
 *    value is NOT an AMS-locked override (`source === 'ams' && locked`).
 *  - An AMS Power User override sets `source = 'ams', locked = true`, so
 *    subsequent OEM syncs skip it.
 *  - A Dealer self-serve edit writes `source = 'dealer'` and does not lock.
 *
 * Returns the field to persist. Pure — no I/O.
 */
export function applyProvenanceWrite<T>(
  current: ProvenanceField<T>,
  incoming: { value: T; source: ProvenanceSource; updatedBy: string | null },
  at: string = new Date().toISOString(),
): { field: ProvenanceField<T>; changed: boolean } {
  // OEM sync must never clobber an AMS-locked field.
  if (incoming.source === 'oem' && current.source === 'ams' && current.locked) {
    return { field: current, changed: false };
  }

  const locked = incoming.source === 'ams'; // AMS override locks the field
  const field: ProvenanceField<T> = {
    value: incoming.value,
    source: incoming.source,
    locked,
    updated_by: incoming.updatedBy,
    updated_at: at,
  };
  const changed = JSON.stringify(current.value) !== JSON.stringify(incoming.value);
  return { field, changed };
}
