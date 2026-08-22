# Tripatlas

[![CI](https://github.com/jsc2304/tripatlas/actions/workflows/ci.yml/badge.svg)](https://github.com/jsc2304/tripatlas/actions/workflows/ci.yml)
[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL%203.0-blue.svg)](LICENSE)

**Self-hosted trip archive and analytics for Tesla.** Pick a date, review every trip of the day, classify it, export it - your movement data stays on your server.

Tripatlas reads the database of an existing [TeslaMate](https://github.com/teslamate-org/teslamate) installation in read-only mode and turns it into a searchable trip, parking, and charging archive with a daily timeline, places, tags, auto-classification, and business exports (CSV/PDF/GPX). No subscription, no cloud, no tracking.

## Why?

Tessie and similar services are good, but they come with subscription costs, overlap with features in the Tesla app, and put movement data with a third party. TeslaMate logs very well, but it does not provide a workflow for **finding and documenting** individual trips. Tripatlas is the product layer on top.

## Features

**Trip archive (the core)**
- **Daily view** - Pick a date -> every trip as an atomic entry: `08:14-08:47 · Home -> Client Miller · 27.3 km · Business`; parking and charging are interleaved in one timeline
- **Classify and annotate** - Private / business / commute via segmented control, purpose, client, project, notes, tags; every change is recorded in the audit log
- **Auto-classification rules** - "Home -> Office, Mon-Fri = commute": rules with place and weekday conditions classify new trips automatically, and never touch anything you decided manually (provenance in the audit log)
- **Bulk editing** - Select and classify/tag many trips at once in the daily view and search
- **Places** - Geofences with map picker and address search (OSM/Nominatim); manual corrections with locks that survive every re-sync
- **Calendar, search, reports** - Monthly grid with trip intensity; full-text search across places/clients/projects/tags with filters; monthly reports with CSV/PDF export in logbook style

**Trip and charging analytics**
- **Trip detail** - Route on the map, combined history chart (elevation/SoC/speed), temperatures, max speed/power/recuperation, historical weather at trip time, GPX export
- **Charging overview** - Charging curve (kW over SoC), AC/DC, cost, location map
- **Automatic charging costs** - Store an electricity price per place (for example home at EUR 0.32/kWh) -> sessions without a known price are calculated automatically, while manual and synced costs remain untouched
- **Journeys** - Vacations/trips as a wrapper around drives and charging stops, with KPI dashboard, map of all stages, an [immersive scroll-controlled 3D recap](docs/journey-recap.md), and export as CSV, PDF, and GPX
- **Insights** - Personal consumption curve: consumption vs. outside temperature and speed, seasonal patterns, share of short trips
- **Parking analytics** - Vampire drain per parking session, parking durations by place
- **Roadtrip planner** - Ordered checkpoints, versioned journey plans, real routes (OSRM), elevation profile and your personal consumption profile
- **Mobile roadtrip companion** - Store a plan on the phone, follow the next stop and key leg metrics even when reception drops
- **Tesla navigation handoff (optional)** - Send the complete ordered checkpoint list to the vehicle through Tesla Fleet API

**Cockpit and vehicle**
- **Home dashboard** - SoC + range, location, status, weather, tire pressure warnings, recent trips as map + list
- **Software update history** and vehicle data in settings
- **Connection diagnostics** - Sync health per data source at a glance, optional direct TeslaMate test

**Interface**
- **German and English** - Switchable in the UI (German by default)
- **Dark mode** - Light/dark/system switcher without flicker
- **Mobile-first** - Installable as a PWA, 16px form fields (no iOS zoom), safe-area-aware bottom navigation

**Data**
- **Data ownership** - Your own PostgreSQL database, source-agnostic schema (`source`/`source_id`), annotations structurally survive every re-sync
- **Tessie import** - Reconstructs trips/charging sessions from a Tessie raw data export (`import-tessie` CLI), including real energy values from vehicle counters
- **Honest energy data** - Real counter values where available, otherwise clearly marked estimates; efficiency fallback in settings until TeslaMate has learned the vehicle value

## Demo without a car

No Tesla, no TeslaMate? The demo stack starts a fully populated app with six weeks of synthetic driving data:

```bash
docker compose -f docker-compose.demo.yml up -d --build
# -> http://localhost:3000, login: demo1234
```

Details: [docs/demo.md](docs/demo.md)

## Stack

pnpm monorepo: Next.js 15 (`apps/web`) · sync worker (`apps/worker`) · Drizzle schema (`packages/db`) · pure domain logic (`packages/core`) · PostgreSQL 17 · Docker Compose.

## Development

Without a real car - a fixture TeslaMate database with 6 weeks of synthetic driving data is included:

```bash
pnpm install
pnpm dev:db                                # tripatlas-db :5432 + fixture teslamate-db :5433
pnpm db:seed:teslamate                     # ~140 trips, charging, geofences (Zurich area)
DATABASE_URL=postgres://tripatlas:tripatlas@localhost:5432/tripatlas pnpm db:migrate
pnpm --filter @tripatlas/worker dev        # Sync loop (needs DATABASE_URL + TESLAMATE_DATABASE_URL, see .env.example)
pnpm --filter @tripatlas/web dev           # http://localhost:3000
```

Tests: `pnpm test` · typecheck: `pnpm lint` · more: [CONTRIBUTING.md](CONTRIBUTING.md)

## Deployment

Docker Compose on a home server/NAS/Raspberry Pi in your LAN or VPN (for example Tailscale), connected to the existing TeslaMate Postgres through a read-only role.

### Requirements

- Docker + Docker Compose (plugin) on the target device (Raspberry Pi, NAS, home server)
- >= 4 GB RAM
- A running TeslaMate installation with reachable Postgres (LAN, VPN, or same Docker host)

### 0. No TeslaMate yet? Install it too

A minimal TeslaMate Compose setup (without Grafana) is available under [deploy/teslamate/](deploy/teslamate/docker-compose.yml) - instructions are in the file header. Then sign in to the Tesla account at `http://<host>:4000`. To let Tripatlas reach the TeslaMate database through the Compose service name `database`, create a `docker-compose.override.yml` in the Tripatlas directory:

```yaml
services:
  worker:
    networks: [default, teslamate]
networks:
  teslamate:
    external: true
    name: teslamate_default
```

### 1. Create a read-only role on the TeslaMate database

Tripatlas only reads the TeslaMate database - it never writes to it. Run this on the TeslaMate Postgres:

```sql
CREATE ROLE tripatlas_ro WITH LOGIN PASSWORD 'a-secure-password';
GRANT CONNECT ON DATABASE teslamate TO tripatlas_ro;
GRANT USAGE ON SCHEMA public TO tripatlas_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO tripatlas_ro;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO tripatlas_ro;
```

### 2. Configure `.env`

```bash
cp .env.example .env
```

Set at least:

- `POSTGRES_PASSWORD` - password for the new Tripatlas-owned Postgres (required, no default)
- `TESLAMATE_DATABASE_URL` - connection string for the `tripatlas_ro` role against the TeslaMate database (LAN/Tailscale host or Compose service name, see comments in `docker-compose.yml`)
- optional `WEB_PORT` (default `3000`), `APP_TIMEZONE`, `SYNC_INTERVAL_SECONDS`, `OSRM_URL` (your own routing server for the planner)

### 3. Start the stack

```bash
docker compose up -d --build
```

This builds `apps/web` and `apps/worker`, lets the `migrate` service apply Drizzle migrations once (`restart: "no"`, it must complete successfully), and then starts `db`, `web`, and `worker` permanently (`restart: unless-stopped`).

### 4. First sign-in

On first startup, an admin account is bootstrapped. Optionally set a password beforehand through `INITIAL_ADMIN_PASSWORD` in `.env`; otherwise one is set during the first login flow (with password confirmation).

### 5. HTTPS / remote access

There is no built-in reverse proxy in the Compose stack. Recommendation: put [`tailscale serve`](https://tailscale.com/kb/1242/tailscale-serve) in front of `${WEB_PORT}` on the target device - TLS certificate and access only inside your own tailnet, without opening a router port.

### Optional: send roadtrips to Tesla

The planner and offline companion work without Tesla API access. Direct vehicle
handoff additionally needs a Tesla developer application and a public HTTPS
domain. If Tesla requires signed commands for the vehicle, point
`TESLA_COMMAND_API_URL` at a compatible command proxy using the matching virtual
private key.
Set the `TESLA_*` variables documented in `.env.example`, restart the web
container, then open **More → Tesla Fleet API** to connect the Tesla account and
pair the virtual key when required. OAuth tokens are encrypted at rest; any
private virtual key remains in the command proxy and is never stored in Tripatlas.
When `TESLA_PUBLIC_KEY_PEM_BASE64` is set, Tripatlas serves the public half at
Tesla's required `/.well-known/appspecific/com.tesla.3p.public-key.pem` path.

The vehicle always recalculates the route and charging strategy from the sent
checkpoint order. Test the handoff with the parked vehicle before relying on it
for a trip.

### Update

```bash
git pull
docker compose up -d --build
```

Rebuilds images, applies new migrations through the `migrate` service, and rolls out `web`/`worker` again.

### Backup

```bash
docker compose exec db pg_dump -U tripatlas tripatlas > backup-$(date +%F).sql
```

TeslaMate backs up the TeslaMate data itself - Tripatlas only backs up its own annotations, places, tags, rules, and sync state.

### Import history (Tessie)

If you previously used Tessie, you can import the raw data export (CSV time series) - Tripatlas reconstructs trips, parking sessions, and charging sessions from it:

```bash
docker compose run --rm -v /path/to/tessie-export:/import:ro worker \
  node dist/cli.js import-tessie /import
```

Idempotent (safe to run multiple times), does not collide with TeslaMate data.

## Limitations (honest)

- **Requires TeslaMate** as the tracking data source; optional Fleet API access is only used when explicitly sending a planned route
- **One vehicle** per instance is the current focus (multi-vehicle is on the roadmap)
- **Number formatting** is currently consistently de-DE (decimal comma), including in the English UI
- **Charging stops are explicit checkpoints** - automatic charger discovery/optimization is not implemented yet; default routing uses the public OSRM demo server
- **No tax/legal opinion**: exports are logbook-like with audit log, but acceptance by the tax office depends on the individual case

## Roadmap

- Charging stop planning in the route planner (charging curves + charging park data)
- API/webhooks for custom analytics
- Calendar integration (events <-> trips)
- Multi-vehicle
- 2FA, backup automation
- Additional import sources (TeslaLogger, CSV)

## Contributing and Security

- Contributions: [CONTRIBUTING.md](CONTRIBUTING.md) · Issues are welcome in German or English
- Please report security vulnerabilities privately: [SECURITY.md](SECURITY.md)
- Changes: [CHANGELOG.md](CHANGELOG.md)

## License

[AGPL-3.0](LICENSE) © 2026 Jan Schultheiss
