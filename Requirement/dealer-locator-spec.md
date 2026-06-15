# Dealer Locator 2025 — Build Specification

**Reference:** BR-033 Dealer Locator 2025
**Document type:** Build-ready requirements specification (for Claude Code)
**Owner:** AMS Data & Integration
**Status:** Draft for build kickoff
**Currency:** All cost figures AUD

---

## 1. Purpose

Replace the legacy on-premise Dealer Locator (built July 2014) and the fragmented Salesforce-for-Ford-only setup with a single multitenant web application. The application gives Call Centre consultants (NAC), Clubs, and approved Service Providers a fast, accurate way to find the nearest dealer that can actually accept a tow at the moment of the breakdown, with first-class support for EV-specific routing (EV-certified dealers and Chargefox charging stations).

The system must reduce call handling time, minimise re-tows (vehicle sent to a dealer that cannot accept it), and lower the maintenance burden of the current multi-system arrangement.

---

## 2. Background and problem statement

Today, dealer data lives in several places: the on-premise Dealer Locator platform (Extranet) for most clients, Salesforce for Ford only (via a "DACH"/Dachshund process), and a Mazda API feed. Clubs receive a "Change Register" file via SFTP and load it into their own ICAD systems. There is no single source of truth, no consistent EV handling, and no real-time view of whether a dealer can currently accept a tow.

The growth of EVs introduces two hard constraints the legacy system cannot express:

1. Battery electric (BEV) and hybrid (HEV) vehicles can only be towed to dealers certified to work on high-voltage components, **unless** the fault is unrelated to the high-voltage system, in which case any dealer is acceptable.
2. EV drivers need visibility of nearby charging infrastructure (Chargefox / PlugShare).

---

## 3. Goals and success criteria

| Goal | Measure of success |
|---|---|
| Single source of dealer data | All clients served from one platform; Extranet and Ford-Salesforce locator retired |
| Correct dealer first time | Re-tow rate attributable to "dealer could not accept" trends down |
| Faster calls | Consultant can return the 5 nearest eligible dealers with drive time in a single search |
| EV-safe routing | No BEV/HEV high-voltage fault routed to a non-certified dealer |
| Lower maintenance | Club updates flow via API where adopted, SFTP retained as fallback |

---

## 4. Scope

### 4.1 In scope (Phase 1)

1. Multitenant data store keyed by OEM/Client tenant.
2. Multiple location types per program (e.g. Mitsubishi variant handling).
3. Inbound sync from client dealer systems via API (Mazda-style), carrying opening hours and contact numbers.
4. Authenticated access for Clubs and NAC consultants to dealer locator data (fields per Appendix A).
5. Optional authenticated access for selected Service Providers (e.g. Accident Management, Alternative Roadside Support such as Nationwide Group).
6. Club integration via **both** outbound SFTP (Change Register file) **and** API, to synchronise dealer information into Club CRM/ICAD systems.
7. Proximity search returning up to five nearest eligible dealers with Google-derived drive time and distance in km, filtered to dealers that can accept a tow / provide service at that time.
8. Search by client, location type, address, and vehicle classification, including postcode search away from the incident, geofenced distance display, per-program visibility, AU-only results (NZ Phase 2), and optional exclusion of sales-only offices.
9. Display of nearest EV charging stations (Chargefox / PlugShare) across all clients, via periodic data sync.
10. Configurable Stop Tow status per location and in bulk by postcode, with date/duration-based auto enable/disable, OEM and Dealer self-serve, OEM head-office lock override, and full change history.
11. Stop Tow and access-restriction labelling, alternate-option display, and a hide-from-search control.
12. Service-capability labelling (HEV, Hybrid, EV, Auto 24 / metro) including the EV-Certified flag and the high-voltage routing logic.
13. Excel-template import/export (bulk upload, manual edit, delete) restricted to power users, with scheduled report generation/export.
14. Tyre-locator readiness (capability surfaced in data model; full search is Phase 1 stretch / Phase 2).

