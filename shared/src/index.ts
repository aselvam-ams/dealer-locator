// Shared DTO / domain types for Dealer Locator 2025 (BR-033).
// Imported by both the server and the web app.

// ---------------------------------------------------------------------------
// Roles & RBAC (spec Section 5)
// ---------------------------------------------------------------------------
export type Role =
  | 'admin' // AMS bootstrap, full system
  | 'ams_power_user' // cross-tenant maintenance, import/export, reports
  | 'consultant' // NAC: search & view only
  | 'service_provider' // entitlement-scoped read, off by default
  | 'oem_office' // manage own tenant's dealers, lock stop-tow
  | 'dealer'; // self-serve on own location only

export const ALL_ROLES: Role[] = [
  'admin',
  'ams_power_user',
  'consultant',
  'service_provider',
  'oem_office',
  'dealer',
];

// ---------------------------------------------------------------------------
// Capabilities (service capability labelling — spec FR-12)
// ---------------------------------------------------------------------------
export type ServiceCapability =
  | 'HEV'
  | 'Hybrid'
  | 'BEV'
  | 'ICE'
  | 'Auto24'
  | 'Metro'
  | 'Tyre';

export const ALL_CAPABILITIES: ServiceCapability[] = [
  'HEV',
  'Hybrid',
  'BEV',
  'ICE',
  'Auto24',
  'Metro',
  'Tyre',
];

// ---------------------------------------------------------------------------
// Provenance (spec Section 7.2 — field-level OEM-base / AMS-override)
// ---------------------------------------------------------------------------
export type ProvenanceSource = 'oem' | 'ams' | 'dealer';

export interface ProvenanceField<T> {
  value: T;
  source: ProvenanceSource;
  locked: boolean;
  updated_by: string | null;
  updated_at: string; // ISO
}

// ---------------------------------------------------------------------------
// Opening hours (structured per-day, with timezone — spec Section 7.2)
// ---------------------------------------------------------------------------
export type Weekday =
  | 'mon'
  | 'tue'
  | 'wed'
  | 'thu'
  | 'fri'
  | 'sat'
  | 'sun';

export interface DayHours {
  /** Local "HH:MM" open time, or null when closed all day. */
  open: string | null;
  /** Local "HH:MM" close time, or null when closed all day. */
  close: string | null;
}

export interface OpeningHours {
  /** IANA timezone, e.g. "Australia/Sydney". */
  timezone: string;
  days: Record<Weekday, DayHours>;
}

// ---------------------------------------------------------------------------
// Tenant
// ---------------------------------------------------------------------------
export type IntegrationMode = 'api' | 'sftp' | 'manual';

export interface Tenant {
  tenant_id: string;
  name: string;
  country: 'AU' | 'NZ';
  active: boolean;
  integration_mode: IntegrationMode;
  created_at: string;
  updated_at: string;
}

export interface LocationType {
  location_type_id: string;
  tenant_id: string;
  name: string;
  description: string | null;
}

// ---------------------------------------------------------------------------
// Access restriction (spec Section 7.5)
// ---------------------------------------------------------------------------
export type RestrictionType =
  | 'roadworks'
  | 'building'
  | 'charging-station-not-truck-accessible'
  | 'other';

export interface AccessRestriction {
  restriction_id: string;
  location_id: string;
  type: RestrictionType;
  description: string;
  alternate_option: string | null;
  active: boolean;
  valid_from: string | null;
  valid_to: string | null;
}

// ---------------------------------------------------------------------------
// Stop Tow (spec Section 7.4 / Section 10)
// ---------------------------------------------------------------------------
export type StopTowScope = 'location' | 'postcode-bulk';
export type AutoRuleType = 'date' | 'days';

export interface StopTowAutoRule {
  type: AutoRuleType;
  value: string | number; // ISO date for 'date', N for 'days'
}

export interface StopTowState {
  stop_tow_id: string;
  location_id: string;
  enabled: boolean;
  scope: StopTowScope;
  postcode: string | null;
  auto_rule: StopTowAutoRule | null;
  locked_by_oem: boolean;
  set_by: string | null;
  set_at: string;
  reason: string | null;
}

// ---------------------------------------------------------------------------
// Location (spec Section 7.2)
// ---------------------------------------------------------------------------
export interface Location {
  location_id: string;
  tenant_id: string;
  external_ref: string;
  dealer_group_id: string | null;

  name: ProvenanceField<string>;
  address: ProvenanceField<string>;
  suburb: string;
  state: string;
  postcode: string;
  country: 'AU' | 'NZ';
  latitude: number;
  longitude: number;

  phone: ProvenanceField<string>;
  email: ProvenanceField<string>;
  opening_hours: ProvenanceField<OpeningHours>;

  location_type_ids: string[];
  is_sales_only: boolean;
  is_hidden: boolean;

  ev_certified: ProvenanceField<boolean>;
  service_capabilities: ProvenanceField<ServiceCapability[]>;
  tyre_stock: unknown | null; // Phase 2-ready (FR-14)

  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Charging station (spec Section 7.6 — cross-tenant)
// ---------------------------------------------------------------------------
export type ChargingProvider = 'Chargefox' | 'PlugShare';

export interface ChargingStation {
  station_id: string;
  provider: ChargingProvider;
  external_ref: string;
  name: string;
  latitude: number;
  longitude: number;
  truck_accessible: boolean | null;
  last_synced_at: string;
}

// ---------------------------------------------------------------------------
// Search (spec FR-7, FR-8, FR-12)
// ---------------------------------------------------------------------------
export type HighVoltageFault = 'yes' | 'no' | 'unknown';

export interface SearchRequest {
  tenant_id: string;
  /** Incident coordinates, or use postcode below. */
  latitude?: number;
  longitude?: number;
  /** Postcode search away from the incident (FR-8a). */
  postcode?: string;
  /** Free-text address (geocoded by the mock geocoder). */
  address?: string;
  high_voltage_fault: HighVoltageFault;
  location_type_id?: string;
  exclude_sales_only?: boolean;
  /** When true, apply tow-acceptance filters (open now + not stop-towed). */
  tow_context?: boolean;
}

export interface SearchResultItem {
  location_id: string;
  name: string;
  address: string;
  suburb: string;
  state: string;
  postcode: string;
  phone: string;
  latitude: number;
  longitude: number;
  distance_km: number;
  drive_time_minutes: number;
  ev_certified: boolean;
  service_capabilities: ServiceCapability[];
  stop_tow: boolean;
  restrictions: AccessRestriction[];
  is_sales_only: boolean;
}

export interface SearchResponse {
  incident: { latitude: number; longitude: number };
  results: SearchResultItem[];
  charging_stations: Array<ChargingStation & { distance_km: number }>;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
export interface AuthUser {
  user_id: string;
  email: string;
  role: Role;
  tenant_id: string | null;
  entitlements: string[];
  location_id: string | null;
}

export interface LoginResponse {
  token: string;
  user: AuthUser;
}
