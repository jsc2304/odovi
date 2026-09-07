# Versioned Release Stack acceptance

This harness is the executable acceptance seam for a disposable Odovi release.
It starts exact web, worker, and fixture image tags in an isolated Compose
project; seeds synthetic TeslaMate data; drives the real browser surface; and
removes the project-scoped containers, network, and volumes afterward.

It never reads or joins an operator's Odovi or TeslaMate network or volume. The
host port is selected dynamically and bound only to `127.0.0.1`. Runtime
databases and the worker use an internal Docker network. The web container also
joins a browser-access bridge so its loopback-published port works consistently;
its Node fetch remains guarded. A Node preload and Playwright route guard block
and record location-provider requests before they reach a live third party.

## Local invocation

Requirements: Node 22+, pnpm 9.15.9 through Corepack, Docker with Compose v2,
and Chromium for Playwright.

```bash
pnpm install --frozen-lockfile
npm ci --prefix acceptance/release-stack
npm exec --prefix acceptance/release-stack -- playwright install chromium
./scripts/release-acceptance.sh
```

The default mode builds local source into exact development tags such as
`odovi-web:0.3.0-dev.<commit>`. To exercise already-published candidate images
without rebuilding them:

```bash
ODOVI_ACCEPTANCE_BUILD=0 \
ODOVI_ACCEPTANCE_VERSION=0.3.0 \
ODOVI_WEB_IMAGE="ghcr.io/jsc2304/odovi-web@${ODOVI_WEB_DIGEST:?Copy the published candidate digest}" \
ODOVI_WORKER_IMAGE="ghcr.io/jsc2304/odovi-worker@${ODOVI_WORKER_DIGEST:?Copy the published candidate digest}" \
./scripts/release-acceptance.sh
```

The candidate registry tag is `0.3.0-rc.1`; its embedded product version is
`0.3.0` so stable promotion can preserve the exact tested images without a
rebuild. Use the publication run's immutable digests for candidate acceptance,
not a moving tag. This command does not publish or promote anything.

Useful controls:

- `ODOVI_ACCEPTANCE_PORT`: fixed loopback port instead of an automatically
  selected free port.
- `ODOVI_ACCEPTANCE_RUN_ID`: stable evidence-directory name.
- `ODOVI_ACCEPTANCE_CHROMIUM_EXECUTABLE`: explicitly select an installed
  Chromium executable, such as `/usr/bin/chromium`, when the managed Playwright
  browser is unavailable on a native host. The default remains Playwright's
  managed browser. Record the selected browser's version with the run evidence;
  the manifest records the executable choice, not its version.
- `ODOVI_ACCEPTANCE_KEEP_STACK=1`: retain the disposable stack for debugging;
  remove it later with the exact project name in `manifest.json`.
- `ODOVI_ACCEPTANCE_SETUP_TOKEN`: override the generated, short-lived setup
  token. Normal runs generate one automatically. Because failed browser traces
  may contain submitted form values, treat acceptance evidence as sensitive and
  delete it after review; the token itself expires after 24 hours.
- `ODOVI_ACCEPTANCE_EGRESS_ALLOWLIST`: comma-separated declared hosts. Requests
  are still blocked. Any host outside this list fails the run as undeclared.

## Automated journey

The current baseline performs:

1. fresh, browser-driven administrator setup including a validation error;
2. manual language switching and persistence;
3. login and deterministic first synchronization from synthetic TeslaMate data;
4. day view, keyboard classification, and CSV export;
5. the Settings discovery path reserved for release identity;
6. logout;
7. representative desktop, mobile, 200% scale, and zoom-permission checks;
8. continued Core Archive use while every browser and server-side External
   Location Provider request is blocked;
9. web and worker restart followed by distinct liveness and readiness probes,
   login, and persisted day data;
10. DC comparison in English and German, five/ten-session selection, accessible
    recorded values and mobile layout;
11. yearly destination and Wrapped filters, twelve-month data, separate annual
    charging scope, and browser print/PDF layout in both languages;
12. healthy, worker-stale, TeslaMate-incompatible, optional-provider-outage,
    migration-incomplete, protected-app-unavailable, and database-unavailable
    status transitions, including recovery to healthy after every injected
    fault.

## Evidence format

Each run writes `acceptance-results/<timestamp>-<commit>/`:

- `manifest.json`: schema version, result, commit, release version, exact image
  tags, fixture day, Compose project, browser executable choice, readiness path,
  and acceptance gates;
- `compose-config.yml`, `compose-ps.json`, `compose.log`, `compose-down.log`,
  `image-inspect.json` (local image IDs and repository digests when available);
- `container-egress.ndjson`, `browser-egress.ndjson`, `egress-summary.json`;
- `readiness-states.ndjson`: sanitized healthy, degraded, and not-ready
  contracts captured for each injected failure and recovery;
- phase-specific Playwright JSON, HTML report, traces, screenshots, and videos.

NDJSON egress rows contain timestamp, source, method, host, path, declaration
status, and the blocked outcome. They deliberately omit query strings because
those can contain coordinates. `verify-egress.mjs` fails if any recorded host
is undeclared.

## CI invocation

`.github/workflows/release-acceptance.yml` runs the same command for pull
requests and manual dispatches, then uploads only the sanitized manifest, including when
the run fails. It does not publish images, tags, releases, or deployments.

## Acceptance gates

The harness verifies administrator setup, build identity, language selection,
readiness and recovery, explicit provider activation, map fallbacks, and
TeslaMate compatibility. A candidate is incomplete until every required gate
is enforced. Passing automated checks does not itself authorize publication.
