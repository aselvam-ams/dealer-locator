import type { HighVoltageFault } from '@dealer/shared';

/**
 * EV-certified routing rule (spec FR-12):
 *
 *  - A BEV/HEV with a HIGH-VOLTAGE fault may only go to an EV-certified dealer.
 *  - If the fault is NOT high-voltage related, any dealer is eligible.
 *  - The consultant supplies the high-voltage flag at call time. "Unknown"
 *    defaults to the SAFE path (certified only).
 *
 * Returns true when this dealer is eligible for the given fault context.
 */
export function isEvEligible(
  evCertified: boolean,
  highVoltageFault: HighVoltageFault,
): boolean {
  const requiresCertified =
    highVoltageFault === 'yes' || highVoltageFault === 'unknown';
  if (!requiresCertified) return true;
  return evCertified;
}
