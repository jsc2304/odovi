# Odovi

[![CI](https://github.com/jsc2304/odovi/actions/workflows/ci.yml/badge.svg)](https://github.com/jsc2304/odovi/actions/workflows/ci.yml)
[![License: FSL-1.1-ALv2](https://img.shields.io/badge/License-FSL--1.1--ALv2-6f42c1.svg)](LICENSE)

**Self-hosted trip archive and analytics for Tesla.** Pick a date, review every trip of the day, classify it, export it - your movement data stays on your server.

Latest stable release: [Odovi 0.2.0](https://github.com/jsc2304/odovi/releases/tag/v0.2.0).
[Install](#deployment) · [Upgrade from Tripatlas](docs/rename-to-odovi.md).

Odovi reads the database of an existing [TeslaMate](https://github.com/teslamate-org/teslamate) installation in read-only mode and turns it into a searchable trip, parking, and charging archive with a daily timeline, places, tags, auto-classification, and business exports (CSV/PDF/GPX). Self-hosting requires no subscription or cloud service, and Odovi adds no product tracking.

## Why?

Tessie and similar services are good, but they come with subscription costs, overlap with features in the Tesla app, and put movement data with a third party. TeslaMate logs very well, but it does not provide a workflow for **finding and documenting** individual trips. Odovi is the product layer on top.

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
- **DC charging comparison** - Compare the latest 5 or 10 completed fast-charging sessions, recorded curves, observed power, 10–80% times and charging locations
- **Automatic charging costs** - Store an electricity price per place (for example home at EUR 0.32/kWh) -> sessions without a known price are calculated automatically, while manual and synced costs remain untouched
- **Journeys** - Vacations/trips as a wrapper around drives and charging stops, with KPI dashboard, map of all stages, an [immersive scroll-controlled 3D recap](docs/journey-recap.md), and export as CSV, PDF, and GPX
- **Insights** - Personal consumption curve: consumption vs. outside temperature and speed, seasonal patterns, share of short trips
- **Parking analytics** - Vampire drain per parking session, parking durations by place
- **Roadtrip planner** - Ordered checkpoints, versioned journey plans, real routes (OSRM), elevation profile, your personal consumption profile, explicit charge targets, and charge-time estimates from your own DC history
- **Mobile roadtrip companion** - Store a plan on the phone, follow the next stop and key leg metrics even when reception drops
- **Tesla navigation handoff (optional)** - Send the complete ordered checkpoint list to the vehicle through Tesla Fleet API

**Cockpit and vehicle**
- **Home dashboard** - SoC + range, location, status, weather, tire pressure warnings, recent trips as map + list
- **Software update history** and vehicle data in settings
- **Connection diagnostics** - Sync health per data source at a glance, optional direct TeslaMate test

**Interface**
- **English and German** - Browser-language detection, English fallback, and a saved manual choice in the UI
- **Dark mode** - Light/dark/system switcher without flicker
- **Mobile-first** - Installable as a PWA, 16px form fields (no iOS zoom), safe-area-aware bottom navigation

**Data**
- **Data ownership** - Your own PostgreSQL database, source-agnostic schema (`source`/`source_id`), annotations structurally survive every re-sync
- **Tessie import** - Reconstructs trips/charging sessions from a Tessie raw data export (`import-tessie` CLI), including real energy values from vehicle counters
- **Honest energy data** - Real counter values where available, otherwise clearly marked estimates; efficiency fallback in settings until TeslaMate has learned the vehicle value

### Compare DC charging sessions

Open **Charging → Compare DC charging** to compare the latest 5 or 10 completed
DC sessions for the installation's default vehicle. Ongoing and AC sessions are
excluded. Sessions with missing samples remain visible with an explanation.

- **10–80% time:** calculated between the first observed 10% and 80% crossings,
  with linear interpolation between adjacent samples. Partial sessions are not
  extrapolated; missing or conflicting SoC samples, falling SoC within the
  measured window, or sample gaps over two minutes make the timing unavailable.
- **Power:** average power is time-weighted over observed intervals across each
  whole session, with the observed time coverage shown. The summary reports the
  median of those session averages and the highest recorded peak across the
  selected sessions. These averages may cover different SoC ranges.
- **Locations:** saved places are grouped by place ID; otherwise an exact
  address match ignoring case and repeated whitespace is used. A location needs
  at least two valid 10–80% timings to enter the ranking. Unlocated sessions are
  grouped separately and never ranked. Results describe this selected history,
  not a charger's guaranteed performance.
- **Slower sessions:** a hint requires at least three other valid 10–80% timings
  and a duration at least 25% and five minutes above their median. Outside
  temperature is matched within ±5°C only when three such peers exist. This
  does not establish a cause: battery temperature, preconditioning, charger
  limits and other conditions are not controlled.

The comparison reads the existing Odovi archive and requires no new provider,
vehicle contact, tracking, or database migration.

## Demo without a car

No Tesla, no TeslaMate? The demo stack starts a fully populated app with six weeks of synthetic driving data:

```bash
export ODOVI_SETUP_TOKEN="v1.$(date +%s).$(openssl rand -hex 32)"
docker compose -f docker-compose.demo.yml up -d --build
# -> http://localhost:3000; use the setup token above and choose a password
```

Details: [docs/demo.md](docs/demo.md)

## Stack

pnpm monorepo: Next.js 15 (`apps/web`) · sync worker (`apps/worker`) · Drizzle schema (`packages/db`) · pure domain logic (`packages/core`) · PostgreSQL 17 · Docker Compose.

## Development

Without a real car - a fixture TeslaMate database with 6 weeks of synthetic driving data is included:

```bash
pnpm install
pnpm dev:db                                # odovi-db :5432 + fixture teslamate-db :5433
pnpm db:seed:teslamate                     # ~140 trips, charging, geofences (Zurich area)
DATABASE_URL=postgres://odovi:odovi@localhost:5432/odovi pnpm db:migrate
pnpm --filter @odovi/worker dev        # Sync loop (needs DATABASE_URL + TESLAMATE_DATABASE_URL, see .env.development.example)
pnpm --filter @odovi/web dev           # http://localhost:3000
```

Tests: `pnpm test` · typecheck: `pnpm lint` · more: [CONTRIBUTING.md](CONTRIBUTING.md)

## Deployment

Docker Compose on a home server/NAS/Raspberry Pi in your LAN or VPN (for example Tailscale), connected to the existing TeslaMate Postgres through a read-only role.

Use the immutable Compose asset attached to the
[0.2.0 stable release](https://github.com/jsc2304/odovi/releases/tag/v0.2.0).
It pins the exact tested web and worker images for `linux/amd64` and
`linux/arm64`; no GitHub login or local application build is needed.
See the [acceptance summary](release/0.2.0/acceptance-summary.json) for the
automated, native Raspberry Pi and upgrade checks.

Upgrading an installation created before the Odovi rename? Follow
[`docs/rename-to-odovi.md`](docs/rename-to-odovi.md) before starting the renamed
Compose stack so the existing PostgreSQL volume remains attached.

### Requirements

- Docker + Docker Compose (plugin) on the target device (Raspberry Pi, NAS, home server)
- >= 4 GB RAM
- A running TeslaMate v4.0.1 through v4.2.0 installation with reachable Postgres
  (LAN, VPN, or same Docker host); see the
  [tested compatibility matrix](docs/teslamate-compatibility.md)

For a **new installation**, create an empty directory and download the pinned
Compose file and configuration template. Do not run these commands over an
existing installation or `.env`:

```bash
mkdir odovi &&
cd odovi &&
curl -fL https://github.com/jsc2304/odovi/releases/download/v0.2.0/odovi-0.2.0-docker-compose.yml -o docker-compose.yml &&
curl -fL https://raw.githubusercontent.com/jsc2304/odovi/v0.2.0/.env.example -o .env &&
chmod 600 .env
```

The following steps assume this directory and the explicit Compose project
name `odovi`. Keep that project name for future operations.

### 0. No TeslaMate yet? Install it too

A minimal TeslaMate Compose setup (without Grafana) is available under [deploy/teslamate/](deploy/teslamate/docker-compose.yml) - instructions are in the file header. Then sign in to the Tesla account at `http://<host>:4000`. To let Odovi reach the TeslaMate database through the Compose service name `database`, create a `docker-compose.override.yml` in the Odovi directory:

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

Odovi only reads the TeslaMate database - it never writes to it. Run this on the TeslaMate Postgres:

```sql
CREATE ROLE odovi_ro WITH LOGIN PASSWORD 'a-secure-password';
GRANT CONNECT ON DATABASE teslamate TO odovi_ro;
GRANT USAGE ON SCHEMA public TO odovi_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO odovi_ro;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO odovi_ro;
```

### 2. Configure `.env`

Edit the downloaded `.env`. For a source checkout instead, copy
`.env.example` to `.env` first.

The complete release contract, defaults, validation rules, and consumer mapping
are in [`docs/runtime-configuration.md`](docs/runtime-configuration.md). Set at
least:

- `POSTGRES_PASSWORD` - password for the new Odovi-owned Postgres (required, no default)
- `TESLAMATE_DATABASE_URL` - connection string for the `odovi_ro` role against the TeslaMate database (LAN/Tailscale host or Compose service name, see comments in `docker-compose.yml`)
- optional behavior such as `WEB_PORT`, `APP_TIMEZONE`, `SYNC_INTERVAL_SECONDS`,
  secure cookies, elevation, and Tesla provider settings only as
  documented in the runtime configuration reference

### 3. Start the stack

For the stable release:

```bash
docker compose --project-name odovi pull
docker compose --project-name odovi up -d
```

This validates the release configuration once, lets the `migrate` service
apply Drizzle migrations once
(`restart: "no"`, it must complete successfully), and then starts `db`, `web`,
and `worker` permanently (`restart: unless-stopped`).

Developers using the repository's source-build Compose file can run
`docker compose --project-name odovi up -d --build` instead. Source builds are
not the immutable release artifact.

### Operational status and recovery

Odovi exposes two intentionally different unauthenticated probes:

```bash
curl -fsS http://localhost:${WEB_PORT:-3000}/api/health  # process liveness only
curl -fsS http://localhost:${WEB_PORT:-3000}/api/ready   # product readiness
```

`/api/health` stays healthy while the HTTP process runs. `/api/ready` returns
HTTP 503 (`not_ready`) when the Odovi database, required migration, or protected
application schema is unavailable. A stopped/stale worker, incompatible or
unreachable TeslaMate schema, or activated optional provider outage returns
HTTP 200 with `degraded`: the Core Archive remains available while sync or the
named optional capability needs attention. The public response contains stable
codes and timestamps, never connection strings or raw upstream errors.

Open **More → Diagnostics** for localized recovery steps. Useful first checks:

```bash
docker compose --project-name odovi ps
docker compose --project-name odovi logs db migrate web worker
docker compose --project-name odovi up migrate
docker compose --project-name odovi up -d web worker
```

Do not rerun or manually edit migrations before taking a verified database
backup. Optional weather, map, search, routing and elevation failures do not
require restoring the database; check internet/DNS and the activated provider,
or disable that capability under Provider Review.

### 4. First sign-in

Generate a short-lived setup token on the Odovi host, copy it into `.env`, and
restart the web service before opening the first-login form:

```bash
printf 'v1.%s.%s\n' "$(date +%s)" "$(openssl rand -hex 32)"
# copy the output to ODOVI_SETUP_TOKEN in .env
docker compose --project-name odovi up -d web
```

The token expires after 24 hours and can create only the first `admin` account.
Remove `ODOVI_SETUP_TOKEN` from `.env` after setup. Future sign-ins use only the
administrator password chosen in the form.

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
private virtual key remains in the command proxy and is never stored in Odovi.
When `TESLA_PUBLIC_KEY_PEM_BASE64` is set, Odovi serves the public half at
Tesla's required `/.well-known/appspecific/com.tesla.3p.public-key.pem` path.

The vehicle always recalculates the route and charging strategy from the sent
checkpoint order. Test the handoff with the parked vehicle before relying on it
for a trip.

### Update

Existing v0.1.1 installations must follow the
[Supported Rename Upgrade](docs/rename-to-odovi.md), including a tested backup,
the existing database/volume identity, mandatory Provider Review and rollback.
Use accepted versioned release artifacts, not a moving branch or `latest`.

### Backup

Use `node scripts/database-backup.mjs inspect|backup|restore` with an explicit
Compose project, file and environment. It resolves the configured database,
refuses active writers or nonempty restore destinations, and produces a private,
checksum-verified PostgreSQL archive. See the
[upgrade/restore runbook](docs/rename-to-odovi.md) for exact commands.

The archive includes accounts, sessions, annotations, places, tags, rules,
journeys, archive data and sync state. TeslaMate and external configuration /
encryption keys require their own backups.

### Import history (Tessie)

If you previously used Tessie, you can import the raw data export (CSV time series) - Odovi reconstructs trips, parking sessions, and charging sessions from it:

```bash
docker compose run --rm -v /path/to/tessie-export:/import:ro worker \
  node dist/cli.js import-tessie /import
```

Idempotent (safe to run multiple times), does not collide with TeslaMate data.

## Limitations (honest)

- **Requires TeslaMate** as the tracking data source; optional Fleet API access is only used when explicitly sending a planned route
- **One vehicle** per instance is the current focus
- **Number formatting** is currently consistently de-DE (decimal comma), including in the English UI
- **Charging stops are explicit checkpoints** - automatic charger discovery/optimization is not implemented yet; default routing uses the public OSRM demo server
- **No tax/legal opinion**: exports are logbook-like with audit log, but acceptance by the tax office depends on the individual case

## Contributing and Security

- Contributions: [CONTRIBUTING.md](CONTRIBUTING.md) · Issues are welcome in German or English
- Support is provided on a Best-effort basis through [GitHub Issues](https://github.com/jsc2304/odovi/issues), without a response-time SLA. Copy the exact version and build identity from **More → About Odovi** into the report.
- Please report security vulnerabilities privately through [GitHub Security Advisories](https://github.com/jsc2304/odovi/security/advisories/new), never as a public issue. See [SECURITY.md](SECURITY.md).
- Release acceptance: [docs/release-acceptance.md](docs/release-acceptance.md)
- Changes: [CHANGELOG.md](CHANGELOG.md)

## License

The current `0.2.x` versions are available under
[FSL-1.1-ALv2](LICENSE) © 2026 Jan Schultheiss. This is a Fair Source /
source-available license: self-hosting, source inspection and modifications for
non-competing purposes are permitted, while a competing commercial product or
service is not. Each version automatically also becomes available under
Apache-2.0 after two years.

Previously published releases `v0.1.0`, `v0.1.1` and earlier public branch
commits remain available under AGPL-3.0 for copies received under those terms.
The marketing site and brand assets have separate terms. See
[LICENSING.md](LICENSING.md) and [TRADEMARKS.md](TRADEMARKS.md) for the exact
scope. The license text controls over this summary.