### 4.2 Out of scope (Phase 1)

1. Anything not related to dealer location or capability.
2. Integration with systems not named in these requirements.
3. Native mobile application (web responsive only). *Note: flagged for review per BR-033 reviewer comment; see Section 16.*
4. Post-deployment performance monitoring/optimisation as a separate workstream.
5. Disaster recovery / BCP runbook as a separate deliverable. *Note: also flagged by reviewer; the application will be built DR-capable (stateless app tier, managed DB with PITR), but the operational DR runbook is a separate piece of work. See Section 16.*

### 4.3 Phase 2 (capture now, build later)

See Section 15.

---

## 5. Personas and role-based access control

Authentication is required for **every** user. No anonymous access. SSO is deferred to Phase 2; Phase 1 uses application-managed credentials. No MFA in Phase 1.

| Role | Provisioned by | Primary capability |
|---|---|---|
| **Admin** | AMS (bootstrap) | Full system config, tenant management, all data, all users, integration settings |
| **AMS Power User** | Admin / Power User | Cross-tenant data maintenance, import/export, override of OEM data, report scheduling, account creation |
| **Consultant (NAC)** | AMS Admin / Power User | Search and view only; proximity search; sees Stop Tow, restrictions, EV certification, charging stations |
| **Service Provider** | AMS Admin / Power User | Search and view, scoped to tenants/programs they are entitled to; optional, off by default |
| **OEM Office (Head Office)** | AMS Admin / Power User | Manage own tenant's dealers; create Dealer accounts; set Stop Tow; set Stop Tow **lock**; bulk import own data |
| **Dealer** | OEM Office (for their tenant) | Self-serve on own location only: Stop Tow toggle (unless locked), opening hours, access restrictions, contact info |

### 5.1 Account provisioning rules

- AMS Admin and AMS Power User can create any account.
- OEM Office can create Dealer accounts **within their own tenant only**.
- A Dealer account is bound to one location (or one dealer group, see open item in Section 16).

### 5.2 Tenancy boundary

A **tenant = an OEM/Client** (Ford, Mazda, Mitsubishi, etc.) for Phase 1. All data access is scoped by tenant. Consultants and Service Providers may be entitled to multiple tenants; OEM Office and Dealer users are bound to exactly one. NZ will be modelled as a new (inactive) tenant in Phase 2.

---

## 6. System architecture

### 6.1 Shape

A **standalone web application**, hosted by AMS, that owns the dealer data and exposes:

- A web UI (responsive) for direct login by all roles.
- An **embed mode**: Salesforce embeds the locator via iframe. Salesforce is a consumer, not the host. The application authenticates the user independently even when embedded.
- A **query API** that Salesforce (and Clubs, Phase 1) can call.

```
                        ┌─────────────────────────────────────┐
   OEM dealer systems   │         Dealer Locator (AMS)         │
   (Mazda-style API) ──►│                                      │
                        │  ┌────────────┐   ┌───────────────┐  │
   Chargefox/PlugShare  │  │  Ingest /  │   │   Web UI       │  │◄── Browser (all roles)
   (periodic sync) ────►│  │  Sync      │   │  (responsive)  │  │
                        │  └─────┬──────┘   └───────┬───────┘  │◄── Salesforce iframe embed
                        │        │                  │          │
                        │  ┌─────▼──────────────────▼───────┐  │
                        │  │   App / API tier (RBAC)         │  │──► Query API ──► Salesforce
                        │  └─────────────┬──────────────────┘  │                  Clubs (API)
                        │        ┌───────▼────────┐            │
                        │        │ PostgreSQL +    │            │
                        │        │ PostGIS         │            │
                        │        └────────────────┘            │
                        │  ┌────────────────────────────────┐  │
                        │  │ Change Register generator       │──┼──► SFTP (RACV, NRMA, others)
                        │  └────────────────────────────────┘  │
                        └─────────────────────────────────────┘
                                       │
                                  Google Maps Platform
                            (Routes API: drive time + traffic)
```

