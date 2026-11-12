# Release pipeline

Odovi separates building a Release Candidate from promoting it to the Stable
Self-hosted Release. Both steps are local maintainer actions. GitHub Actions
runs only the fast lint, unit-test, and build job in `.github/workflows/ci.yml`. It
does not build images or publish packages, tags, or GitHub Releases.

## Local gates

From the source revision to release:

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm test
pnpm audit:prod
pnpm release:check
```

Validate the versioned Compose file with the commands under
[Local consistency and Compose checks](#local-consistency-and-compose-checks).
Build the web and worker images for `linux/amd64` and `linux/arm64` from
`apps/web/Dockerfile` and `apps/worker/Dockerfile`, passing `ODOVI_VERSION` and
`ODOVI_COMMIT_SHA`. Check each published image with
`node scripts/verify-release-image.mjs`.

Run the disposable acceptance stack on the maintainer machine. See
[Release acceptance](../release-acceptance.md). A normal run writes local
evidence and does not publish packages or releases.

## Candidate publication

Publication is a separate manual step from `main`, after the same source
commit has passed the local gates above and both architecture checks. Publish
only the candidate tag from `release/0.5.0/release.json`, never `latest` or a
stable tag. Run acceptance against those exact digests, then write the
candidate record from the passing manifest:

```bash
ODOVI_ACCEPTANCE_BUILD=0 \
ODOVI_ACCEPTANCE_VERSION=0.5.0 \
ODOVI_WEB_IMAGE="ghcr.io/jsc2304/odovi-web@${ODOVI_WEB_DIGEST:?published candidate digest}" \
ODOVI_WORKER_IMAGE="ghcr.io/jsc2304/odovi-worker@${ODOVI_WORKER_DIGEST:?published candidate digest}" \
./scripts/release-acceptance.sh

manifest="$(find acceptance-results -name manifest.json -type f -print -quit)"
test -n "$manifest"
node scripts/create-release-candidate.mjs \
  release/0.5.0/release.json \
  "$SOURCE_COMMIT" \
  "$ODOVI_WEB_DIGEST" \
  "$ODOVI_WORKER_DIGEST" \
  "$manifest" \
  release-candidate.json
```

A failed acceptance can leave an unaccepted candidate tag in the registry, but
that tag cannot be promoted. The record is accepted only when every required
gate passed.

## Stable promotion

Promotion is a second manual step on `main`. Confirm the candidate record
against the release metadata and the source commit that produced the images.
Validation code, release metadata, Compose templates, and release notes stay
on that trusted revision. Render the versioned Compose asset from the accepted
digests and retag those digests without rebuilding:

```bash
node scripts/verify-release-candidate.mjs \
  release/0.5.0/release.json \
  release-candidate.json \
  jsc2304/odovi \
  "$SOURCE_COMMIT"

node scripts/render-release-compose.mjs \
  release/0.5.0/docker-compose.yml \
  "$ODOVI_WEB_DIGEST" \
  "$ODOVI_WORKER_DIGEST" \
  odovi-0.5.0-docker-compose.yml

docker buildx imagetools create \
  --tag ghcr.io/jsc2304/odovi-web:0.5.0 \
  "ghcr.io/jsc2304/odovi-web@${ODOVI_WEB_DIGEST:?accepted digest}"
docker buildx imagetools create \
  --tag ghcr.io/jsc2304/odovi-worker:0.5.0 \
  "ghcr.io/jsc2304/odovi-worker@${ODOVI_WORKER_DIGEST:?accepted digest}"
```

Attach `odovi-0.5.0-docker-compose.yml` and `release-candidate.json` to the
GitHub Release for the same source commit. Nothing is rebuilt.

Promotion remains blocked while any required acceptance dependency in the
release metadata is not enforced and recorded by the harness. This deliberately
keeps an image-build milestone from being mistaken for public-launch readiness.

Publishing a candidate or a stable release authorizes only that release. It
does not authorize future releases, deployments, or paid distribution.

Native Raspberry Pi runtime checks and the 0.4.0 → 0.5.0 upgrade/restore/rollback
rehearsal use the same candidate images. Record their results in a reviewed
`acceptance-summary.json`; do not copy acceptance claims from the 0.2.0 release.
The source release notes describe the required gates, and the attached records
establish which checks passed for the published image digests.

After promotion, a documentation-only update can point the README at the stable
assets and publish the reviewed acceptance summary. It does not change the
accepted source revision embedded in the images or require rebuilding them.

## Local consistency and Compose checks

```bash
node scripts/check-release-consistency.mjs release/0.5.0/release.json
ODOVI_WEB_DIGEST=sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa \
ODOVI_WORKER_DIGEST=sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb \
ODOVI_ENV_FILE="$PWD/tests/runtime-config/required.env" \
docker compose --env-file tests/runtime-config/required.env \
  -f release/0.5.0/docker-compose.yml config --quiet
```

Development and advanced operators can continue building directly from source
with the root `docker-compose.yml`; that path is intentionally not replaced by
the immutable release stack.
