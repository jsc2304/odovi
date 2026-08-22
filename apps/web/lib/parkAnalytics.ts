import "server-only";
import { and, desc, eq, gt, isNotNull, isNull, or, sql } from "drizzle-orm";
import { computeVampireLoss } from "@tripatlas/core";
import { chargeSessions, parkSessions, vehicleStatus } from "@tripatlas/db";
import { db } from "./db";
import {
  resolveDashboardParkDrainSession,
  sumParkDrainSessions,
  type DashboardParkDrainSession,
  type LastChargeBoundary,
  type ParkDrainSourceSession,
} from "./parkDrain";

// Zeittoleranz beim Matchen von Park-Nachbar-Fahrten über start/end_time
// (TeslaMate rundet Zeitstempel teils auf die Minute) — siehe Modul-Doku in
// packages/core/src/derive/vampire.ts.
const NEIGHBOR_TOLERANCE_SECONDS = 120;

export interface ParkLoss {
  /** SoC-Punkte, bereits negativ-geclamped (siehe computeVampireLoss). Null = nicht bestimmbar. */
  lossPct: number | null;
  /** true wenn während des Parks eine Ladesession lief (Verlust dadurch nicht bestimmbar). */
  hadCharge: boolean;
  /** SoC at the end of this park (next drive start, or current vehicle SoC). */
  nextStartSoc: number | null;
}

/**
 * Vampir-Verlust für eine Menge von Park-Sessions, set-based in einer Query
 * (kein N+1): pro Park wird per correlated Subselect die zeitlich passende
 * TeslaMate-Fahrt davor (end_time ≈ park.start_time) und danach
 * (start_time ≈ park.end_time) gesucht sowie geprüft, ob eine Ladesession
 * das Park-Fenster überlappt.
 */
export async function getParkLossForSessions(
  parkIds: number[],
  openSessionSoc: number | null = null,
): Promise<Map<number, ParkLoss>> {
  const result = new Map<number, ParkLoss>();
  if (parkIds.length === 0) return result;

  const rows = await db.execute<{
    id: number;
    prev_end_soc: number | null;
    next_start_soc: number | null;
    had_charge: boolean;
  }>(sql`
    select
      ps.id::int as id,
      (
        select d.end_soc
        from drives d
        where d.source = 'teslamate'
          and d.vehicle_id = ps.vehicle_id
          and d.end_time is not null
          and abs(extract(epoch from d.end_time - ps.start_time)) <= ${NEIGHBOR_TOLERANCE_SECONDS}
        order by abs(extract(epoch from d.end_time - ps.start_time)) asc
        limit 1
      ) as prev_end_soc,
      case
        when ps.end_time is null then ${openSessionSoc}
        else (
          select d.start_soc
          from drives d
          where d.source = 'teslamate'
            and d.vehicle_id = ps.vehicle_id
            and abs(extract(epoch from d.start_time - ps.end_time)) <= ${NEIGHBOR_TOLERANCE_SECONDS}
          order by abs(extract(epoch from d.start_time - ps.end_time)) asc
          limit 1
        )
      end as next_start_soc,
      exists (
        select 1
        from charge_sessions cs
        where cs.vehicle_id = ps.vehicle_id
          and cs.start_time < coalesce(ps.end_time, now())
          and (cs.end_time is null or cs.end_time > ps.start_time)
      ) as had_charge
    from park_sessions ps
    where ps.id in (${sql.join(
      parkIds.map((id) => sql`${id}`),
      sql.raw(","),
    )})
  `);

  for (const r of rows) {
    const lossPct = computeVampireLoss({
      prevEndSoc: r.prev_end_soc,
      nextStartSoc: r.next_start_soc,
      hadCharge: r.had_charge,
    });
    result.set(r.id, {
      lossPct,
      hadCharge: r.had_charge,
      nextStartSoc: r.next_start_soc,
    });
  }

  return result;
}

export interface DashboardParkDrain {
  current: DashboardParkDrainSession | null;
  previous: DashboardParkDrainSession | null;
  /** Null when there is no completed charge boundary or the sum is incomplete. */
  totalSinceLastChargePct: number | null;
}

/**
 * Drain for the open/latest park plus the trustworthy sum since the most
 * recent completed charge. The current vehicle SoC closes an open park's
 * measurement interval without persisting synthetic park SoC values.
 */
