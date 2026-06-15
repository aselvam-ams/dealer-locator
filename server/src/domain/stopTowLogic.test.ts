import { describe, it, expect } from 'vitest';
import { canRoleToggle, canRoleLock } from './stopTow.js';

describe('Stop Tow lock logic (spec Section 10)', () => {
  it('OEM Office and AMS can always toggle', () => {
    for (const role of ['admin', 'ams_power_user', 'oem_office'] as const) {
      expect(canRoleToggle(role, true)).toBe(true);
      expect(canRoleToggle(role, false)).toBe(true);
    }
  });

  it('Dealer can toggle only when not OEM-locked', () => {
    expect(canRoleToggle('dealer', false)).toBe(true);
    expect(canRoleToggle('dealer', true)).toBe(false);
  });

  it('Consultants / providers can never toggle', () => {
    expect(canRoleToggle('consultant', false)).toBe(false);
    expect(canRoleToggle('service_provider', false)).toBe(false);
  });

  it('Only OEM Office / AMS can set the lock', () => {
    expect(canRoleLock('oem_office')).toBe(true);
    expect(canRoleLock('ams_power_user')).toBe(true);
    expect(canRoleLock('dealer')).toBe(false);
    expect(canRoleLock('consultant')).toBe(false);
  });
});
