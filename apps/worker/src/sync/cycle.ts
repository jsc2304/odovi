import type { Db } from "@odovi/db";
import type { TeslamateSql } from "../teslamate/client.js";
import { syncVehicles } from "./vehicles.js";
import { syncVehicleStatus } from "./vehicleStatus.js";
import { syncGeofenceImport } from "./geofences.js";
import { syncDrives } from "./drives.js";
import { syncRoutePoints } from "./routePoints.js";
import { syncCharges } from "./charges.js";
import { syncChargePoints } from "./chargePoints.js";
import { syncParks } from "./parks.js";
import { syncSoftwareUpdates } from "./softwareUpdates.js";
import { loadMatchablePlaces } from "./places.js";
import { syncElevations } from "./elevation.js";
import { syncDriveWeather } from "./driveWeather.js";
import { applyClassificationRules } from "./classifyRules.js";
import { applyDrivingDefaults } from "./drivingDefaults.js";
import { applyAutoChargeCosts } from "./chargeCosts.js";
import { loadWorkerLocationProviderPolicy } from "../locationProviders/policy.js";

export interface SyncCycleOptions {
  appTimezone: string;
  elevationMaxPointsPerCycle?: number;
}

/** Ein kompletter Sync-Zyklus — genutzt vom Loop (index.ts) und der CLI. */
export async function runSyncCycle(
  db: Db,
  tm: TeslamateSql,
  options: SyncCycleOptions,
): Promise<void> {
  const vehicleMap = await syncVehicles(db, tm);
  await syncVehicleStatus(db, tm, vehicleMap);
  const geofenceResult = await syncGeofenceImport(db, tm);
  const matchablePlaces = await loadMatchablePlaces(db);
  const driveResult = await syncDrives(db, tm, vehicleMap, matchablePlaces);
  const routePointsResult = await syncRoutePoints(db, tm, driveResult.upsertedRefs);
  const chargeResult = await syncCharges(db, tm, vehicleMap, matchablePlaces);
  const chargePointsResult = await syncChargePoints(db, tm, chargeResult.upsertedRefs);
  const parkResult = await syncParks(db, matchablePlaces);
  const rulesResult = await applyClassificationRules(db, options.appTimezone);
  const defaultsResult = await applyDrivingDefaults(db, options.appTimezone);
  const chargeCostsResult = await applyAutoChargeCosts(db);
  const softwareUpdatesResult = await syncSoftwareUpdates(db, tm, vehicleMap);
  const providerPolicy = await loadWorkerLocationProviderPolicy(db);
  const elevationProvider = providerPolicy.resolve("elevation");
  const weatherProvider = providerPolicy.resolve("weather");
  const elevationResult = elevationProvider.status === "active"
    ? await syncElevations(db, elevationProvider, options.elevationMaxPointsPerCycle)
    : { pointsFilled: 0 };
  const driveWeatherResult = await syncDriveWeather(
    db,
    weatherProvider.status === "active" ? weatherProvider : null,
  );

  console.log(
    `[odovi-worker] sync ok: ${vehicleMap.size} vehicle(s), ` +
      `${driveResult.upserted} drive(s) upserted` +
      (driveResult.deletedZombies > 0
        ? `, ${driveResult.deletedZombies} zombie(s) entfernt`
        : "") +
      `, ${routePointsResult.pointsInserted} route point(s) (${routePointsResult.drivesProcessed} drive(s))` +
      `, ${chargeResult.upserted} charge session(s)` +
      (chargePointsResult.pointsInserted > 0
        ? `, ${chargePointsResult.pointsInserted} charge point(s) (${chargePointsResult.sessionsProcessed} session(s))`
        : "") +
      `, ${parkResult.upserted} park session(s) upserted` +
      (parkResult.deleted > 0 ? `, ${parkResult.deleted} verwaiste(n) Park(s) entfernt` : "") +
      (geofenceResult.imported > 0 ? `, ${geofenceResult.imported} Geofence(s) importiert` : "") +
      (softwareUpdatesResult.upserted > 0
        ? `, ${softwareUpdatesResult.upserted} software update(s) upserted`
        : "") +
      (elevationResult.pointsFilled > 0
        ? `, ${elevationResult.pointsFilled} elevation(s) befüllt`
        : "") +
      (driveWeatherResult.drivesFilled > 0
        ? `, ${driveWeatherResult.drivesFilled} drive weather(s) befüllt`
        : "") +
      (rulesResult.applied > 0
        ? `, ${rulesResult.applied} drive(s) per Regel klassifiziert`
        : "") +
      (defaultsResult.applied > 0
        ? `, ${defaultsResult.applied} drive(s) classified by driving profile`
        : "") +
      (chargeCostsResult.updated > 0
        ? `, ${chargeCostsResult.updated} Ladekosten automatisch gesetzt`
        : ""),
  );
}
