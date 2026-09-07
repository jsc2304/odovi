# Release pipeline

Odovi separates building a Release Candidate from promoting it to the Stable
Self-hosted Release. Both workflows are manual. A normal run is a local-output
dry run and has no permission to publish packages or releases.

## Release Candidate dry run

Run **Release Candidate → dry-run** from the required source revision. It runs
the complete CI and production dependency gates, validates the versioned
Compose file and cross-surface release consistency, builds web and worker for
`linux/amd64` and `linux/arm64`, checks their image labels, and runs the
disposable release acceptance stack. Evidence is retained as workflow
artifacts; no image, tag, or GitHub Release is published.

## Candidate publication

Candidate publication is a separate manual dispatch from `main`. Select
`publish-candidate` and enter the exact phrase shown by the workflow. Publishing
cannot start until the same source commit has passed complete CI, dependency,
Compose, consistency, and both-architecture build gates. It publishes only
candidate tags, never `latest` or a stable tag. Runtime acceptance then runs
against those exact digests; only a passing run produces the authoritative
`release-candidate.json` record. A failed acceptance can therefore leave an
unaccepted candidate tag in the registry, but it cannot be promoted.

## Stable promotion

Stable promotion is a second manual workflow. It downloads an accepted
candidate record from the specified candidate workflow run, verifies that the
record belongs to this repository and matches the checked-out source revision,
and promotes the recorded digests with `docker buildx imagetools create`.
Nothing is rebuilt. The same digests are written into the versioned Compose
asset and attached to the GitHub Release.

Promotion remains blocked while any required acceptance dependency in the
release metadata is not enforced and recorded by the harness. This deliberately
keeps an image-build milestone from being mistaken for public-launch readiness.

Entering a publication phrase authorizes only that workflow run. It does not
authorize future releases, deployments, or paid distribution.

Native Raspberry Pi runtime checks and the 0.2.0 → 0.3.0 upgrade/restore/rollback
rehearsal use the same candidate images. Record their results in a reviewed
`acceptance-summary.json`; do not copy acceptance claims from the 0.2.0 release.
The source release notes describe the required gates, and the attached records
establish which checks passed for the published image digests.

After promotion, a documentation-only update can point the README at the stable
assets and publish the reviewed acceptance summary. It does not change the
accepted source revision embedded in the images or require rebuilding them.

## Local consistency and Compose checks

```bash
node scripts/check-release-consistency.mjs release/0.3.0/release.json
ODOVI_WEB_DIGEST=sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa \
ODOVI_WORKER_DIGEST=sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb \
ODOVI_ENV_FILE="$PWD/tests/runtime-config/required.env" \
docker compose --env-file tests/runtime-config/required.env \
  -f release/0.3.0/docker-compose.yml config --quiet
```

Development and advanced operators can continue building directly from source
with the root `docker-compose.yml`; that path is intentionally not replaced by
the immutable release stack.
