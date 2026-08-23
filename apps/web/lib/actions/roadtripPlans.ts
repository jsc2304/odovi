"use server";
import { revalidatePath } from "next/cache";
import { eq, max } from "drizzle-orm";
import { z } from "zod";
import { getTranslations } from "next-intl/server";
import {
  auditLog,
  journeyPlans,
  journeys,
  vehicles,
} from "@tripatlas/db";
import type { RoadtripPlanSnapshot } from "@tripatlas/core";
import { db } from "../db";
import { validateSession } from "../auth/session";
import { autoAssignJourney } from "./journeys";

const pointSchema = z.tuple([
  z.number().gte(-90).lte(90),
  z.number().gte(-180).lte(180),
]);

const breakdownSchema = z.object({
  baseKwh: z.number().finite(),
  speedAdjustmentKwh: z.number().finite(),
  ascentKwh: z.number().finite(),
  descentCreditKwh: z.number().finite(),
  referenceSpeedKmh: z.number().finite().optional(),
  speedFactor: z.number().finite(),
});

const chargePowerBinSchema = z.object({
  minSoc: z.number().min(0).max(100),
  maxSoc: z.number().min(0).max(100),
  powerKw: z.number().positive().finite(),
  sampleCount: z.number().int().nonnegative(),
});

const chargeStopPlanSchema = z.object({
  stopId: z.string().min(1).max(100),
  stopIndex: z.number().int().nonnegative(),
  arrivalSoc: z.number().finite(),
  targetSoc: z.number().min(0).max(100),
  energyAddedKwh: z.number().nonnegative().finite(),
  durationSeconds: z.number().nonnegative().finite(),
  effectivePowerKw: z.number().nonnegative().finite(),
});

const stopSchema = z.object({
  id: z.string().trim().min(1).max(100),
  label: z.string().trim().min(1).max(500),
  lat: z.number().gte(-90).lte(90),
  lon: z.number().gte(-180).lte(180),
  kind: z.enum(["start", "waypoint", "charge", "destination"]),
  targetSoc: z.number().min(0).max(100).nullable().optional(),
});

const legSchema = z.object({
  index: z.number().int().nonnegative(),
  fromStopId: z.string().min(1).max(100),
  toStopId: z.string().min(1).max(100),
  distanceKm: z.number().nonnegative().finite(),
  durationSeconds: z.number().nonnegative().finite(),
  avgSpeedKmh: z.number().nonnegative().finite(),
  energyKwh: z.number().finite(),
  whPerKm: z.number().finite(),
  ascentM: z.number().nonnegative().finite(),
  descentM: z.number().nonnegative().finite(),
  startSoc: z.number().finite(),
  arrivalSoc: z.number().finite(),
  breakdown: breakdownSchema,
});

const snapshotSchema = z
  .object({
    schemaVersion: z.literal(1),
    vehicleId: z.number().int().positive(),
    departureAt: z.string().datetime(),
    startSoc: z.number().min(0).max(100),
    reserveSoc: z.number().min(0).max(50),
    tempC: z.number().min(-40).max(55),
    capacityKwh: z.number().min(5).max(250),
    stops: z.array(stopSchema).min(2).max(12),
    legs: z.array(legSchema).min(1).max(11),
    totals: z.object({
      distanceKm: z.number().nonnegative().finite(),
      durationSeconds: z.number().nonnegative().finite(),
      energyKwh: z.number().finite(),
      whPerKm: z.number().finite(),
      arrivalSoc: z.number().finite(),
    }),
    charging: z
      .object({
        stops: z.array(chargeStopPlanSchema).max(10),
        durationSeconds: z.number().nonnegative().finite(),
        energyAddedKwh: z.number().nonnegative().finite(),
      })
      .optional(),
    geometry: z.array(pointSchema).min(2).max(500),
    assumptions: z.object({
      baseWhPerKm: z.number().positive().finite(),
      baseSource: z.enum([
        "temp-bin",
        "history-avg",
        "vehicle-efficiency",
        "default",
      ]),
      referenceSpeedKmh: z.number().nonnegative().finite(),
      tempBinCenterC: z.number().finite().nullable(),
      historyDriveCount: z.number().int().nonnegative(),
      elevationOk: z.boolean(),
      ascentM: z.number().nonnegative().finite(),
      descentM: z.number().nonnegative().finite(),
      elevationAllocation: z.literal("distance-proportional"),
      routeProvider: z.literal("osrm"),
      routeProviderIsDefault: z.boolean(),
      charging: z
        .object({
          source: z.enum([
            "history-dc-curve",
            "history-dc-average",
            "default",
          ]),
          sessionCount: z.number().int().nonnegative(),
          fallbackPowerKw: z.number().positive().finite(),
          bins: z.array(chargePowerBinSchema).max(10),
        })
        .optional(),
    }),
  })
  .superRefine((snapshot, ctx) => {
    if (snapshot.stops[0]?.kind !== "start") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["stops", 0, "kind"],
        message: "First stop must be the start",
      });
    }
    if (snapshot.stops.at(-1)?.kind !== "destination") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["stops", snapshot.stops.length - 1, "kind"],
        message: "Last stop must be the destination",
      });
    }
    if (snapshot.legs.length !== snapshot.stops.length - 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["legs"],
        message: "Leg count must match adjacent stops",
      });
    }
    for (const [index, leg] of snapshot.legs.entries()) {
      if (
        leg.index !== index ||
        leg.fromStopId !== snapshot.stops[index]?.id ||
        leg.toStopId !== snapshot.stops[index + 1]?.id
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["legs", index],
          message: "Leg does not match its adjacent stops",
        });
      }
    }
  });

