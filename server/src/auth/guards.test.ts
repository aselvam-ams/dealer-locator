import { describe, it, expect } from 'vitest';
import type { AuthUser } from '@dealer/shared';
import { canAccessTenant } from './guards.js';

const base: Omit<AuthUser, 'role'> = {
  user_id: 'u',
  email: 'e@x',
  tenant_id: null,
  entitlements: [],
  location_id: null,
};

describe('tenant scoping (spec FR-1)', () => {
  it('admin / power user are cross-tenant', () => {
    expect(canAccessTenant({ ...base, role: 'admin' }, 'T1')).toBe(true);
    expect(canAccessTenant({ ...base, role: 'ams_power_user' }, 'T1')).toBe(true);
  });

  it('consultant limited to entitlements', () => {
    const u: AuthUser = { ...base, role: 'consultant', entitlements: ['T1', 'T2'] };
    expect(canAccessTenant(u, 'T1')).toBe(true);
    expect(canAccessTenant(u, 'T3')).toBe(false);
  });

  it('service provider limited to entitlements', () => {
    const u: AuthUser = { ...base, role: 'service_provider', entitlements: ['T1'] };
    expect(canAccessTenant(u, 'T1')).toBe(true);
    expect(canAccessTenant(u, 'T2')).toBe(false);
  });

  it('OEM Office / Dealer bound to their own tenant', () => {
    const oem: AuthUser = { ...base, role: 'oem_office', tenant_id: 'T1' };
    expect(canAccessTenant(oem, 'T1')).toBe(true);
    expect(canAccessTenant(oem, 'T2')).toBe(false);
    const dealer: AuthUser = { ...base, role: 'dealer', tenant_id: 'T1' };
    expect(canAccessTenant(dealer, 'T1')).toBe(true);
    expect(canAccessTenant(dealer, 'T2')).toBe(false);
  });
});
