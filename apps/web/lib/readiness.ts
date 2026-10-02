import "server-only";
import { sql } from "drizzle-orm";
import { REQUIRED_DATABASE_MIGRATION } from "@odovi/db";
import { db } from "./db";
import { getSyncState, type SyncStateRow } from "./queries";
import {
  classifyReadiness,
  diagnosticErrorCode,
  type OperationalCheck,
  type ReadinessReport,
  type RequiredCheck,
} from "./readiness-model";

const WORKER_FRESH_MS = 5 * 60 * 1000;

type MigrationRow = { created_at: string | number | null };

function operationalRow(
  row: SyncStateRow | undefined,
  healthyCode: string,
  now: number,
): OperationalCheck {
  if (!row) return { state: "unknown", code: "not_reported" };
  if (row.lastStatus === "error") {
    return { state: "degraded", code: "last_run_failed" };
  }
  if (!row.lastSuccessAt) return { state: "unknown", code: "never_succeeded" };
  if (now - row.lastSuccessAt.getTime() >= WORKER_FRESH_MS) {
    return {
      state: "degraded",
      code: "stale",
      lastSuccessAt: row.lastSuccessAt.toISOString(),
    };
  }
  return {
    state: "healthy",
    code: healthyCode,
    lastSuccessAt: row.lastSuccessAt.toISOString(),
  };
}

function unknownOperational(code: string): OperationalCheck {
  return { state: "unknown", code };
}

function schemaRow(row: SyncStateRow | undefined): OperationalCheck {
  if (!row) return { state: "unknown", code: "not_reported" };
  if (row.lastStatus === "error") {
    const safeCodes = new Set([
      "incompatible_schema",
      "authentication_failed",
      "timeout",
      "connection_failed",
      "sync_failed",
    ]);
    return {
      state: "degraded",
      code:
        row.lastError != null && safeCodes.has(row.lastError)
          ? row.lastError
          : "incompatible_or_unreachable",
    };
  }
  if (!row.lastSuccessAt) return { state: "unknown", code: "never_checked" };
  return {
    state: "healthy",
    code: "compatible",
    lastSuccessAt: row.lastSuccessAt.toISOString(),
  };
}

function failedRequired(code: string): RequiredCheck {
  return { state: "failed", code };
}

/**
 * Unauthenticated readiness contract. It deliberately returns only stable
 * status codes and timestamps; raw database, worker and provider errors stay
 * inside the authenticated diagnostics screen and container logs.
 */
export async function getReadinessReport(now = Date.now()): Promise<ReadinessReport> {
  let database: RequiredCheck = { state: "healthy", code: "reachable" };
  let migrations: RequiredCheck = { state: "healthy", code: "current" };
  let protectedApplication: RequiredCheck = { state: "healthy", code: "servable" };
  let rows: SyncStateRow[] = [];

  try {
    await db.execute(sql`select 1`);
  } catch (error) {
    database = failedRequired(diagnosticErrorCode(error));
    migrations = failedRequired("database_unavailable");
    protectedApplication = failedRequired("database_unavailable");
  }

  if (database.state === "healthy") {
    try {
      const migrationRows = await db.execute<MigrationRow>(sql`
        select created_at
        from drizzle.__drizzle_migrations
        order by created_at desc
        limit 1
      `);
      const latest = Number(migrationRows[0]?.created_at ?? 0);
      if (latest < REQUIRED_DATABASE_MIGRATION.appliedAt) {
        migrations = failedRequired("incomplete");
      }
    } catch (error) {
      migrations = failedRequired(diagnosticErrorCode(error));
    }

    try {
      // These are the minimum tables needed by authentication and the shared
      // protected layout. LIMIT 0 verifies the surface without reading data.
      await db.execute(sql`
        select 1
        from users
        cross join sessions
        cross join vehicles
        cross join location_provider_decisions
        cross join classification_operations
        limit 0
      `);
    } catch (error) {
      protectedApplication = failedRequired(diagnosticErrorCode(error));
    }

    try {
      rows = await getSyncState();
    } catch {
      // A failed sync-state query is covered by the required schema checks.
      rows = [];
    }
  }

  const worker = operationalRow(
    rows.find((row) => row.source === "odovi" && row.entity === "worker"),
    "fresh",
    now,
  );
  const teslamate = schemaRow(
    rows.find((row) => row.source === "teslamate" && row.entity === "schema"),
  );
  const providerRows = rows.filter((row) => row.source === "location_provider");
  const providerFailure = providerRows.some(
    (row) => row.lastStatus === "error" || row.lastStatus === "deferred",
  );
  const optionalProviders: OperationalCheck = providerFailure
    ? { state: "degraded", code: "upstream_unavailable" }
    : { state: "healthy", code: "available_or_disabled" };

  const checks: ReadinessReport["checks"] = {
    database,
    migrations,
    protectedApplication,
    worker:
      database.state === "healthy" ? worker : unknownOperational("database_unavailable"),
    teslamate:
      database.state === "healthy" ? teslamate : unknownOperational("database_unavailable"),
    optionalProviders:
      database.state === "healthy"
        ? optionalProviders
        : unknownOperational("database_unavailable"),
  };

  return { status: classifyReadiness(checks), checks };
}
