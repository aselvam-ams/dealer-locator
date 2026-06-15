# Dealer Locator 2025 — Deployment Guide

Step-by-step instructions to deploy the app to **Azure** (recommended, matches the
AMS Azure footprint) or **Railway** (fastest to stand up). Both host the same
single Docker image and require a **PostgreSQL database with the PostGIS
extension**.

> The app is one container: the Fastify API also serves the built React app on the
> same port (default `4000`). It needs PostGIS for the geospatial proximity search.

> **You do not need Docker installed locally.** Azure builds the image in the
> cloud (ACR Tasks); Railway builds it from your repository.

---

## Contents
1. [Before you start](#0-before-you-start)
2. [Part A — Azure (Container Apps + Azure Database for PostgreSQL)](#part-a--azure)
3. [Part B — Railway](#part-b--railway)
4. [Post-deployment checklist](#post-deployment-checklist)
5. [Environment variables](#environment-variables)
6. [Troubleshooting](#troubleshooting)

---

## 0. Before you start

You will set these values for either platform. **Generate a strong JWT secret** —
do not ship the default.

| Value | Example | Notes |
|---|---|---|
| App/DB name prefix | `dealerlocator` | lowercase, globally unique where required |
| DB admin user | `dealeradmin` | |
| DB password | (strong, 16+ chars) | store in a password manager |
| `JWT_SECRET` | (32+ random chars) | generate below |
| `ALLOWED_ORIGINS` | your app URL + Salesforce org | comma-separated |
| `FRAME_ANCESTORS` | your Salesforce org URL | only origins allowed to iframe `/embed` |

Generate a JWT secret:

```powershell
# Windows PowerShell
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Max 256 }))
```
```bash
# macOS / Linux
openssl rand -base64 32
```

The image seeds demo data on first boot when `SEED_ON_START=true` (7 demo accounts,
password `password123`). Turn it **off** after the first successful boot, or before
loading real data.

---

# Part A — Azure

Uses **Azure Container Apps** for the app and **Azure Database for PostgreSQL
Flexible Server** for PostGIS. Images are built in the cloud with **Azure Container
Registry (ACR) Tasks** — no local Docker.

### A1. Prerequisites

- An Azure subscription with permission to create resources.
- [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli) installed.
- Sign in and select your subscription:

```powershell
az login
az account set --subscription "<YOUR-SUBSCRIPTION-ID-OR-NAME>"
az extension add --name containerapp --upgrade
az provider register --namespace Microsoft.App
az provider register --namespace Microsoft.OperationalInsights
```

### A2. Set variables (run in the project root)

```powershell
# --- edit these ---
$RG       = "rg-dealer-locator"
$LOC      = "australiaeast"
$ACR      = "dealerlocatoracr"          # must be globally unique, lowercase, 5-50 alphanumerics
$PG       = "dealerlocator-pg"          # must be globally unique, lowercase
$PGADMIN  = "dealeradmin"
$PGPASS   = "<STRONG-DB-PASSWORD>"
$ENVNAME  = "dealer-locator-env"
$APP      = "dealer-locator"
$JWT      = "<YOUR-GENERATED-JWT-SECRET>"
```

> In bash, use `RG=rg-dealer-locator` (no `$`) and reference as `$RG`. Everything
> else (the `az` commands) is identical.

### A3. Create the resource group

```powershell
az group create --name $RG --location $LOC
```

### A4. Build and push the image with ACR Tasks (no local Docker)

```powershell
az acr create --resource-group $RG --name $ACR --sku Basic --admin-enabled true
az acr build --registry $ACR --image dealer-locator:latest .
```

`az acr build` uploads the build context and runs the `Dockerfile` in Azure. When it
finishes, the image is at `$ACR.azurecr.io/dealer-locator:latest`.

### A5. Create the PostgreSQL Flexible Server and enable PostGIS

```powershell
# Create the server (B1ms is the cheapest burstable tier; resize later as needed)
az postgres flexible-server create `
  --resource-group $RG --name $PG --location $LOC `
  --admin-user $PGADMIN --admin-password $PGPASS `
  --tier Burstable --sku-name Standard_B1ms `
  --version 16 --storage-size 32 `
  --public-access 0.0.0.0          # allow access from Azure services (Container Apps)

# Create the application database
az postgres flexible-server db create `
  --resource-group $RG --server-name $PG --database-name dealer_locator

# Allow-list the extensions the schema needs (POSTGIS + PGCRYPTO).
# This is REQUIRED — without it, CREATE EXTENSION fails during migration.
az postgres flexible-server parameter set `
  --resource-group $RG --server-name $PG `
  --name azure.extensions --value POSTGIS,PGCRYPTO
```

> `--public-access 0.0.0.0` permits other Azure services to reach the DB. For a
> tighter setup use VNet integration / Private Link and place the Container App in
> the same VNet (out of scope for this quick start).

Build the connection string (Azure requires SSL):

```powershell
$DATABASE_URL = "postgres://$PGADMIN`:$PGPASS@$PG.postgres.database.azure.com:5432/dealer_locator?sslmode=require"
```

### A6. Create the Container Apps environment and deploy the app

```powershell
az containerapp env create `
  --name $ENVNAME --resource-group $RG --location $LOC

# Pull the ACR admin credentials so the app can pull the image
$ACRPASS = az acr credential show --name $ACR --query "passwords[0].value" -o tsv

az containerapp create `
  --name $APP --resource-group $RG --environment $ENVNAME `
  --image "$ACR.azurecr.io/dealer-locator:latest" `
  --registry-server "$ACR.azurecr.io" `
  --registry-username $ACR `
  --registry-password $ACRPASS `
  --target-port 4000 --ingress external `
  --min-replicas 1 --max-replicas 2 `
  --secrets db-url="$DATABASE_URL" jwt-secret="$JWT" `
  --env-vars `
    DATABASE_URL=secretref:db-url `
    JWT_SECRET=secretref:jwt-secret `
    PORT=4000 `
    SEED_ON_START=true `
    ALLOWED_ORIGINS="https://PLACEHOLDER" `
    FRAME_ANCESTORS=""
```

Get the public URL:

```powershell
$FQDN = az containerapp show --name $APP --resource-group $RG --query "properties.configuration.ingress.fqdn" -o tsv
"https://$FQDN"
```

### A7. Fix ALLOWED_ORIGINS, then disable seeding

Now that you know the URL, set `ALLOWED_ORIGINS` (and `FRAME_ANCESTORS` if embedding
in Salesforce) and turn off seeding:

```powershell
az containerapp update --name $APP --resource-group $RG `
  --set-env-vars `
    ALLOWED_ORIGINS="https://$FQDN,https://YOURORG.my.salesforce.com" `
    FRAME_ANCESTORS="https://YOURORG.my.salesforce.com" `
    SEED_ON_START=false
```

### A8. Verify

```powershell
# Health check
curl "https://$FQDN/health"     # -> {"status":"ok"}
```

Open `https://$FQDN` in a browser and log in as `consultant@ams.local` /
`password123`. Search postcode `2000`. (See the [checklist](#post-deployment-checklist).)

### A9. Updating the app later

```powershell
az acr build --registry $ACR --image dealer-locator:latest .
az containerapp update --name $APP --resource-group $RG `
  --image "$ACR.azurecr.io/dealer-locator:latest"
```

Migrations run automatically on every boot (they are idempotent). Roll back by
deploying a previous image tag, or via **Revisions** in the Container App.

### A10. Shortcut (optional)

`az containerapp up --source . --name $APP --resource-group $RG --environment $ENVNAME --target-port 4000 --ingress external --env-vars ...`
builds **and** deploys in one command (still needs the Postgres server from A5).

---

# Part B — Railway

Railway builds the image from your Git repository using the `Dockerfile` and gives
you a managed environment. Railway's default Postgres has **no PostGIS**, so we run
a PostGIS database as a separate service from the official image.

### B1. Prerequisites

- A [Railway](https://railway.app) account.
- Your code pushed to a GitHub repository (Railway deploys from GitHub), **or** the
  [Railway CLI](https://docs.railway.app/guides/cli) (`npm i -g @railway/cli`).

### B2. Create a project

Railway dashboard → **New Project** → **Empty Project**. Name it `dealer-locator`.

### B3. Add the PostGIS database service

1. In the project: **New** → **Database** is vanilla Postgres, so instead choose
   **New** → **Docker Image**.
2. Image: `postgis/postgis:16-3.4`
3. Name the service **`postgis`** (the name is referenced later).
4. **Variables** tab → add:
   - `POSTGRES_USER` = `dealer`
   - `POSTGRES_PASSWORD` = `<STRONG-DB-PASSWORD>`
   - `POSTGRES_DB` = `dealer_locator`
5. **Settings** → **Volumes** → add a volume mounted at
   `/var/lib/postgresql/data` (so data survives restarts).
6. Deploy the service. It is reachable inside the project at
   `postgis.railway.internal:5432` over private networking.

### B4. Deploy the app service

**Option 1 — from GitHub (recommended):**
1. **New** → **GitHub Repo** → select your repo.
2. Railway detects the `Dockerfile` and builds it. Name the service `app`.

**Option 2 — from the CLI:**
```bash
railway login
railway link        # select the dealer-locator project
railway up          # builds the Dockerfile and deploys
```

### B5. Configure the app service variables

In the **`app`** service → **Variables**, add:

| Variable | Value |
|---|---|
| `DATABASE_URL` | `postgres://dealer:<STRONG-DB-PASSWORD>@${{postgis.RAILWAY_PRIVATE_DOMAIN}}:5432/dealer_locator` |
| `JWT_SECRET` | `<YOUR-GENERATED-JWT-SECRET>` |
| `SEED_ON_START` | `true` |
| `ALLOWED_ORIGINS` | (set after B6, once you have the domain) |
| `FRAME_ANCESTORS` | your Salesforce org URL, or leave blank |

> `${{postgis.RAILWAY_PRIVATE_DOMAIN}}` is a Railway **variable reference** to the
> database service named `postgis`. If you named the DB service differently, change
> `postgis` to match. Private networking needs no SSL.

> Do **not** set `PORT` manually — Railway injects `PORT` and the app listens on it
> automatically. Railway also auto-sets the ingress to that port.

### B6. Generate a public domain

In the **`app`** service → **Settings** → **Networking** → **Generate Domain**.
You'll get something like `dealer-locator-production.up.railway.app`.

Now set `ALLOWED_ORIGINS` to that URL (plus your Salesforce org if embedding) and
redeploy:

```
ALLOWED_ORIGINS = https://dealer-locator-production.up.railway.app,https://YOURORG.my.salesforce.com
```

### B7. Disable seeding after first boot

Once the first deploy is healthy and you've confirmed data loaded, set
`SEED_ON_START=false` in the `app` service variables and redeploy. (Leaving it on
re-seeds — and wipes edits — on every restart.)

### B8. Verify

Open your Railway domain in a browser, or:
```bash
curl https://<your-railway-domain>/health   # -> {"status":"ok"}
```
Log in as `consultant@ams.local` / `password123` and search postcode `2000`.

### B9. Updating the app later

Push to your GitHub branch (Railway auto-deploys), or run `railway up` again.
Migrations run on every boot and are idempotent.

---

## Post-deployment checklist

Log in and confirm the core flows (full account list in the README):

- [ ] `/health` returns `{"status":"ok"}`.
- [ ] **Consultant** (`consultant@ams.local`): search postcode `2000` → up to 5
      dealers ranked by drive time, with badges.
- [ ] **EV routing**: flip *High-voltage fault* to **Yes/Unknown** → only
      EV-certified dealers; **No** → all dealers.
- [ ] **Dealer** (`dealer@mazda.local`): toggle Stop Tow; **OEM** (`oem@mazda.local`)
      sets the lock → `dealer.locked@mazda.local` can no longer toggle.
- [ ] **Power user** (`power@ams.local`): export Excel, re-import; a consultant
      gets 403 on import/export.
- [ ] **Change Register**: generates a delta (written to the container's
      `/app/sftp-out`).
- [ ] **Security**: `JWT_SECRET` is a strong unique value, `SEED_ON_START=false`,
      `ALLOWED_ORIGINS`/`FRAME_ANCESTORS` are restricted to your real origins.

> **Change the demo passwords.** The seed creates accounts with `password123`. For a
> real environment, seed once then update credentials (or disable seeding and create
> users through an Admin/Power User account).

---

## Environment variables

| Var | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | ✅ | Postgres+PostGIS connection string. Azure: append `?sslmode=require`. |
| `JWT_SECRET` | ✅ | Signing secret for auth tokens. Set a strong unique value. |
| `PORT` | — | App listen port (default `4000`; Railway injects this). |
| `SERVE_WEB` / `WEB_DIST` | — | Pre-set in the image so the API serves the React app. |
| `ALLOWED_ORIGINS` | recommended | CORS allowlist, comma-separated. |
| `FRAME_ANCESTORS` | for embed | Origins allowed to iframe `/embed` (Salesforce org). |
| `SEED_ON_START` | — | `true` seeds demo data on boot. Turn off after first run. |
| `GOOGLE_MAPS_API_KEY` | — | Optional; the mock routing provider is used when unset. |

---

## Troubleshooting

**`type "geography" does not exist` / `extension "postgis" is not allow-listed`**
PostGIS isn't enabled.
- Azure: run the `azure.extensions` parameter set in **A5** (allow-list
  `POSTGIS,PGCRYPTO`), then restart the app revision so migration retries.
- Railway: make sure the DB service uses the `postgis/postgis` image, **not** the
  default Postgres plugin.

**`self signed certificate` / SSL errors connecting to the DB (Azure)**
Use `?sslmode=require` in `DATABASE_URL`. If your environment still rejects the
cert, use `?sslmode=no-verify` (encrypts but skips CA verification).

**App boots but can't reach the database**
- Azure: confirm the firewall allows Azure services (`--public-access 0.0.0.0` in
  A5) and the host/db name in `DATABASE_URL` are correct.
- Railway: confirm `DATABASE_URL` uses `${{<db-service>.RAILWAY_PRIVATE_DOMAIN}}`
  and the service name matches.

**Container starts then exits / migrations hang**
The entrypoint waits up to ~60s for the DB. Check the DB service is healthy and the
credentials in `DATABASE_URL` match the DB service's `POSTGRES_USER/PASSWORD`.

**Login works locally but fails in the browser (CORS)**
Add your deployed origin to `ALLOWED_ORIGINS` and redeploy.

**Salesforce iframe is blank / blocked**
Set `FRAME_ANCESTORS` to the exact Salesforce org origin(s). Empty means no site may
frame the app.

**Demo data keeps resetting**
`SEED_ON_START` is still `true`. Set it to `false` and redeploy.