const saveSchema = z.object({
  journeyId: z.number().int().positive().optional(),
  name: z.string().trim().min(1).max(200),
  snapshot: snapshotSchema,
});

export type SaveRoadtripPlanInput = z.input<typeof saveSchema>;
export type SaveRoadtripPlanResult =
  | { ok: true; journeyId: number; version: number }
  | { ok: false; error: string };

export async function saveRoadtripPlan(
  input: SaveRoadtripPlanInput,
): Promise<SaveRoadtripPlanResult> {
  const t = await getTranslations("planner");
  const user = await validateSession();
  if (!user) return { ok: false, error: t("errors.notAuthenticated") };

  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? t("errors.invalidInput"),
    };
  }

  const snapshot = parsed.data.snapshot as RoadtripPlanSnapshot;
  const departureAt = new Date(snapshot.departureAt);
  const tripDurationSeconds =
    snapshot.totals.durationSeconds +
    (snapshot.charging?.durationSeconds ?? 0);
  const endTime = new Date(
    departureAt.getTime() + tripDurationSeconds * 1000,
  );

  const vehicle = await db
    .select({ id: vehicles.id })
    .from(vehicles)
    .where(eq(vehicles.id, snapshot.vehicleId))
    .limit(1);
  if (!vehicle[0]) return { ok: false, error: t("errors.vehicleNotFound") };

  try {
    const saved = await db.transaction(async (tx) => {
      let journeyId = parsed.data.journeyId;
      let version = 1;

      if (journeyId != null) {
        const existing = await tx
          .select({ id: journeys.id })
          .from(journeys)
          .where(eq(journeys.id, journeyId))
          .limit(1);
        if (!existing[0]) throw new Error("JOURNEY_NOT_FOUND");

        const versions = await tx
          .select({ latest: max(journeyPlans.version) })
          .from(journeyPlans)
          .where(eq(journeyPlans.journeyId, journeyId));
        version = (versions[0]?.latest ?? 0) + 1;
        await tx
          .update(journeys)
          .set({
            name: parsed.data.name,
            type: "roadtrip",
            startTime: departureAt,
            endTime,
            updatedAt: new Date(),
          })
          .where(eq(journeys.id, journeyId));
      } else {
        const inserted = await tx
          .insert(journeys)
          .values({
            name: parsed.data.name,
            type: "roadtrip",
            startTime: departureAt,
            endTime,
          })
          .returning({ id: journeys.id });
        journeyId = inserted[0]!.id;
      }

      await tx.insert(journeyPlans).values({
        journeyId,
        vehicleId: snapshot.vehicleId,
        version,
        schemaVersion: snapshot.schemaVersion,
        snapshot,
        createdBy: user.username,
      });
      await tx.insert(auditLog).values({
        entityType: "journey",
        entityId: journeyId,
        field: "plan_version_created",
        oldValue: version > 1 ? String(version - 1) : null,
        newValue: String(version),
        changedBy: user.username,
      });
      return { journeyId, version };
    });

    // A plan saved after telemetry arrived should immediately expose its actual
    // drives. Future telemetry stays source-owned and can be matched again by
    // the existing Journey workflow without altering the saved plan snapshot.
    await autoAssignJourney(saved.journeyId);

    revalidatePath("/journeys");
    revalidatePath(`/journeys/${saved.journeyId}`);
    return { ok: true, ...saved };
  } catch (error) {
    if (error instanceof Error && error.message === "JOURNEY_NOT_FOUND") {
      return { ok: false, error: t("errors.journeyNotFound") };
    }
    return { ok: false, error: t("errors.saveFailed") };
  }
}
