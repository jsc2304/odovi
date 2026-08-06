import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { journeyPlans } from "@tripatlas/db";
import type { RoadtripPlanSnapshot } from "@tripatlas/core";
import { db } from "./db";

export interface StoredRoadtripPlan {
  id: number;
  journeyId: number;
  vehicleId: number;
  version: number;
  snapshot: RoadtripPlanSnapshot;
  createdAt: Date;
}

export async function getLatestJourneyPlan(
  journeyId: number,
): Promise<StoredRoadtripPlan | null> {
  const rows = await db
    .select({
      id: journeyPlans.id,
      journeyId: journeyPlans.journeyId,
      vehicleId: journeyPlans.vehicleId,
      version: journeyPlans.version,
      snapshot: journeyPlans.snapshot,
      createdAt: journeyPlans.createdAt,
    })
    .from(journeyPlans)
    .where(
      and(
        eq(journeyPlans.journeyId, journeyId),
        eq(journeyPlans.schemaVersion, 1),
      ),
    )
    .orderBy(desc(journeyPlans.version))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    ...row,
    snapshot: row.snapshot as RoadtripPlanSnapshot,
  };
}