### 6.2 Proposed stack

This is a recommendation, not a constraint. It is chosen to fit AMS's existing Azure footprint and to make the geospatial search cheap.

| Layer | Choice | Why |
|---|---|---|
| Frontend | React + TypeScript | Embeddable, responsive, mature mapping libs |
| Backend | Node.js + TypeScript (or Python/FastAPI) | Matches team skills; clean API layer |
| Database | PostgreSQL + **PostGIS** | Native geospatial indexing for nearest-N before any Google call |
| Auth | App-managed (JWT/session) Phase 1; Entra ID SSO Phase 2 | SSO deferred per decision |
| Hosting | Azure (App Service / Container Apps) | Consistent with AMS Azure iPaaS estate |
| Mapping | Google Maps Platform (Routes API, Maps JS) | Selected decision |
| File transfer | SFTP out (Change Register); SFTP/API in | Both required |

### 6.3 Salesforce embed contract

- Salesforce embeds via iframe pointing at the locator's embed route.
- The locator authenticates the user (Phase 1: its own login; Phase 2: SSO so the Salesforce session can flow through).
- The locator exposes a read query API (search, dealer detail) that Salesforce can also call server-to-server for non-UI use.
- CORS / frame-ancestors must be restricted to the Salesforce org domain(s).

---

## 7. Data model

Core entities. Field-level provenance is built in to support OEM-base / AMS-override.

### 7.1 Tenant
`tenant_id`, `name` (e.g. Mazda), `country` (AU; NZ reserved Phase 2), `active` (bool), `integration_mode` (api | sftp | manual), timestamps.

