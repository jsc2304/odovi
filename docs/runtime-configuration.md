# Runtime configuration

The optional [Tesla invoice archive](invoice-archive.md) uses the existing
Odovi PostgreSQL database and its persistent named volume. Enable imports in
**More → Tesla invoices**; the setting is stored in the database and is off by
default. There are no invoice service credentials, provider activation or
extra writable mounts. Archive processing limits and recovery are documented
in the linked runbook.

This document is the authoritative configuration reference for the Odovi
self-hosted release. The release interface is `docker-compose.yml` plus a
`.env` copied from `.env.example`. `docker compose up` runs `config-check`
before migration, web, or worker startup. Invalid, contradictory, unsafe, and
unknown release settings stop the dependent services with an actionable error.

Version 0.3.0 retains the 0.2.0 configuration contract. DC comparison and yearly
insights add no environment variables, database migration or provider
activation. Preserve the existing `.env` when following the
[0.2.0 → 0.3.0 upgrade procedure](upgrade-odovi.md).

## Required release settings

| Setting | Consumer | Contract |
| --- | --- | --- |
| `POSTGRES_PASSWORD` | Compose database; embedded in web, worker, and migration `DATABASE_URL` values | Non-empty and URL-safe: letters, digits, `.`, `_`, `~`, or `-`. |
| `TESLAMATE_DATABASE_URL` | Worker; web receives it only for the optional read-only diagnostic | Absolute `postgres://` or `postgresql://` URL with host and database. Use a read-only TeslaMate role. |

`DATABASE_URL` is deliberately not a release setting. Compose constructs the
same Odovi database URL for each real consumer, preventing contradictory
database identities.

## Optional release settings

| Setting | Default | Consumer | Validation and effect |
| --- | --- | --- | --- |
| `ODOVI_DB_USER` | `odovi` | Compose database, migration, web, worker | PostgreSQL identifier. Use legacy identity only for the documented rename upgrade. |
| `ODOVI_DB_NAME` | `odovi` | Compose database, migration, web, worker | PostgreSQL identifier. |
| `ODOVI_DB_VOLUME_NAME` | `odovi-db-data` | Compose | Docker volume name. |
| `WEB_PORT` | `3000` | Compose/web port mapping | Integer from 1 through 65535. |
| `APP_TIMEZONE` | `Europe/Zurich` | Web and worker classification | Valid IANA time zone, for example `Europe/Berlin`. |
| `SYNC_INTERVAL_SECONDS` | `60` | Worker | Integer from 5 through 86400. |
| `ODOVI_SETUP_TOKEN` | unset | Web | Temporary first-administrator token generated as shown in the [first-sign-in instructions](../README.md#4-first-sign-in), or by `pnpm setup-token` in a source checkout. It expires after 24 hours and is unusable after the first account is created. Remove it after setup. |
| `FORCE_SECURE_COOKIES` | `false` | Web sessions | Exactly `true` or `false`. Enable behind HTTPS when proxy headers cannot express the original scheme. |
| `ELEVATION_MAX_POINTS_PER_CYCLE` | internal default `500` | Worker archive enrichment | Integer from 1 through 10000. It only tunes batches after Provider Review activates elevation. |

Boolean settings intentionally accept only `true` and `false`; values such as
`yes`, `1`, or misspellings are rejected instead of silently changing behavior.

`ELEVATION_ENABLED` is accepted temporarily when carried over from a v0.1.1
environment, but it has no effect and should be removed. Elevation is disabled
until an administrator explicitly activates that capability in Provider Review.
`ELEVATION_MAX_POINTS_PER_CYCLE` only tunes the batch size after activation.

## Custom Location Provider credentials

Provider endpoints, names, contacts, limits, modes, and credential-header names
are configured through the authenticated Location Provider Review in Settings.
When a custom endpoint needs a credential, supply its value to the relevant
process through the matching runtime variable:

- `ODOVI_LOCATION_PROVIDER_WEATHER_CREDENTIAL`
- `ODOVI_LOCATION_PROVIDER_ELEVATION_CREDENTIAL`
- `ODOVI_LOCATION_PROVIDER_MAP_TILES_CREDENTIAL`
- `ODOVI_LOCATION_PROVIDER_ADDRESS_SEARCH_CREDENTIAL`
- `ODOVI_LOCATION_PROVIDER_ROUTING_CREDENTIAL`
- `ODOVI_LOCATION_PROVIDER_EXTERNAL_NAVIGATION_CREDENTIAL`

Routing and route elevation are configured per capability in **Settings →
Location providers**. The legacy `OSRM_URL` setting is intentionally rejected
by release validation: it bypassed disclosure and could not represent an
independent Provider Activation. Custom routing expects an OSRM-compatible base
URL; custom route elevation expects an Open-Meteo-compatible elevation endpoint.

Odovi stores only the credential-header name, never the secret value. Changing
an endpoint in Provider Review or replacing a runtime credential does not
require a software release. Restart the affected web or worker process after
changing its environment.

## Optional Tesla Fleet API provider

Direct route handoff is disabled when all activation settings are absent. If
one activation setting is present, the complete required group must be valid:

| Setting | Required when activated | Contract |
| --- | --- | --- |
| `TESLA_CLIENT_ID` | yes | Non-empty Tesla developer application client ID. |
| `TESLA_CLIENT_SECRET` | yes | Non-empty client secret. |
| `TESLA_REDIRECT_URI` | yes | Absolute HTTPS callback URL. |
| `TESLA_PARTNER_DOMAIN` | yes | Hostname only, without scheme or path. |
| `TESLA_TOKEN_ENCRYPTION_KEY` | yes | Exactly 32 bytes encoded as base64. |
| `TESLA_PUBLIC_KEY_PEM_BASE64` | no | Public virtual-key PEM encoded as base64. |
| `TESLA_FLEET_API_BASE_URL` | no | HTTPS base URL; defaults to Tesla's European Fleet API. |
| `TESLA_COMMAND_API_URL` | no | HTTPS compatible command-proxy base URL. |

`TESLA_COMMAND_PROXY_URL` remains accepted as a deprecated compatibility name.
Do not set it together with a different `TESLA_COMMAND_API_URL`; that
contradiction is rejected.

## Startup and shutdown behavior

From the directory containing the downloaded, immutable release Compose file
and the configured `.env`, run:

```bash
docker compose --project-name odovi --env-file .env config --quiet
docker compose --project-name odovi --env-file .env up -d
```

Use the actual existing project name for an upgrade. Source builds use the root
Compose file and are separate from the immutable release installation.

Compose starts `config-check` first. Web and worker also validate their own
effective environments at their process boundaries, so direct container or
process starts fail the same way. The worker validates before opening its retry
loop. On `SIGTERM` or `SIGINT`, it stops scheduling work, finishes the active
synchronization slice, closes both database clients, and exits. Compose grants
that slice up to ten minutes before forced termination.

To use a nonstandard environment-file path for Compose validation, point both
Compose interpolation and `config-check` at the same file:

```bash
ODOVI_ENV_FILE=/secure/odovi.env docker compose --project-name odovi --env-file /secure/odovi.env config --quiet
ODOVI_ENV_FILE=/secure/odovi.env docker compose --project-name odovi --env-file /secure/odovi.env up -d
```

## Development-only settings

Local `pnpm` processes use `.env.development.example` as a starting point.
`DATABASE_URL` is valid for a direct web, worker, CLI, or migration process but
is rejected as an unknown setting in the release `.env`; Compose owns that
value. The hardcoded credentials and ports in `docker-compose.dev.yml` and
`docker-compose.demo.yml` are disposable development/demo configuration, not a
supported release contract.
