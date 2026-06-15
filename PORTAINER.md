# Deploying on your own server with Portainer

This deploys the whole app (API + web + PostGIS database) as one Portainer
**Stack** using [`docker-compose.portainer.yml`](docker-compose.portainer.yml).

Pick the method that matches how your code reaches the server:

- **Method A — Pre-built image** (works with Portainer's **Web editor**; simplest).
- **Method B — Git repository stack** (Portainer builds the image from your repo).

> Assumes a **standalone Docker** host (the usual single-server Portainer setup).
> Docker Swarm has caveats — see the bottom.

---

## Method A — Build the image on the host, deploy via Web editor

### A1. Get the code onto the server and build the image (one time)

SSH into your server, then:

```bash
git clone <your-repo-url> dealer-locator     # or scp/upload the project folder
cd dealer-locator
docker build -t dealer-locator:latest .
```

This produces a local image named `dealer-locator:latest` — exactly what the stack
file references by default.

### A2. Create the stack in Portainer

1. Portainer → **Stacks** → **Add stack**.
2. Name: `dealer-locator`.
3. Build method: **Web editor**. Paste the contents of
   `docker-compose.portainer.yml`.
4. Scroll to **Environment variables** → add (these substitute the `${...}` in the
   file):

   | Name | Value |
   |---|---|
   | `POSTGRES_PASSWORD` | a strong DB password |
   | `JWT_SECRET` | a strong random secret (32+ chars) |
   | `APP_PORT` | host port to expose, e.g. `4000` |
   | `ALLOWED_ORIGINS` | `http://<server-ip>:<APP_PORT>` (and your Salesforce org if embedding) |
   | `FRAME_ANCESTORS` | your Salesforce org URL, or leave blank |
   | `SEED_ON_START` | `true` for the first boot |

5. Click **Deploy the stack**.

On first boot the `app` container waits for the DB, runs migrations, and (because
`SEED_ON_START=true`) seeds demo data.

### A3. Open it

`http://<server-ip>:<APP_PORT>` → log in as `consultant@ams.local` / `password123`.

### A4. Turn off seeding

Edit the stack → set `SEED_ON_START=false` → **Update the stack**. (Leaving it on
re-seeds and wipes edits on every restart.)

### A5. Updating later

```bash
cd dealer-locator && git pull        # if using git
docker build -t dealer-locator:latest .
```
Then in Portainer: open the stack → **Update the stack** (recreates the `app`
container from the freshly built local image).

---

## Method B — Git repository stack (Portainer builds for you)

1. Push the project to a Git repo Portainer can reach (GitHub / GitLab / Gitea).
2. In `docker-compose.portainer.yml`, **uncomment the `build:` block** under the
   `app` service:
   ```yaml
       build:
         context: .
         dockerfile: Dockerfile
   ```
   (Keep the `image:` line — Compose builds and tags it under that name.)
3. Portainer → **Stacks** → **Add stack** → build method **Repository**.
   - Repository URL + branch/ref.
   - Compose path: `docker-compose.portainer.yml`.
4. Add the same **Environment variables** as in A2.
5. **Deploy the stack** — Portainer clones the repo and builds the image on the host.
6. To update: push to the branch, then **Pull and redeploy** in the stack (rebuilds).

---

## Putting it behind HTTPS (recommended)

The container serves plain HTTP on the port you mapped. For a real deployment, put a
reverse proxy in front for TLS (you likely already run one alongside Portainer):

- **Nginx Proxy Manager / Traefik / Caddy**: route your domain →
  `http://<server-ip>:<APP_PORT>` and let it handle the certificate.
- Then set `ALLOWED_ORIGINS=https://your-domain` (and `FRAME_ANCESTORS` for the
  Salesforce org) and update the stack.

If you use Traefik on a shared Docker network, you can instead add Traefik labels to
the `app` service and join that network — tell me your proxy and I'll add the labels.

---

## Environment variables

| Var | Required | Purpose |
|---|---|---|
| `POSTGRES_PASSWORD` | ✅ | Database password (stack will refuse to deploy without it). |
| `JWT_SECRET` | ✅ | Auth token signing secret. Use a strong unique value. |
| `APP_PORT` | — | Host port to publish (default `4000`). |
| `ALLOWED_ORIGINS` | recommended | CORS allowlist, comma-separated. |
| `FRAME_ANCESTORS` | for embed | Origins allowed to iframe `/embed` (Salesforce org). |
| `SEED_ON_START` | — | `true` seeds demo data on boot; set `false` after first run. |
| `GOOGLE_MAPS_API_KEY` | — | Optional; mock routing used when unset. |
| `POSTGRES_USER` / `POSTGRES_DB` | — | Default to `dealer` / `dealer_locator`. |
| `APP_IMAGE` | — | Override the image name/tag (default `dealer-locator:latest`). |

The database has **no published port** — it's only reachable by the `app` container
on the stack's internal network, which is what you want.

---

## Docker Swarm note

If your Portainer environment is a **Swarm** (not a standalone host), Swarm ignores
`build:`, `depends_on.condition`, and `restart: unless-stopped`:

- Build the image and **push it to a registry** (Docker Hub, or a local registry),
  then set `APP_IMAGE` to that pushed tag (Method B's in-stack build won't work).
- Ordering is still safe — the `app` entrypoint waits ~60s for the database before
  migrating, so it tolerates starting before the DB is ready.

Tell me if you're on Swarm and I'll add a `deploy:`-based variant.

---

## Verify (any method)

```bash
curl http://<server-ip>:<APP_PORT>/health    # -> {"status":"ok"}
```
Then run through the [post-deployment checklist](DEPLOYMENT.md#post-deployment-checklist)
(search, EV routing, Stop Tow lock, import/export 403, Change Register). Demo
accounts and passwords are in the [README](README.md).