### 7.2 Location (Dealer / Service Centre)
- Identity: `location_id`, `tenant_id`, `external_ref` (OEM's own id), `dealer_group_id` (nullable).
- Address & geo: `address`, `suburb`, `state`, `postcode`, `country`, `latitude`, `longitude` (PostGIS `geography(Point)`), `geom` indexed (GIST).
- Contact: `phone`, `email`, `opening_hours` (structured, per-day, with timezone).
- Classification: `location_type` (FK, supports multiple types per program), `is_sales_only` (bool), `is_hidden` (bool).
- Capabilities: `ev_certified` (bool), `service_capabilities` (set: HEV, Hybrid, BEV, ICE, Auto24, Metro, Tyre...), `tyre_stock` (Phase 2-ready, structured).
- Tow acceptance: derived at query time from `opening_hours`, `stop_tow_state`, and `access_restrictions`.
- Provenance per overridable field: each of `phone`, `email`, `opening_hours`, `address`, `service_capabilities`, `ev_certified` carries `{value, source: oem|ams|dealer, locked: bool, updated_by, updated_at}`.

> **Override rule:** OEM API sync writes the OEM value only into fields where `source != ams-locked`. An AMS Power User override sets `source = ams`, `locked = true` for that field, so subsequent OEM syncs skip it. This is field-level, so an AMS edit to opening hours does not freeze the phone number.

### 7.3 LocationType
`location_type_id`, `tenant_id`, `name`, `description`. Supports e.g. Mitsubishi variants where not all dealers handle all types.

### 7.4 StopTow
`stop_tow_id`, `location_id`, `enabled` (bool), `scope` (location | postcode-bulk), `postcode` (nullable, for bulk), `auto_rule` (`{type: date|days, value}`), `locked_by_oem` (bool), `set_by`, `set_at`, `reason` (nullable).

> **Stop Tow control rules:**
> - OEM Office and Dealer can both toggle Stop Tow for a location.
> - The system records who made the **last** update (`set_by`, `set_at`).
> - OEM Office can set `locked_by_oem = true` via a checkbox on the OEM dealer-management page. When locked, the Dealer can no longer toggle it; only OEM Office / AMS can.
> - Auto-rules can enable/disable on a specific date or after N days.
> - Bulk-by-postcode applies to all locations in that postcode within the tenant.

### 7.5 AccessRestriction
`restriction_id`, `location_id`, `type` (roadworks | building | charging-station-not-truck-accessible | other), `description`, `alternate_option` (free text / linked location), `active`, `valid_from`, `valid_to`.

### 7.6 ChargingStation (synced)
`station_id`, `provider` (Chargefox | PlugShare), `external_ref`, `name`, `latitude`, `longitude` (PostGIS), `truck_accessible` (bool, where known), `last_synced_at`. Cross-tenant (visible to all clients).

### 7.7 Journal (audit log, append-only)
`journal_id`, `entity_type`, `entity_id`, `tenant_id`, `action`, `field`, `old_value`, `new_value`, `actor_user_id`, `actor_role`, `occurred_at`. Covers Stop Tow history and all dealer locator changes.

### 7.8 ChangeRegisterRun (outbound delta tracking)
`run_id`, `tenant_or_club`, `generated_at`, `delta_window_from`, `delta_window_to`, `file_path`, `delivery` (sftp | api), `status`, `record_count`.

### 7.9 User / Role / Entitlement
`user_id`, `email`, `role`, `tenant_id` (nullable for cross-tenant roles), `entitlements` (set of tenant_ids for consultants/providers), `active`, `created_by`.

---

## 8. Functional requirements (mapped to BR-033)

Each requirement below carries its BR-033 number for traceability.

### FR-1 Multitenant (BR #1)
All data partitioned by `tenant_id`. Every query is tenant-scoped by the caller's entitlements. No cross-tenant leakage except for ChargingStation (intentionally global).

### FR-2 Location types (BR #2)
Multiple `location_type` per tenant; a location can carry one or more types. Search can filter by type.

### FR-3 OEM API ingest (BR #3)
Inbound API sync (Mazda-style) creates/updates Locations. Must carry opening hours and contact numbers. Writes respect field-level provenance (Section 7.2). Sync is idempotent on `external_ref`.

### FR-4 Club / NAC view (BR #4)
Authenticated read access to dealer fields per **Appendix A**. Surfaced in the web UI and via the Salesforce embed.

### FR-5 Service Provider access (BR #5)
Optional, entitlement-scoped read access. Off unless explicitly granted per provider per tenant.

### FR-6 Club integration: SFTP + API (BR #6)
- **SFTP:** generate a Change Register delta file and place it in the club's secure folder (RACV, NRMA today; "Other Clubs" do not yet exist, use Extranet equivalent during transition).
- **API:** expose a club-facing sync API as the modern path. Both are first-class; clubs adopt API as they are ready.
- Change Register must carry timestamps of when each change occurred (addresses Deone's clarification).

### FR-7 Proximity search (BR #7) — two-stage
Given an incident location (address or lat/long):
1. **Candidate selection (PostGIS):** pull nearest ~15-20 locations by straight-line distance within the tenant, excluding hidden and (for tow context) Stop-Tow and currently-closed locations.
2. **Eligibility filter:** apply time-of-day acceptance (opening hours), access restrictions, EV-certification rule (FR-12), location-type and sales-only filters.
3. **Drive-time ranking (Google Routes API):** call Google only for the filtered shortlist, with traffic enabled, to get drive time and distance in km.
4. **Return top 5** by drive time, each annotated with Stop Tow label, restrictions, alternates, capabilities.

> **Why two-stage:** Google cost scales with searches, not dealer count. PostGIS does the heavy filtering for free; Google refines only the survivors. This also keeps latency low.

### FR-8 Search functionality (BR #8)
- a. Search any postcode, not just nearest to incident.
- b. Geofenced distance display for a specific dealer.
- c. Per-program/client visibility of all locators.
- d. **AU only** in Phase 1 (NZ filtered out; tenant reserved for Phase 2).
- e. Optional exclusion of sales-only offices (`is_sales_only`).

### FR-9 EV charging display (BR #9)
Show nearest charging stations (Chargefox / PlugShare) near the incident, **periodic sync** (not real-time availability). Visible across all clients. Flag `truck_accessible` where known.

### FR-10 Stop Tow (BR #10)
Per Section 7.4. Configurable per location and bulk by postcode; date/days auto-rules; OEM and Dealer self-serve; OEM lock; full Journal history.

### FR-11 Stop Tow & access restriction labelling (BR #11)
- a. Clear "Stop Tow" label next to nominated dealers.
- b. Display access restrictions (e.g. charging station not truck-accessible, roadworks, building works) and alternate options.
- c. Hide-from-search control (`is_hidden`).

### FR-12 Service capability highlighting & EV-certified logic (BR #12)
- Label dealers with capabilities (HEV, Hybrid, BEV, Auto24, Metro).
- **EV-Certified routing:** for a BEV/HEV with a **high-voltage** fault, only `ev_certified = true` dealers are eligible. If the fault is **not** high-voltage related, any dealer is eligible.
- **The consultant determines, at the time of the call, whether the fault is high-voltage related.** The UI exposes this as an explicit search input (e.g. a toggle: "High-voltage fault? Yes / No / Unknown"). The system applies the certification filter based on that input. "Unknown" defaults to the safe path (certified only).

### FR-13 Import / export (BR #13)
- Excel-template import by OEM Office (own tenant) or AMS power users.
- Bulk upload, manual edit, delete.
- Report generation on client dealer locations, with optional scheduling of download/export.
- Import/export restricted to power users / OEM Office (not Consultants, not Service Providers, not Dealers beyond their own record).

### FR-14 Tyre locator (BR #14)
Data model carries `tyre_stock` so a future "nearest dealer with the right tyre" search is possible. Full search is Phase 1 stretch or Phase 2.

---

## 9. Integration specifications

### 9.1 Google Maps Platform
- **Routes API** with `departureTime` set for traffic-aware drive time.
- **Maps JavaScript API** for the map view.
- Called only on the PostGIS-filtered shortlist (FR-7).
- Billing enabled; usage is metered. Cache identical incident-to-dealer pairs briefly to reduce calls.
- Server-side key, restricted by referrer/IP; never expose an unrestricted key to the browser.

### 9.2 OEM dealer system (inbound API)
- Pull or receive push per OEM capability (constraint: OEM API maturity varies).
- Normalise each OEM's format into the canonical Location schema (constraint #1: clients send different formats).
- Idempotent upsert on `(tenant_id, external_ref)`; respect field provenance.

### 9.3 Chargefox / PlugShare (inbound, periodic)
- Scheduled sync (e.g. nightly) of station locations.
- Store coordinates in PostGIS for proximity queries.
- Not real-time availability in Phase 1.

### 9.4 Clubs (outbound)
- **SFTP Change Register:** delta file per club to secure folder, with per-change timestamps. RACV and NRMA active; others via Extranet during transition.
- **Club API:** sync endpoint for clubs that adopt API.

### 9.5 Salesforce (consumer)
- Iframe embed + server-to-server query API. CORS/frame-ancestors locked to the SF org.

---

## 10. Stop Tow state and lock logic (detail)

```
Actors who can toggle a location's Stop Tow:
  - OEM Office (always, within tenant)
  - Dealer (only when NOT locked_by_oem)
  - AMS Admin / Power User (always)

Lock:
  - locked_by_oem is a checkbox on the OEM dealer-management page.
  - locked_by_oem = true  -> Dealer toggle disabled; OEM/AMS only.
  - locked_by_oem = false -> Dealer may toggle.

Auto-rule:
  - {type: 'date', value: <ISO date>}  -> flip enabled at that date.
  - {type: 'days', value: <N>}         -> flip enabled N days after set_at.

Every change writes a Journal row capturing actor, role, old/new, timestamp.
The current Stop Tow state always records set_by + set_at (last writer).

Bulk-by-postcode applies the same enable/disable to all tenant locations
in that postcode, each producing its own Journal entry.
```

---

## 11. Journal vs Change Register (kept separate)

| | Journal | Change Register |
|---|---|---|
| Purpose | Internal audit / reporting | Outbound feed to Clubs |
| Shape | Append-only event log | Delta file (and API payload) |
| Audience | AMS, queryable | RACV, NRMA, others |
| Trigger | Every change to a Location / Stop Tow | Scheduled delta run |
| Contains | actor, role, field, old, new, timestamp | changed records + per-change timestamps |

---

## 12. Non-functional requirements

- **Performance:** proximity search (PostGIS candidate + Google shortlist) target sub-2-second p95 for a consultant on a call.
- **Security:** every user authenticated; RBAC enforced server-side on every request; tenant scoping non-bypassable; Google key server-side only; secrets in Key Vault.
- **Auditability:** all data and Stop Tow changes journalled.
- **Availability:** app tier stateless (horizontal scale); managed Postgres with point-in-time recovery. (Operational DR runbook is a separate deliverable, Section 16.)
- **Data residency:** AU region.
- **Responsive web:** desktop-first (call centre), usable on tablet. No native mobile (Phase 1).

---

## 13. Assumptions

1. The Client/OEM data is the source of truth; AMS receives vehicle classifications and location types from Clients.
2. AMS IT provides BAU support post-implementation.
3. Head office nominates dealers for Stop Tow (now reconciled with FR-10: head office and dealers can both toggle, head office can lock).

## 14. Constraints

1. Clients send data in different formats; must be normalised to the canonical schema.
2. Source of truth depends on OEM/Client-provided data.
3. OEM API integration maturity varies; SFTP/manual fallback must remain available.

---

## 15. Phase 2 backlog (capture now)

| Item | Note |
|---|---|
| **New Zealand tenant** | New tenant, **not yet active**. Same engine; needs AU/NZ geofencing split, NZ road network for Google routing, and any NZ-specific clubs/programs. Model the tenant now, leave inactive. |
| **SSO (Entra ID)** | Single sign-on for AMS staff; lets the Salesforce session flow through the embed. |
| **MFA** | For sensitive roles. |
| **Tyre locator search** | Full "nearest dealer with the right tyre" using `tyre_stock`. |
| **Real-time charging availability** | Move Chargefox/PlugShare from periodic sync to live availability if a commercial feed exists. |
| **Native mobile app** | Currently out of scope; flagged for review. |
| **DR/BCP runbook** | Operational disaster-recovery process and failover testing. |

---

## 16. Open decisions / items to confirm

1. **Mapping cost ownership:** Google billing account and monthly budget ceiling for Routes/Maps usage. Caching strategy to be sized once expected search volume is known.
2. **Dealer account granularity:** is a Dealer user bound to one location, or to a dealer group covering several locations? (`dealer_group_id` is in the model either way.)
3. **Mobile app and DR scope:** both were challenged by the BR-033 reviewer. Recommendation: keep native mobile out of Phase 1 (responsive web covers the call-centre use case), and build the app DR-capable but treat the operational DR runbook as a fast-follow Phase 1.5 rather than fully out of scope.
4. **Service Provider entitlement model:** confirm whether providers (e.g. Nationwide Group) are entitled per tenant, per program, or globally.
5. **Change Register delta definition:** confirm the exact field set and the cadence per club (event-driven vs scheduled).
6. **OEM normalisation:** confirm the canonical inbound schema and per-OEM mapping ownership (AMS-built adapters vs OEM-conformed feeds).

---

## Appendix A — Required dealer information fields (UI / API)

*Placeholder: BR-033 references "Appendix A" for the dealer field set but the field list was not included in the source PDF. Populate this before build. Expected to include at minimum: dealer name, address, suburb/state/postcode, phone, email, opening hours, location type, service capabilities, EV-certified flag, Stop Tow status, access restrictions, distance and drive time (computed). Confirm the authoritative list with the business.*
