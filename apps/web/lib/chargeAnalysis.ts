import "server-only";

import { and, asc, desc, eq, gt, inArray, isNotNull, lte } from "drizzle-orm";
import { analyzeDcCharges, type DcChargeAnalysis, type DcChargePoint } from "@odovi/core";
import { chargePoints, chargeSessions, places } from "@odovi/db";
import { db } from "./db";

/** Read only the selected vehicle's latest completed DC sessions and their samples. */
export async function getChargeAnalysis(
  vehicleId: number,
  limit: 5 | 10,
): Promise<DcChargeAnalysis> {
  // Apply the session limit before fetching samples so older or AC sessions
  // cannot displace the requested comparison. Stable ordering also handles ties.
  // Drizzle select/order/limit: https://orm.drizzle.team/docs/select#limit--offset
  const sessions = await db
    .select({
      id: chargeSessions.id,
      startTime: chargeSessions.startTime,
      endTime: chargeSessions.endTime,
      placeId: chargeSessions.placeId,
      placeName: places.name,
      address: chargeSessions.address,
      maxPowerKw: chargeSessions.maxPowerKw,
      outsideTempAvg: chargeSessions.outsideTempAvg,
    })
    .from(chargeSessions)
    .leftJoin(places, eq(chargeSessions.placeId, places.id))
    .where(and(
      eq(chargeSessions.vehicleId, vehicleId),
      eq(chargeSessions.chargerType, "dc"),
      isNotNull(chargeSessions.endTime),
      gt(chargeSessions.endTime, chargeSessions.startTime),
      lte(chargeSessions.endTime, new Date()),
    ))
    .orderBy(desc(chargeSessions.startTime), desc(chargeSessions.id))
    .limit(limit);

  if (sessions.length === 0) return analyzeDcCharges([]);

  const samples = await db
    .select({
      sessionId: chargePoints.chargeSessionId,
      ts: chargePoints.ts,
      powerKw: chargePoints.powerKw,
      soc: chargePoints.soc,
      outsideTemp: chargePoints.outsideTemp,
    })
    .from(chargePoints)
    .where(inArray(chargePoints.chargeSessionId, sessions.map((session) => session.id)))
    .orderBy(asc(chargePoints.ts), asc(chargePoints.id));

  const pointsBySession = new Map<number, DcChargePoint[]>();
  for (const { sessionId, ts, ...point } of samples) {
    const points = pointsBySession.get(sessionId) ?? [];
    points.push({ ...point, ts: ts.getTime() });
    pointsBySession.set(sessionId, points);
  }

  return analyzeDcCharges(sessions.map((session) => ({
    ...session,
    startTime: session.startTime.getTime(),
    // SQL excludes missing or invalid completion times above.
    endTime: session.endTime!.getTime(),
    points: pointsBySession.get(session.id) ?? [],
  })));
}
