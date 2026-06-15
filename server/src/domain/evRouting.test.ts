import { describe, it, expect } from 'vitest';
import { isEvEligible } from './evRouting.js';

describe('EV-certified routing (spec FR-12)', () => {
  it('high-voltage fault → only certified dealers eligible', () => {
    expect(isEvEligible(true, 'yes')).toBe(true);
    expect(isEvEligible(false, 'yes')).toBe(false);
  });

  it('non high-voltage fault → any dealer eligible', () => {
    expect(isEvEligible(true, 'no')).toBe(true);
    expect(isEvEligible(false, 'no')).toBe(true);
  });

  it('unknown defaults to the safe path (certified only)', () => {
    expect(isEvEligible(true, 'unknown')).toBe(true);
    expect(isEvEligible(false, 'unknown')).toBe(false);
  });
});
