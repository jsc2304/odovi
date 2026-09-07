# Supported Rename Upgrade: v0.1.1 → v0.2.0

This is the backup, migration, verification, restore and rollback path for an
existing public Tripatlas **v0.1.1** installation. It does not modify TeslaMate.
Do not use `git pull`, `latest` or a moving development branch. **Use the accepted
public v0.2.0 release artifacts before applying this to real data**, not an
unaccepted candidate or a local development build.

This document preserves the original rename path to 0.2.0. Once that version is
running and verified, use the [0.2.0 → 0.3.0 procedure](upgrade-odovi.md) for the
next update. Run the version-specific commands below from the accepted 0.2.0
source archive; current repository defaults can target a newer release. Do not
replace the version pins below to combine both steps.

## Pinned artifacts

v0.1.1 was distributed as source, not published immutable containers:

- Annotated tag: `0e85cbc879cc2d245d22341e73f52c38f57444e1`
- Commit: `eeaab1ed41d723e8a295e3b82b2c447345d29f7f`
- [Public source archive](https://codeload.github.com/jsc2304/odovi/tar.gz/eeaab1ed41d723e8a295e3b82b2c447345d29f7f)
- SHA-256: `b37e43da3d6a9c393c272a80a0c879795356ea4257b48272bee6f34831b2de49`

These identities reflect the documentation cleanup. The v0.1.1 runtime source,
Dockerfiles and dependency lockfile are unchanged. The machine-readable pin is
`acceptance/rename-upgrade/legacy-artifact.json`.

The acceptance runner verifies that archive and builds its unchanged Dockerfiles
and lockfile. Its base-image references were mutable; keep your actual old image
IDs for rollback. The target is the **accepted v0.2.0 source archive, versioned
Compose and candidate record with web/worker digests**, all from one accepted
commit. See the [release artifact contract](releases/pipeline.md).

Keep the existing Compose project, PostgreSQL role/name/password and actual
volume for the first upgrade. Renaming the database/role is outside this supported
path. The backup utility requires Node.js 22+ on the operator host, Docker Compose
v2 and the existing PostgreSQL 17 `db` container.

## 1. Identify the existing installation

Use the exact files/overrides that start your stack. These examples are Bash;
replace the paths/project with real values after checking `docker compose ls`:

```bash
OLD_DIR=/absolute/path/to/existing-installation
NEW_DIR=/absolute/path/to/accepted-odovi-0.2.0-source
BACKUP_ROOT=/absolute/path/to/private-backups
PROJECT=your-existing-compose-project
OLD_COMPOSE="$OLD_DIR/docker-compose.yml"
TOOLS="$NEW_DIR/scripts/database-backup.mjs"
old=(docker compose --project-name "$PROJECT" --env-file "$OLD_DIR/.env" --file "$OLD_COMPOSE")
node "$TOOLS" inspect --project "$PROJECT" --env-file "$OLD_DIR/.env" --file "$OLD_COMPOSE"
```

Add each existing `--file` override to **both** `old[]` and every backup command.
Inspection prints only project, user, database and actual volume, and fails if
the configured mount differs from the running container. Default v0.1.1 uses role
and database `tripatlas`; custom installations retain their own names.

Privately preserve `.env`, overrides, proxy/TLS configuration, external mounts,
Tesla encryption keys and browser offline data too: they are not in a database
dump. Pre-download the target images by accepted digest before downtime.

## 2. Freeze writes and back up

Downtime starts when web/worker stop and includes dump, migration and verification.
Duration depends on archive size/disk speed: measure it on a restored copy first.
TeslaMate keeps collecting data; Odovi catches up later. Stop scheduled imports
and prevent user writes during this checkpoint.

```bash
mkdir -p "$BACKUP_ROOT"
chmod 700 "$BACKUP_ROOT"
CHECKPOINT="$BACKUP_ROOT/pre-odovi-0.2.0-$(date -u +%Y%m%dT%H%M%SZ)"
"${old[@]}" stop web worker
node "$TOOLS" backup --project "$PROJECT" --env-file "$OLD_DIR/.env" \
  --file "$OLD_COMPOSE" --directory "$CHECKPOINT"
OLD_WEB_ID=$(docker inspect --format '{{.Image}}' "$("${old[@]}" ps --all --quiet web)")
OLD_WORKER_ID=$(docker inspect --format '{{.Image}}' "$("${old[@]}" ps --all --quiet worker)")
docker image save --output "$CHECKPOINT/old-images.tar" "$OLD_WEB_ID" "$OLD_WORKER_ID"
printf '%s\n%s\n' "$OLD_WEB_ID" "$OLD_WORKER_ID" > "$CHECKPOINT/old-image-ids.txt"
```

The utility refuses active writers and existing checkpoint directories. It
creates a mode-0700 directory with a custom-format PostgreSQL archive, SHA-256,
archive listing, identity and resolved Compose configuration. **This includes
passwords, account hashes and location data: encrypt off-host copies; never post
it to an issue.** An incomplete checkpoint has no valid manifest; do not migrate.
If backup fails, restart the old app and resolve the cause first.

Before upgrading real data, rehearse section 5 with a different disposable project,
fresh volume, isolated network and port. Archive listing alone is not restore
proof: include login and export. Keep old images and volumes; do not prune them.

## 3. Upgrade without changing database identity

Prepare a private target `.env`, keeping database password, TeslaMate read-only
connection, timezone, port and encryption keys. Remove `INITIAL_ADMIN_PASSWORD`
(the existing account remains) and obsolete provider activation variables; do
not use a setup token to replace an existing account. Follow the
[runtime configuration contract](runtime-configuration.md).

Set these adapters to the **actual output from step 1**, not guessed defaults:

```dotenv
ODOVI_DB_USER=tripatlas
ODOVI_DB_NAME=tripatlas
ODOVI_DB_VOLUME_NAME=exact-existing-volume-name
ODOVI_WEB_DIGEST=sha256:accepted-web-digest
ODOVI_WORKER_DIGEST=sha256:accepted-worker-digest
```

Preserve required TeslaMate network connections in a target Compose override.

```bash
export ODOVI_ENV_FILE="$NEW_DIR/.env"
new=(docker compose --project-name "$PROJECT" --env-file "$NEW_DIR/.env" \
  --file "$NEW_DIR/release/0.2.0/docker-compose.yml")
"${new[@]}" config --quiet
node "$TOOLS" inspect --project "$PROJECT" --env-file "$NEW_DIR/.env" \
  --file "$NEW_DIR/release/0.2.0/docker-compose.yml"
"${new[@]}" run --rm --no-deps config-check
# First database-changing boundary: requires a tested pre-upgrade checkpoint.
"${new[@]}" run --rm --no-deps migrate
"${new[@]}" up -d --no-deps web
```

Never run `down --volumes` on an operator stack. Do not run old code against the
migrated database as a shortcut rollback.

## 4. Verify before reopening access

```bash
curl -fsS http://127.0.0.1:3000/api/health
curl -fsS http://127.0.0.1:3000/api/ready
```

Use the configured port. `degraded` is expected while the worker is stopped;
`not_ready`/503 is a stop signal. Verify existing password and session login,
Settings showing **Odovi 0.2.0 and the accepted build commit**, annotated drives,
places, tags, rules, manual charging costs, journey membership and CSV/GPX exports.

**Location Provider Review is required, all six capabilities start off.** Review
each disclosure and save each decision. Keeping all off is valid; the Core Archive
remains usable. The upgrade does not activate providers. Existing `tripatlas_*`
cookies and `tripatlas:*` storage are compatibility inputs; new writes use Odovi
names. A hostname change does not automatically move browser offline data.

```bash
"${new[@]}" up -d --no-deps worker
curl -fsS http://127.0.0.1:3000/api/ready
```

Confirm successful sync, no duplicates and preserved annotations before reopening
user access. Later writes are **not** in the pre-upgrade checkpoint: rollback
would discard them unless preserved separately. Take a post-upgrade checkpoint
before recovery experiments.

## 5. Restore or roll back

Restore refuses nonempty databases. Preserve the failed volume and configure a
**new explicitly named recovery volume**, retaining database role/name/password.
Start only `db`; do not let migrate/web/worker initialize the empty destination.
For Odovi recovery, set `ODOVI_DB_VOLUME_NAME` to the new volume and use a checkpoint
made by the same Odovi version:

```bash
"${new[@]}" stop web worker
# Edit recovery .env to select a NEW volume; preserve the old volume.
"${new[@]}" up -d --no-deps --wait db
node "$TOOLS" restore --project "$PROJECT" --env-file "$NEW_DIR/.env" \
  --file "$NEW_DIR/release/0.2.0/docker-compose.yml" \
  --directory /absolute/path/to/odovi-checkpoint --confirm "$PROJECT/tripatlas"
"${new[@]}" up -d --no-deps web worker
```

Use the actual database name in `--confirm`. The utility checks identity, checksum,
stopped writers and empty destination, then restores in one transaction. On error
the destination remains empty. Schema, data, sequences and user/session records
are restored. Compose recreates the owner role; additional hand-managed cluster
roles/grants need a separate backup and are outside the single-role supported path.

For rollback, use the **pre-upgrade** checkpoint and exact saved v0.1.1 images.
Create a rollback override beside the original Compose (replace all placeholders):

```yaml
services:
  web:
    image: sha256:exact-saved-web-image-id
  worker:
    image: sha256:exact-saved-worker-image-id
  migrate:
    image: sha256:exact-saved-worker-image-id
volumes:
  tripatlas-db-data:
    name: your-explicit-new-rollback-volume
```

```bash
rollback=(docker compose --project-name "$PROJECT" --env-file "$OLD_DIR/.env" \
  --file "$OLD_COMPOSE" --file "$OLD_DIR/rollback.yml")
"${new[@]}" stop web worker
docker image load --input "$CHECKPOINT/old-images.tar"
"${rollback[@]}" up -d --no-deps --wait db
node "$TOOLS" restore --project "$PROJECT" --env-file "$OLD_DIR/.env" \
  --file "$OLD_COMPOSE" --file "$OLD_DIR/rollback.yml" \
  --directory "$CHECKPOINT" --confirm "$PROJECT/tripatlas"
"${rollback[@]}" up -d --no-deps --no-build web worker
```

Include all original overrides and use your actual volume key/database name.
Recheck old login, session, drive, journey, exports and sync. Rollback means **old
images plus old schema/data**, not a reverse migration on the live database.

## Failure and recovery boundaries

| Failure | Response |
| --- | --- |
| Wrong project, mount, credentials or invalid configuration | Stop before migration; fix selection and repeat inspection. |
| Interrupted dump, disk full, checksum failure | Do not migrate; preserve failed checkpoint, make a new one. |
| Migration failure or failed readiness/data verification | Keep writers stopped; preserve current volume; restore pre-upgrade checkpoint to a new volume and exact old images. |
| Restore fails or destination is nonempty | No overwrite occurs; use a genuinely empty recovery destination and verify checkpoint/identity. |
| User writes after upgrade | Export/preserve those changes first; the earlier checkpoint cannot contain them. |

## Executable acceptance

Prepare the local browser dependency once:

```bash
(cd acceptance/release-stack && npm ci && npm exec -- playwright install chromium)
```

`pnpm test:rename-upgrade` uses a uniquely named `odovi-upgrade-*` project and only
synthetic data. It downloads pinned public source, exercises the actual backup /
restore commands and browser flows, compares representative records, destroys
**only its own** upgraded stack/volumes, restores and rolls back. Current-runtime
provider egress must be zero. Manifests, exact image IDs, comparisons and browser
reports are under `acceptance-results/odovi-upgrade-*/`.

Local source builds are not publication approval. At the release gate rerun with
`ODOVI_UPGRADE_BUILD=0`, `ODOVI_UPGRADE_WEB_IMAGE` and `ODOVI_UPGRADE_WORKER_IMAGE`
set to accepted, locally pulled digest references, and `ODOVI_ACCEPTANCE_VERSION`
set to the accepted version on the matching clean source commit.

Sources: PostgreSQL 17 [pg_dump](https://www.postgresql.org/docs/17/app-pgdump.html),
[pg_restore](https://www.postgresql.org/docs/17/app-pgrestore.html); Docker Compose
[project identity](https://docs.docker.com/compose/how-tos/project-name/) and
[resolved configuration](https://docs.docker.com/reference/cli/docker/compose/config/).
