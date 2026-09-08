import "server-only";
import { eq } from "drizzle-orm";
import { settings } from "@odovi/db";
import { drivingProfileKey, parseDrivingProfile } from "@odovi/core";
import { db } from "./db";

export async function getDrivingProfile(vehicleId: number) {
  const [row] = await db.select({ value: settings.value }).from(settings)
    .where(eq(settings.key, drivingProfileKey(vehicleId))).limit(1);
  return parseDrivingProfile(row?.value);
}
