-- Dealer Locator 2025 (BR-033) schema — spec Section 7.
-- Applied idempotently by migrate.ts.

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- gen_random_uuid()

-- 7.1 Tenant -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tenant (
  tenant_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,
  country          TEXT NOT NULL DEFAULT 'AU' CHECK (country IN ('AU', 'NZ')),
  active           BOOLEAN NOT NULL DEFAULT TRUE,
  integration_mode TEXT NOT NULL DEFAULT 'manual'
                     CHECK (integration_mode IN ('api', 'sftp', 'manual')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7.3 LocationType -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS location_type (
  location_type_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenant(tenant_id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  description      TEXT,
  UNIQUE (tenant_id, name)
);

-- 7.2 Location ---------------------------------------------------------------
-- Overridable fields carry provenance JSONB: {value, source, locked, updated_by, updated_at}
CREATE TABLE IF NOT EXISTS location (
  location_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenant(tenant_id) ON DELETE CASCADE,
  external_ref     TEXT NOT NULL,
  dealer_group_id  TEXT,

  -- provenance-wrapped fields
  name             JSONB NOT NULL,
  address          JSONB NOT NULL,
  phone            JSONB NOT NULL,
  email            JSONB NOT NULL,
  opening_hours    JSONB NOT NULL,
  ev_certified     JSONB NOT NULL,
  service_capabilities JSONB NOT NULL,

  -- plain fields
  suburb           TEXT NOT NULL,
  state            TEXT NOT NULL,
  postcode         TEXT NOT NULL,
  country          TEXT NOT NULL DEFAULT 'AU' CHECK (country IN ('AU', 'NZ')),
  latitude         DOUBLE PRECISION NOT NULL,
  longitude        DOUBLE PRECISION NOT NULL,
  geom             GEOGRAPHY(Point, 4326) NOT NULL,

  is_sales_only    BOOLEAN NOT NULL DEFAULT FALSE,
  is_hidden        BOOLEAN NOT NULL DEFAULT FALSE,
  tyre_stock       JSONB, -- Phase 2-ready (FR-14)

  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (tenant_id, external_ref)
);

CREATE INDEX IF NOT EXISTS location_geom_gist ON location USING GIST (geom);
CREATE INDEX IF NOT EXISTS location_tenant_idx ON location (tenant_id);
CREATE INDEX IF NOT EXISTS location_postcode_idx ON location (tenant_id, postcode);

-- location <-> location_type (many-to-many, FR-2)
CREATE TABLE IF NOT EXISTS location_location_type (
  location_id      UUID NOT NULL REFERENCES location(location_id) ON DELETE CASCADE,
  location_type_id UUID NOT NULL REFERENCES location_type(location_type_id) ON DELETE CASCADE,
  PRIMARY KEY (location_id, location_type_id)
);

-- 7.4 StopTow ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stop_tow (
  stop_tow_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id   UUID NOT NULL UNIQUE REFERENCES location(location_id) ON DELETE CASCADE,
  enabled       BOOLEAN NOT NULL DEFAULT FALSE,
  scope         TEXT NOT NULL DEFAULT 'location'
                  CHECK (scope IN ('location', 'postcode-bulk')),
  postcode      TEXT,
  auto_rule     JSONB,
  locked_by_oem BOOLEAN NOT NULL DEFAULT FALSE,
  set_by        UUID,
  set_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  reason        TEXT
);

-- 7.5 AccessRestriction ------------------------------------------------------
CREATE TABLE IF NOT EXISTS access_restriction (
  restriction_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id      UUID NOT NULL REFERENCES location(location_id) ON DELETE CASCADE,
  type             TEXT NOT NULL CHECK (type IN
                     ('roadworks','building','charging-station-not-truck-accessible','other')),
  description      TEXT NOT NULL,
  alternate_option TEXT,
  active           BOOLEAN NOT NULL DEFAULT TRUE,
  valid_from       TIMESTAMPTZ,
  valid_to         TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS restriction_location_idx ON access_restriction (location_id);

-- 7.6 ChargingStation (cross-tenant) -----------------------------------------
CREATE TABLE IF NOT EXISTS charging_station (
  station_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider         TEXT NOT NULL CHECK (provider IN ('Chargefox', 'PlugShare')),
  external_ref     TEXT NOT NULL,
  name             TEXT NOT NULL,
  latitude         DOUBLE PRECISION NOT NULL,
  longitude        DOUBLE PRECISION NOT NULL,
  geom             GEOGRAPHY(Point, 4326) NOT NULL,
  truck_accessible BOOLEAN,
  last_synced_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, external_ref)
);
CREATE INDEX IF NOT EXISTS charging_geom_gist ON charging_station USING GIST (geom);

-- 7.7 Journal (append-only audit log) ----------------------------------------
CREATE TABLE IF NOT EXISTS journal (
  journal_id    BIGSERIAL PRIMARY KEY,
  entity_type   TEXT NOT NULL,
  entity_id     TEXT NOT NULL,
  tenant_id     UUID,
  action        TEXT NOT NULL,
  field         TEXT,
  old_value     JSONB,
  new_value     JSONB,
  actor_user_id UUID,
  actor_role    TEXT,
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS journal_entity_idx ON journal (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS journal_tenant_time_idx ON journal (tenant_id, occurred_at);

-- 7.8 ChangeRegisterRun ------------------------------------------------------
CREATE TABLE IF NOT EXISTS change_register_run (
  run_id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_or_club    TEXT NOT NULL,
  generated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  delta_window_from TIMESTAMPTZ,
  delta_window_to   TIMESTAMPTZ,
  file_path         TEXT,
  delivery          TEXT NOT NULL CHECK (delivery IN ('sftp', 'api')),
  status            TEXT NOT NULL,
  record_count      INTEGER NOT NULL DEFAULT 0
);

-- 7.9 User / Role / Entitlement ----------------------------------------------
CREATE TABLE IF NOT EXISTS app_user (
  user_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN
                  ('admin','ams_power_user','consultant','service_provider','oem_office','dealer')),
  tenant_id     UUID REFERENCES tenant(tenant_id) ON DELETE SET NULL,
  location_id   UUID REFERENCES location(location_id) ON DELETE SET NULL,
  entitlements  UUID[] NOT NULL DEFAULT '{}',
  active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_by    UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
