#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
compose_file="$repo_root/acceptance/release-stack/docker-compose.yml"
started_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
git_commit="$(git -C "$repo_root" rev-parse HEAD)"
short_commit="$(git -C "$repo_root" rev-parse --short=12 HEAD)"
version="${ODOVI_ACCEPTANCE_VERSION:-0.4.0-dev.${short_commit}}"
tag_version="$(printf '%s' "$version" | tr '/+ ' '---' | tr -cd '[:alnum:]_.-')"
project="${ODOVI_ACCEPTANCE_PROJECT:-odovi-acceptance-${short_commit}-$$}"
port="${ODOVI_ACCEPTANCE_PORT:-$(node -e 'const n=require("node:net");const s=n.createServer();s.listen(0,"127.0.0.1",()=>{process.stdout.write(String(s.address().port));s.close()})')}"
run_id="${ODOVI_ACCEPTANCE_RUN_ID:-$(date -u +%Y%m%dT%H%M%SZ)-${short_commit}}"
evidence_dir="${ODOVI_ACCEPTANCE_EVIDENCE_DIR:-$repo_root/acceptance-results/$run_id}"
build_images="${ODOVI_ACCEPTANCE_BUILD:-1}"
keep_stack="${ODOVI_ACCEPTANCE_KEEP_STACK:-0}"
setup_token="${ODOVI_ACCEPTANCE_SETUP_TOKEN:-$(node "$repo_root/scripts/generate-setup-token.mjs")}"

export ODOVI_ACCEPTANCE_STARTED_AT="$started_at"
export ODOVI_ACCEPTANCE_GIT_COMMIT="$git_commit"
export ODOVI_ACCEPTANCE_VERSION="$version"
export ODOVI_ACCEPTANCE_PROJECT="$project"
export ODOVI_ACCEPTANCE_PORT="$port"
export ODOVI_ACCEPTANCE_EVIDENCE_DIR="$evidence_dir"
export ODOVI_ACCEPTANCE_BASE_URL="http://127.0.0.1:$port"
export ODOVI_ACCEPTANCE_READINESS_PATH="${ODOVI_ACCEPTANCE_READINESS_PATH:-/api/ready}"
export ODOVI_ACCEPTANCE_READINESS_URL="$ODOVI_ACCEPTANCE_BASE_URL$ODOVI_ACCEPTANCE_READINESS_PATH"
export ODOVI_EXPECT_RELEASE_IDENTITY="${ODOVI_EXPECT_RELEASE_IDENTITY:-1}"
export ODOVI_EXPECT_BROWSER_LOCALE="${ODOVI_EXPECT_BROWSER_LOCALE:-1}"
export ODOVI_EXPECT_PROVIDER_DISABLED_UI="${ODOVI_EXPECT_PROVIDER_DISABLED_UI:-1}"
export ODOVI_EXPECT_MAP_PROVIDER_POLICY="${ODOVI_EXPECT_MAP_PROVIDER_POLICY:-1}"
export ODOVI_WEB_IMAGE="${ODOVI_WEB_IMAGE:-odovi-web:$tag_version}"
export ODOVI_WORKER_IMAGE="${ODOVI_WORKER_IMAGE:-odovi-worker:$tag_version}"
export ODOVI_FIXTURES_IMAGE="${ODOVI_FIXTURES_IMAGE:-odovi-fixtures:$tag_version}"
export ODOVI_ACCEPTANCE_CONTROLLED_HOSTS="${ODOVI_ACCEPTANCE_CONTROLLED_HOSTS:-provider,controlled-navigation.invalid}"
export ODOVI_ACCEPTANCE_PROVIDER_CREDENTIAL="${ODOVI_ACCEPTANCE_PROVIDER_CREDENTIAL:-odovi-acceptance-provider}"
export ODOVI_ACCEPTANCE_BROWSER_EGRESS_LOG="$evidence_dir/browser-egress.ndjson"
export ODOVI_ACCEPTANCE_PROVIDER_LOG="$evidence_dir/provider-requests.ndjson"
export ODOVI_ACCEPTANCE_SETUP_TOKEN="$setup_token"

compose=(docker compose --project-name "$project" --file "$compose_file")
run_status="failed"
stack_owned="0"

mkdir -p "$evidence_dir"
touch "$evidence_dir/container-egress.ndjson" "$evidence_dir/browser-egress.ndjson" "$evidence_dir/provider-requests.ndjson"
chmod 666 "$evidence_dir/container-egress.ndjson" "$evidence_dir/browser-egress.ndjson" "$evidence_dir/provider-requests.ndjson"

