# Upgrade Odovi 0.3.0 to 0.4.0

Use the stable 0.4.0 Compose asset and the exact accepted image digests attached
to the [GitHub Release](https://github.com/jsc2304/odovi/releases/tag/v0.4.0).
The release's acceptance records establish the image and upgrade checks; this
procedure does not turn an unpublished candidate into an accepted release.
Installations on 0.2.0 can use the
[archived 0.2.0 → 0.3.0 procedure](https://github.com/jsc2304/odovi/blob/85621b147a6194d65b02c1c5f9d6e6be7914b49f/docs/upgrade-odovi.md) first.
Installations still on Tripatlas v0.1.1 must complete the
[rename upgrade to 0.2.0](rename-to-odovi.md) first.

There are no new schema migrations or runtime settings between these two
versions. Keep the current project name, database user/name/password, actual
data volume, `.env`, network overrides and provider decisions. TeslaMate keeps
running and collecting data throughout the Odovi update.

## 1. Prepare and inspect

Download the new versioned Compose asset to a new file beside the existing
Compose file. Keep the old one for rollback; do not replace `.env` with a fresh
template. Review the [runtime configuration](runtime-configuration.md) and the
resolved Compose difference before making changes. The database service,
mounted volume, port, credentials and external network connections must retain
their existing identities.

The examples below use Bash. Set the paths and project to the actual existing
installation. `TOOLS` is the backup utility from an accepted Odovi source archive;
it requires Node.js 22+ and Docker Compose v2 on the operator host.

```bash
INSTALL_DIR=/absolute/path/to/existing-odovi
PROJECT=your-existing-compose-project
BACKUP_ROOT=/absolute/path/to/private-backups
TOOLS=/absolute/path/to/accepted-odovi-source/scripts/database-backup.mjs
OLD_COMPOSE="$INSTALL_DIR/docker-compose.yml"
NEW_COMPOSE="$INSTALL_DIR/docker-compose-0.4.0.yml"
old=(docker compose --project-name "$PROJECT" --env-file "$INSTALL_DIR/.env" --file "$OLD_COMPOSE")
new=(docker compose --project-name "$PROJECT" --env-file "$INSTALL_DIR/.env" --file "$NEW_COMPOSE")

test ! -e "$NEW_COMPOSE" &&
curl -fL https://github.com/jsc2304/odovi/releases/download/v0.4.0/odovi-0.4.0-docker-compose.yml -o "$NEW_COMPOSE"
```

If `NEW_COMPOSE` already exists, inspect it instead of overwriting it. Add every
required Compose override to **both** arrays and to every backup utility command.
Use an absolute `ODOVI_ENV_FILE` so the release's configuration check reads the
same environment as Compose:

```bash
export ODOVI_ENV_FILE="$INSTALL_DIR/.env"
"${old[@]}" config --quiet
"${new[@]}" config --quiet
node "$TOOLS" inspect --project "$PROJECT" --env-file "$INSTALL_DIR/.env" --file "$OLD_COMPOSE"
node "$TOOLS" inspect --project "$PROJECT" --env-file "$INSTALL_DIR/.env" --file "$NEW_COMPOSE"
"${new[@]}" pull web worker
```

The two inspections must resolve the same running database and actual volume.
Keep the old images, Compose files and overrides until the update is verified.
Backups and resolved Compose output contain private data and credentials; keep
them outside the repository and public issue reports.

## 2. Rehearse recovery and take the update checkpoint

Before touching a real installation, restore a recent checkpoint into a
different disposable project with its own volume, network and port. Use the
matching 0.3.0 images, then verify login, representative annotations and exports.
The backup utility's archive check is not a substitute for a successful restore.
The [restore procedure](rename-to-odovi.md#5-restore-or-roll-back) describes its
empty-destination and explicit-identity requirements.

For the update checkpoint, stop Odovi writers and scheduled imports. TeslaMate
does not need to stop. If the checkpoint fails, restart the old web and worker
and resolve the backup failure before continuing.

```bash
mkdir -p "$BACKUP_ROOT"
chmod 700 "$BACKUP_ROOT"
CHECKPOINT="$BACKUP_ROOT/odovi-0.3.0-before-0.4.0-$(date -u +%Y%m%dT%H%M%SZ)"
"${old[@]}" stop web worker
node "$TOOLS" backup --project "$PROJECT" --env-file "$INSTALL_DIR/.env" \
  --file "$OLD_COMPOSE" --directory "$CHECKPOINT"
```

Preserve `.env`, overrides, TLS/proxy configuration, Tesla encryption keys and
any external mounts separately; they are not all contained in the database
dump. Do not delete or replace the running database volume.

## 3. Start the accepted version

```bash
"${new[@]}" run --rm --no-deps config-check
"${new[@]}" run --rm --no-deps migrate
"${new[@]}" up -d --no-deps web worker
```

The migration command should find no new migration for a complete 0.3.0
installation. Stop and investigate unexpected schema changes instead of
continuing with a mismatched version. `--no-deps` leaves the database and
unrelated services running.

Use the configured port for `/api/health` and `/api/ready`. Verify:

- Settings shows **Odovi 0.4.0** and the accepted build commit.
- Existing passwords/sessions, drives, annotations, places, tags, journeys and
  recorded charging costs remain available; representative CSV/GPX exports work.
- Synchronization resumes without duplicates and preserves annotations.
- The Paper & Ink overview, daily archive and journey/day recap open correctly.
  Driving profiles retain their saved choice; historical classifications remain
  unchanged unless the separate backlog action is explicitly used.
- Clearing a manual charging price uses an available place tariff; when no
  tariff can be applied, the manual marker is cleared on save.
- Provider decisions are preserved. The updated archive does not require a new
  provider or TeslaMate write permission.

`degraded` can indicate an optional-provider problem; `not_ready`/503 requires
investigation before reopening access. Retain the checkpoint and old images
after successful verification.

## 4. Recovery and rollback

If startup or verification fails, stop the new web and worker before taking
further action. Preserve the current volume and inspect the failure privately.

There is no schema change in this update. If schema identity is unchanged,
restart the exact previous 0.3.0 web and worker images through the preserved
Compose files, then recheck login, exports and synchronization. Do not substitute
an arbitrary old tag or rebuild from a moving branch.

If a database restore is needed, restore the verified pre-update checkpoint into
a **new** named recovery volume, using the original database user/name/password
and exact previous images. Never restore over the existing archive or run
`down --volumes` against the operator stack. A restore to the pre-update
checkpoint excludes later writes; preserve those separately before choosing
that recovery point. Follow the backup utility's identity and empty-destination
checks described in the [restore runbook](rename-to-odovi.md#5-restore-or-roll-back).
