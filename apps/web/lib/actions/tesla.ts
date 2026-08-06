"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { auditLog, journeyPlans, vehicles } from "@tripatlas/db";
import type { RoadtripPlanSnapshot } from "@tripatlas/core";
import { db } from "../db";
import { validateSession } from "../auth/session";
import { getTeslaConfig } from "../tesla/config";
import { deleteTeslaIntegration, withTeslaAccessToken } from "../tesla/integration";
import { buildTeslaWaypoints } from "../tesla/waypoints";

export type TeslaActionResult = { ok: true; message: string } | { ok: false; error: string };

export async function disconnectTesla(): Promise<void> {
  const user = await validateSession();
  if (!user) return;
  await deleteTeslaIntegration();
  revalidatePath("/settings");
}

export async function sendRoadtripToTesla(input: {
  journeyId: number;
  version: number;
}): Promise<TeslaActionResult> {
  const t = await getTranslations("journeys");
  const user = await validateSession();
  if (!user) return { ok: false, error: t("errors.notAuthenticated") };
  if (!Number.isInteger(input.journeyId) || !Number.isInteger(input.version)) {
    return { ok: false, error: t("detail.plan.teslaInvalid") };
  }
  const config = getTeslaConfig();
  if (!config) return { ok: false, error: t("detail.plan.teslaNotConfigured") };

  const rows = await db
    .select({
      snapshot: journeyPlans.snapshot,
      vehicleVin: vehicles.vin,
    })
    .from(journeyPlans)
    .innerJoin(vehicles, eq(journeyPlans.vehicleId, vehicles.id))
    .where(
      and(
        eq(journeyPlans.journeyId, input.journeyId),
        eq(journeyPlans.version, input.version),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (!row) return { ok: false, error: t("detail.plan.teslaPlanNotFound") };
  const plan = row.snapshot as RoadtripPlanSnapshot;
  const waypoints = buildTeslaWaypoints(plan);
  if (!waypoints) return { ok: false, error: t("detail.plan.teslaInvalid") };

  try {
    await withTeslaAccessToken(async (accessToken, vehicleVin) => {
      if (row.vehicleVin && row.vehicleVin !== vehicleVin) {
        throw new Error("TESLA_VEHICLE_MISMATCH");
      }
      const response = await fetch(
        `${config.commandApiUrl}/api/1/vehicles/${encodeURIComponent(vehicleVin)}/command/navigation_waypoints_request`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${accessToken}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ waypoints }),
          cache: "no-store",
        },
      );
      const body = (await response.json().catch(() => null)) as
        | { response?: { result?: boolean; reason?: string }; error?: string }
        | null;
      if (!response.ok || body?.response?.result === false) {
        const reason = body?.response?.reason || body?.error || String(response.status);
        throw new Error(`TESLA_COMMAND_FAILED:${reason}`);
      }
    });
    await db.insert(auditLog).values({
      entityType: "journey",
      entityId: input.journeyId,
      field: "tesla_navigation_sent",
      oldValue: null,
      newValue: `plan_version:${input.version};stops:${plan.stops.length - 1}`,
      changedBy: user.username,
    });
    return { ok: true, message: t("detail.plan.teslaSent") };
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "TESLA_NOT_CONNECTED") {
      return { ok: false, error: t("detail.plan.teslaNotConnected") };
    }
    if (code === "TESLA_VEHICLE_MISMATCH") {
      return { ok: false, error: t("detail.plan.teslaVehicleMismatch") };
    }
    return { ok: false, error: t("detail.plan.teslaSendFailed") };
  }
}