capture_evidence() {
  set +e
  if [[ "$stack_owned" == "1" ]]; then
    "${compose[@]}" ps --format json >"$evidence_dir/compose-ps.json" 2>&1
    "${compose[@]}" logs --no-color --timestamps >"$evidence_dir/compose.log" 2>&1
  fi
  node "$repo_root/acceptance/release-stack/verify-egress.mjs" \
    "$evidence_dir/container-egress.ndjson" \
    "$evidence_dir/browser-egress.ndjson" >"$evidence_dir/egress-summary.json" 2>&1
  node "$repo_root/acceptance/release-stack/write-manifest.mjs" \
    "$evidence_dir/manifest.json" "$run_status"
  if [[ "$stack_owned" == "1" && "$keep_stack" != "1" ]]; then
    "${compose[@]}" down --volumes --remove-orphans --timeout 10 \
      >"$evidence_dir/compose-down.log" 2>&1
  fi
}
trap capture_evidence EXIT

wait_for_http() {
  local url="$1"
  local label="$2"
  local attempts="${3:-90}"
  for ((i = 1; i <= attempts; i++)); do
    if curl --silent --show-error --fail --max-time 3 "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done
  echo "Timed out waiting for $label at $url" >&2
  return 1
}

assert_readiness_state() {
  local expected="$1"
  local label="$2"
  node --input-type=module - "$ODOVI_ACCEPTANCE_READINESS_URL" "$expected" "$label" \
    "$evidence_dir/readiness-states.ndjson" <<'NODE'
import fs from "node:fs";
const [url, expected, label, evidence] = process.argv.slice(2);
const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
const body = await response.json();
const expectedHttp = expected === "not_ready" ? 503 : 200;
if (response.status !== expectedHttp || body.status !== expected) {
  throw new Error(
    `${label}: expected ${expected}/${expectedHttp}, got ${body.status}/${response.status}`,
  );
}
fs.appendFileSync(
  evidence,
  `${JSON.stringify({ label, expected, httpStatus: response.status, body })}\n`,
);
NODE
}

wait_for_readiness_state() {
  local expected="$1"
  local label="$2"
  for ((i = 1; i <= 60; i++)); do
    if assert_readiness_state "$expected" "$label" >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done
  echo "Timed out waiting for readiness state '$expected' ($label)" >&2
  return 1
}

wait_for_fixture_day() {
  local day
  for ((i = 1; i <= 90; i++)); do
    day="$("${compose[@]}" exec -T db psql -U odovi -d odovi -Atqc \
      "select coalesce(to_char(max(start_time at time zone 'Europe/Zurich'), 'YYYY-MM-DD'), '') from drives" \
      2>/dev/null || true)"
    if [[ "$day" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]; then
      export ODOVI_ACCEPTANCE_DAY="$day"
      return 0
    fi
    sleep 2
  done
  echo "Timed out waiting for the first synchronized synthetic drive" >&2
  return 1
}

verify_upgrade_path() {
  "${compose[@]}" exec -T db createdb -U odovi odovi_upgrade
  "${compose[@]}" run --rm --no-deps legacy-migrate
  "${compose[@]}" run --rm --no-deps \
    -e DATABASE_URL=postgres://odovi:odovi-acceptance@db:5432/odovi_upgrade migrate
  "${compose[@]}" exec -T db psql -v ON_ERROR_STOP=1 -U odovi -d odovi_upgrade \
    >"$evidence_dir/upgrade-provider-review.txt" <<'SQL'
do $$
begin
  if (select count(*) from location_provider_decisions) <> 0 then
    raise exception 'provider decisions must be empty immediately after upgrade';
  end if;
end $$;
insert into location_provider_decisions
  (capability, mode, provider, disclosure_version, decided_by)
select capability, 'disabled', 'none', '2026-08-26', 'acceptance-upgrade'
from unnest(array['weather','elevation','mapTiles','addressSearch','routing','externalNavigation']) capability;
do $$
begin
  if (select count(*) from location_provider_decisions where mode = 'disabled') <> 6 then
    raise exception 'upgrade Provider Review did not persist all six disabled decisions';
  end if;
  if to_regclass('public.drives') is null or to_regclass('public.route_points') is null then
    raise exception 'core archive schema was not preserved';
  end if;
end $$;
select capability, mode, provider, disclosure_version, decided_by
from location_provider_decisions order by capability;
SQL
}

run_playwright() {
  (
    cd "$repo_root/acceptance/release-stack"
    npm exec -- playwright test --config playwright.config.ts "$@"
  )
}

command -v docker >/dev/null
command -v curl >/dev/null
docker info >/dev/null

existing_resources="$({
  docker ps --all --quiet --filter "label=com.docker.compose.project=$project"
  docker volume ls --quiet --filter "label=com.docker.compose.project=$project"
  docker network ls --quiet --filter "label=com.docker.compose.project=$project"
} | sed '/^$/d')"
if [[ -n "$existing_resources" ]]; then
  echo "Refusing to reuse Compose project '$project'; choose a fresh ODOVI_ACCEPTANCE_PROJECT." >&2
  exit 1
