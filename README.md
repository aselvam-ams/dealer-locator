# Dealer Locator 2025 (BR-033) — MVP

[![CI](https://github.com/aselvam-ams/dealer-locator/actions/workflows/ci.yml/badge.svg)](https://github.com/aselvam-ams/dealer-locator/actions/workflows/ci.yml)

A multitenant dealer-locator web app (AMS). Consultants, Clubs and Service
Providers find the nearest dealer that can accept a tow *now*, with EV-certified
routing and nearby charging stations.

This repository is a **runnable MVP vertical slice** of the
[build specification](Requirement/dealer-locator-spec.md). External services
(Google Routes, SFTP to clubs, Chargefox/PlugShare, OEM ingest, Salesforce) are
**mocked behind adapter interfaces** so the whole flow runs locally with no
third-party credentials.

## Stack

- **server/** — Node + TypeScript + Fastify, PostgreSQL + PostGIS, JWT auth.
- **web/** — React + TypeScript + Vite.
- **shared/** — shared DTO/domain types.
- **docker-compose.yml** — local PostGIS database.

## Prerequisites

- Node 20+
- Docker (for the PostGIS database)

## Quick start

```bash
cp .env.example .env          # (PowerShell: Copy-Item .env.example .env)
npm install                   # installs all workspaces
npm run db:up                 # starts PostgreSQL + PostGIS on localhost:5433
npm run migrate -w server     # applies the schema
npm run seed -w server        # seeds tenants, dealers, charging, users
npm run dev:server            # API on http://localhost:4000
npm run dev:web               # web on http://localhost:5173
```

Open http://localhost:5173.

## Demo accounts (password `password123`)

| Role | Email |
|---|---|
| Admin | `admin@ams.local` |
| AMS Power User | `power@ams.local` |
| Consultant (NAC) | `consultant@ams.local` |
| Service Provider | `provider@nationwide.local` |
| OEM Office (Mazda) | `oem@mazda.local` |
| Dealer (Mazda Chatswood) | `dealer@mazda.local` |
| Dealer (OEM-locked) | `dealer.locked@mazda.local` |

## What to try

- **Search** (consultant): pick a tenant, enter postcode `2000`, search. Up to 5
  nearest eligible dealers ranked by (mock) drive time, with Stop Tow / restriction
  badges, EV-certified flags and nearby charging.
- **EV routing**: flip *High-voltage fault* to **Yes** / **Unknown** → only
  EV-certified dealers remain; **No** → all dealers eligible.
- **Stop Tow & lock**: as `dealer@mazda.local` toggle Stop Tow on your location.
  As `oem@mazda.local` set the **OEM lock** → the dealer can no longer toggle
  (try `dealer.locked@mazda.local`). View change history per location.
- **Bulk Stop Tow**: OEM/AMS → Dealer Management → bulk by postcode.
- **Import / Export**: power user → export Excel, edit, re-import. A consultant
  gets 403.
- **Change Register**: power user → Import/Export → generate a delta; the JSON
  delta file is written under `./sftp-out/<club>/` (mock SFTP).
- **Embed**: http://localhost:5173/embed renders the locator as Salesforce would
  embed it. The API sets `Content-Security-Policy: frame-ancestors` from
  `FRAME_ANCESTORS`.

## Docker (host it anywhere)

The app ships as a **single image**: the Fastify API also serves the built React
app on the same origin, so one container is the whole front+back end. It needs a
PostgreSQL+PostGIS database.

### Run the full stack locally (app + database)

```bash
docker compose -f docker-compose.prod.yml up --build
# → http://localhost:4000   (SEED_ON_START seeds demo data on first boot)
```

### Build and push just the app image (managed DB elsewhere)

```bash
docker build -t dealer-locator:latest .
docker tag dealer-locator:latest <your-registry>/dealer-locator:latest
docker push <your-registry>/dealer-locator:latest
```

Then run it against any Postgres+PostGIS (e.g. Azure Database for PostgreSQL with
the PostGIS extension enabled):

```bash
docker run -p 4000:4000 \
  -e DATABASE_URL="postgres://user:pass@your-db-host:5432/dealer_locator" \
  -e JWT_SECRET="<a-strong-secret>" \
  -e ALLOWED_ORIGINS="https://your-domain,https://yourorg.my.salesforce.com" \
  -e FRAME_ANCESTORS="https://yourorg.my.salesforce.com" \
  -e SEED_ON_START="true" \
  <your-registry>/dealer-locator:latest
```

The container entrypoint waits for the DB, runs migrations, optionally seeds
(`SEED_ON_START=true`), then starts the server. On Azure Container Apps / App
Service (Linux container), deploy this image and set the same env vars; the spec
targets the AMS Azure footprint (Section 6.2).

### Runtime configuration (env vars)

| Var | Purpose |
|---|---|
| `DATABASE_URL` | Postgres+PostGIS connection string (**required**) |
| `JWT_SECRET` | Token signing secret (**set in production**) |
| `ALLOWED_ORIGINS` | CORS allowlist (comma-separated) |
| `FRAME_ANCESTORS` | Origins permitted to iframe `/embed` (Salesforce org) |
| `SEED_ON_START` | `true` to seed demo data on boot |
| `GOOGLE_MAPS_API_KEY` | Optional; mock routing used when unset |

## Tests

```bash
npm test -w server            # unit tests (provenance, hours, EV, stop-tow, scope)
RUN_DB_TESTS=1 npm test -w server   # also runs the search integration test (needs seeded DB)
```

## Mapping to the spec

Adapter seams live under `server/src/adapters/` (`routing`, `sftp`, `charging`,
`oemIngest`). Each ships a mock plus the interface a real provider implements.
See [the spec](Requirement/dealer-locator-spec.md) for the full Phase 1 scope and
the Phase 2 backlog.