export async function getDashboardParkDrain(
  vehicleId: number,
): Promise<DashboardParkDrain> {
  const [currentRows, previousRows, latestChargeRows, statusRows] = await Promise.all([
    db
      .select({ id: parkSessions.id, startTime: parkSessions.startTime, endTime: parkSessions.endTime })
      .from(parkSessions)
      .where(and(eq(parkSessions.vehicleId, vehicleId), isNull(parkSessions.endTime)))
      .orderBy(desc(parkSessions.startTime))
      .limit(1),
    db
      .select({ id: parkSessions.id, startTime: parkSessions.startTime, endTime: parkSessions.endTime })
      .from(parkSessions)
      .where(and(eq(parkSessions.vehicleId, vehicleId), isNotNull(parkSessions.endTime)))
      .orderBy(desc(parkSessions.endTime))
      .limit(1),
    db
      .select({ endTime: chargeSessions.endTime, endSoc: chargeSessions.endSoc })
      .from(chargeSessions)
      .where(eq(chargeSessions.vehicleId, vehicleId))
      .orderBy(desc(chargeSessions.startTime))
      .limit(1),
    db
      .select({ soc: vehicleStatus.soc })
      .from(vehicleStatus)
      .where(eq(vehicleStatus.vehicleId, vehicleId))
      .limit(1),
  ]);

  const current = currentRows[0] ?? null;
  const previous = previousRows[0] ?? null;
  const latestCharge = latestChargeRows[0];
  const lastCharge: LastChargeBoundary | null =
    latestCharge?.endTime != null
      ? { endTime: latestCharge.endTime, endSoc: latestCharge.endSoc }
      : null;

  const sinceChargeRows: ParkDrainSourceSession[] = lastCharge
    ? await db
        .select({ id: parkSessions.id, startTime: parkSessions.startTime, endTime: parkSessions.endTime })
        .from(parkSessions)
        .where(
          and(
            eq(parkSessions.vehicleId, vehicleId),
            or(isNull(parkSessions.endTime), gt(parkSessions.endTime, lastCharge.endTime)),
          ),
        )
        .orderBy(parkSessions.startTime)
    : [];

  const sessionIds = new Set<number>([
    ...(current ? [current.id] : []),
    ...(previous ? [previous.id] : []),
    ...sinceChargeRows.map((session) => session.id),
  ]);
  const losses = await getParkLossForSessions(
    [...sessionIds],
    statusRows[0]?.soc ?? null,
  );
  const now = new Date();

  const resolve = (session: ParkDrainSourceSession | null) => {
    if (!session) return null;
    const loss = losses.get(session.id);
    if (!loss) return null;
    return resolveDashboardParkDrainSession(session, loss, lastCharge, now);
  };

  const sinceCharge = sinceChargeRows
    .map((session) => resolve(session))
    .filter((session): session is DashboardParkDrainSession => session != null);

  return {
    current: resolve(current),
    previous: resolve(previous),
    totalSinceLastChargePct:
      lastCharge == null ? null : sumParkDrainSessions(sinceCharge),
  };
}

export interface PlaceDwellStats {
  placeId: number;
  parkCount: number;
  totalDwellSeconds: number;
  avgDwellSeconds: number;
  totalVampireLossPct: number;
}

/**
 * Je Place: Anzahl abgeschlossener Parks, Gesamt-/Ø-Standzeit, Summe des
 * bestimmbaren Vampir-Verlusts — für die Orte-Seite. Set-based: der
 * Vampir-Verlust wird über dieselben correlated Subselects wie
 * getParkLossForSessions ermittelt, hier direkt aggregiert statt pro Park
 * ins Web geladen (kein N+1).
 */
export async function getPlaceDwellStats(): Promise<Map<number, PlaceDwellStats>> {
  const result = new Map<number, PlaceDwellStats>();

  const rows = await db.execute<{
    place_id: number;
    park_count: number;
    total_dwell_seconds: number;
    avg_dwell_seconds: number;
    total_vampire_loss_pct: number;
  }>(sql`
    with park_loss as (
      select
        ps.id,
        ps.place_id,
        ps.duration_seconds,
        (
          select d.end_soc
          from drives d
          where d.source = 'teslamate'
            and d.vehicle_id = ps.vehicle_id
            and d.end_time is not null
            and abs(extract(epoch from d.end_time - ps.start_time)) <= ${NEIGHBOR_TOLERANCE_SECONDS}
          order by abs(extract(epoch from d.end_time - ps.start_time)) asc
          limit 1
        ) as prev_end_soc,
        (
          select d.start_soc
          from drives d
          where d.source = 'teslamate'
            and d.vehicle_id = ps.vehicle_id
            and ps.end_time is not null
            and abs(extract(epoch from d.start_time - ps.end_time)) <= ${NEIGHBOR_TOLERANCE_SECONDS}
          order by abs(extract(epoch from d.start_time - ps.end_time)) asc
          limit 1
        ) as next_start_soc,
        exists (
          select 1
          from charge_sessions cs
          where cs.vehicle_id = ps.vehicle_id
            and cs.start_time < ps.end_time
            and (cs.end_time is null or cs.end_time > ps.start_time)
        ) as had_charge
      from park_sessions ps
      where ps.place_id is not null
        and ps.end_time is not null
    )
    select
      place_id::int as place_id,
      count(*)::int as park_count,
      coalesce(sum(duration_seconds), 0)::int as total_dwell_seconds,
      coalesce(avg(duration_seconds), 0)::float8 as avg_dwell_seconds,
      coalesce(
        sum(
          case
            when had_charge or prev_end_soc is null or next_start_soc is null then 0
            else greatest(0, prev_end_soc - next_start_soc)
          end
        ),
        0
      )::int as total_vampire_loss_pct
    from park_loss
    group by place_id
  `);

  for (const r of rows) {
    result.set(r.place_id, {
      placeId: r.place_id,
      parkCount: r.park_count,
      totalDwellSeconds: r.total_dwell_seconds,
      avgDwellSeconds: r.avg_dwell_seconds,
      totalVampireLossPct: r.total_vampire_loss_pct,
    });
  }

  return result;
}