fi

for image in "$ODOVI_WEB_IMAGE" "$ODOVI_WORKER_IMAGE" "$ODOVI_FIXTURES_IMAGE"; do
  if [[ "$image" == *":latest" || ! "$image" =~ (@sha256:|:[^/]+$) ]]; then
    echo "Acceptance images must use an explicit non-latest tag or digest: $image" >&2
    exit 1
  fi
done

"${compose[@]}" config \
  | sed -E 's/^([[:space:]]+ODOVI_SETUP_TOKEN:).*/\1 <redacted>/' \
  >"$evidence_dir/compose-config.yml"

if [[ "$build_images" == "1" ]]; then
  # `migrate` and `worker` deliberately share one exact worker image.
  "${compose[@]}" build seed migrate web
else
  "${compose[@]}" build seed
  "${compose[@]}" pull web worker
fi

docker image inspect "$ODOVI_WEB_IMAGE" "$ODOVI_WORKER_IMAGE" "$ODOVI_FIXTURES_IMAGE" \
  >"$evidence_dir/image-inspect.json"

stack_owned="1"
"${compose[@]}" up --detach --remove-orphans
wait_for_http "$ODOVI_ACCEPTANCE_BASE_URL/api/health" "web liveness"
wait_for_fixture_day

export ODOVI_ACCEPTANCE_PHASE="journey"
run_playwright \
  --project=setup-desktop \
  tests/release-journey.spec.ts

# Exercise the analysis views with completed measurements and destinations,
# after the setup journey has verified the original synchronized fixture.
"${compose[@]}" exec -T db psql -X -qAt -v ON_ERROR_STOP=1 \
  -v fixture_day="$ODOVI_ACCEPTANCE_DAY" -U odovi -d odovi \
  < "$repo_root/acceptance/release-stack/insights-fixture.sql" \
  > "$evidence_dir/insights-fixture.json"
export ODOVI_ACCEPTANCE_INSIGHTS_YEAR="${ODOVI_ACCEPTANCE_DAY%%-*}"
export ODOVI_EXPECT_INSIGHTS_FIXTURE=1

export ODOVI_ACCEPTANCE_PHASE="coverage"
run_playwright \
  --project=desktop --project=mobile \
  tests/coverage.spec.ts

# Accessibility/navigation fixture belongs only to this disposable archive.
"${compose[@]}" exec -T db psql -X -qAt -v ON_ERROR_STOP=1 \
  -v fixture_day="$ODOVI_ACCEPTANCE_DAY" -U odovi -d odovi \
  < "$repo_root/acceptance/release-stack/analytics-access-fixture.sql" \
  > "$evidence_dir/analytics-access-fixture.json"
export ODOVI_EXPECT_CLASSIFICATION_UNDO=1
export ODOVI_ACCEPTANCE_PHASE="backlog"
run_playwright --project=desktop \
  tests/backlog-core.spec.ts tests/calendar-analytics.spec.ts \
  tests/classification-undo.spec.ts tests/invoice-archive.spec.ts

verify_upgrade_path
node "$repo_root/acceptance/release-stack/verify-egress.mjs" --expect-zero \
  "$evidence_dir/container-egress.ndjson" \
  "$evidence_dir/browser-egress.ndjson" >"$evidence_dir/zero-egress-summary.json"

export ODOVI_ACCEPTANCE_PHASE="provider-contracts"
run_playwright --project=desktop tests/provider-contracts.spec.ts
node "$repo_root/acceptance/release-stack/verify-provider-contracts.mjs" \
  "$evidence_dir/provider-requests.ndjson" \
  "$evidence_dir/browser-egress.ndjson" \
  "$evidence_dir/provider-contract-summary.json"

"${compose[@]}" restart web worker
wait_for_http "$ODOVI_ACCEPTANCE_BASE_URL/api/health" "web after restart"
wait_for_http "$ODOVI_ACCEPTANCE_READINESS_URL" "configured readiness contract"
wait_for_readiness_state "healthy" "healthy-after-restart"

export ODOVI_ACCEPTANCE_PHASE="restart"
run_playwright \
  --project=desktop \
  tests/restart.spec.ts

# Worker, TeslaMate and optional providers degrade the product without making
# the Core Archive unavailable. Each failure is exercised independently.
"${compose[@]}" stop worker
"${compose[@]}" exec -T db psql -v ON_ERROR_STOP=1 -U odovi -d odovi -c \
  "update sync_state set last_status='ok', last_success_at=now()-interval '10 minutes' where source='odovi' and entity='worker'" >/dev/null
