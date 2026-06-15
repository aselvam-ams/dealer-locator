import type { Role } from '@dealer/shared';

/** Capabilities used to gate routes (spec Section 5). */
export type Capability =
  | 'search' // proximity / postcode search + dealer detail
  | 'manage_own_location' // dealer self-serve
  | 'manage_tenant_dealers' // OEM Office: own tenant
  | 'set_stop_tow'
  | 'lock_stop_tow'
  | 'import_export'
  | 'oem_ingest'
  | 'change_register'
  | 'manage_users'
  | 'manage_tenants';

const MATRIX: Record<Role, Capability[]> = {
  admin: [
    'search', 'manage_own_location', 'manage_tenant_dealers', 'set_stop_tow',
    'lock_stop_tow', 'import_export', 'oem_ingest', 'change_register',
    'manage_users', 'manage_tenants',
  ],
  ams_power_user: [
    'search', 'manage_tenant_dealers', 'set_stop_tow', 'lock_stop_tow',
    'import_export', 'oem_ingest', 'change_register', 'manage_users',
  ],
  consultant: ['search'],
  service_provider: ['search'],
  oem_office: [
    'search', 'manage_tenant_dealers', 'set_stop_tow', 'lock_stop_tow',
    'import_export', 'manage_users',
  ],
  dealer: ['search', 'manage_own_location', 'set_stop_tow'],
};

export function hasCapability(role: Role, cap: Capability): boolean {
  return MATRIX[role].includes(cap);
}