assert_readiness_state "degraded" "worker-stale"
"${compose[@]}" start worker
wait_for_readiness_state "healthy" "worker-recovered"

"${compose[@]}" exec -T db psql -v ON_ERROR_STOP=1 -U odovi -d odovi -c \
  "insert into sync_state(source,entity,last_run_at,last_status,last_error,rows_upserted) values ('location_provider','acceptance_outage',now(),'error','upstream_unavailable',0) on conflict (source,entity) do update set last_run_at=excluded.last_run_at,last_status=excluded.last_status,last_error=excluded.last_error" >/dev/null
assert_readiness_state "degraded" "optional-provider-outage"
"${compose[@]}" exec -T db psql -v ON_ERROR_STOP=1 -U odovi -d odovi -c \
  "delete from sync_state where source='location_provider' and entity='acceptance_outage'" >/dev/null
wait_for_readiness_state "healthy" "optional-provider-recovered"

"${compose[@]}" exec -T db psql -v ON_ERROR_STOP=1 -U odovi -d odovi -c \
  "update sync_state set last_run_at=now(),last_status='error',last_error='incompatible_schema' where source='teslamate' and entity='schema'" >/dev/null
assert_readiness_state "degraded" "teslamate-schema-incompatible"
"${compose[@]}" exec -T db psql -v ON_ERROR_STOP=1 -U odovi -d odovi -c \
  "update sync_state set last_run_at=now(),last_success_at=now(),last_status='ok',last_error=null where source='teslamate' and entity='schema'" >/dev/null
wait_for_readiness_state "healthy" "teslamate-schema-recovered"

# Missing migration evidence and a missing protected-app table are required
# failures: readiness is 503 while process liveness remains 200.
migration_checkpoint="$("${compose[@]}" exec -T db psql -X -Atqc \
  "select id::text || ' ' || created_at::text from drizzle.__drizzle_migrations order by created_at desc limit 1" -U odovi -d odovi)"
read -r migration_record_id migration_created_at <<< "$migration_checkpoint"
[[ "$migration_record_id" =~ ^[0-9]+$ && "$migration_created_at" =~ ^[0-9]+$ ]] || exit 1
"${compose[@]}" exec -T db psql -v ON_ERROR_STOP=1 -U odovi -d odovi -c \
  "update drizzle.__drizzle_migrations set created_at=0 where id=$migration_record_id" >/dev/null
assert_readiness_state "not_ready" "migration-incomplete"
wait_for_http "$ODOVI_ACCEPTANCE_BASE_URL/api/health" "liveness during incomplete migration"
"${compose[@]}" exec -T db psql -v ON_ERROR_STOP=1 -U odovi -d odovi -c \
  "update drizzle.__drizzle_migrations set created_at=$migration_created_at where id=$migration_record_id" >/dev/null
wait_for_readiness_state "healthy" "migration-recovered"

"${compose[@]}" exec -T db psql -v ON_ERROR_STOP=1 -U odovi -d odovi -c \
  "alter table users rename to users_readiness_test" >/dev/null
assert_readiness_state "not_ready" "protected-application-unavailable"
wait_for_http "$ODOVI_ACCEPTANCE_BASE_URL/api/health" "liveness without protected application"
"${compose[@]}" exec -T db psql -v ON_ERROR_STOP=1 -U odovi -d odovi -c \
  "alter table users_readiness_test rename to users" >/dev/null
wait_for_readiness_state "healthy" "protected-application-recovered"

"${compose[@]}" exec -T db psql -v ON_ERROR_STOP=1 -U odovi -d odovi -c \
  "alter table classification_operations rename to classification_operations_readiness_test" >/dev/null
assert_readiness_state "not_ready" "classification-operations-unavailable"
wait_for_http "$ODOVI_ACCEPTANCE_BASE_URL/api/health" "liveness without undo receipts"
"${compose[@]}" exec -T db psql -v ON_ERROR_STOP=1 -U odovi -d odovi -c \
  "alter table classification_operations_readiness_test rename to classification_operations" >/dev/null
wait_for_readiness_state "healthy" "classification-operations-recovered"

"${compose[@]}" stop db
wait_for_http "$ODOVI_ACCEPTANCE_BASE_URL/api/health" "liveness without database"
assert_readiness_state "not_ready" "database-unavailable"
"${compose[@]}" start db
wait_for_readiness_state "healthy" "database-recovered"

node "$repo_root/acceptance/release-stack/verify-egress.mjs" \
  "$evidence_dir/container-egress.ndjson" \
  "$evidence_dir/browser-egress.ndjson" >"$evidence_dir/egress-summary.json"

run_status="passed"
echo "Release acceptance passed. Evidence: $evidence_dir"
