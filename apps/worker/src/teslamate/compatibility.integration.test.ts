import { afterAll, describe, expect, it } from "vitest";
import { createTeslamateClient, probeTeslamateSchema } from "./client.js";
import {
  fetchCars,
  fetchChargesForProcess,
  fetchCompletedChargingProcessesSince,
  fetchCompletedDrivesSince,
  fetchGeofences,
  fetchInProgressChargingProcesses,
  fetchInProgressDrives,
  fetchLatestPositions,
  fetchLatestStates,
  fetchPositionsForDrive,
  fetchUpdates,
} from "./queries.js";

const databaseUrl = process.env.TESLAMATE_COMPATIBILITY_DATABASE_URL;
const fixtureVersion = process.env.TESLAMATE_FIXTURE_VERSION ?? "unknown";
const integrationIt = databaseUrl == null ? it.skip : it;
const sql = databaseUrl == null ? null : createTeslamateClient(databaseUrl);

afterAll(async () => {
  await sql?.end({ timeout: 1 });
});

describe(`TeslaMate ${fixtureVersion} boundary fixture`, () => {
  integrationIt("uses an actual SELECT-only role, not just read-only transactions", async () => {
    const [privileges] = await sql!`
      select
        current_setting('transaction_read_only') as read_only,
        r.rolsuper as superuser,
        has_table_privilege(current_user, 'public.drives', 'SELECT') as can_read,
        has_table_privilege(current_user, 'public.drives', 'INSERT,UPDATE,DELETE') as can_write
      from pg_catalog.pg_roles r where r.rolname = current_user
    `;
    expect(privileges).toEqual({
      read_only: "on",
      superuser: false,
      can_read: true,
      can_write: false,
    });
  });

  integrationIt("passes the probe and every runtime synchronization query path", async () => {
    expect(sql).not.toBeNull();
    const tm = sql!;

    await expect(probeTeslamateSchema(tm)).resolves.toBeUndefined();

    const cars = await fetchCars(tm);
    const completedDrives = await fetchCompletedDrivesSince(tm, new Date(0));
    await fetchInProgressDrives(tm);
    const completedCharges = await fetchCompletedChargingProcessesSince(tm, new Date(0));
    await fetchInProgressChargingProcesses(tm);
    const geofences = await fetchGeofences(tm);
    const latestPositions = await fetchLatestPositions(tm);
    await fetchLatestStates(tm);
    const updates = await fetchUpdates(tm);

    expect(cars.length).toBeGreaterThan(0);
    expect(completedDrives.length).toBeGreaterThan(0);
    expect(completedCharges.length).toBeGreaterThan(0);
    expect(completedCharges[0]).toHaveProperty("end_rated_range_km");
    expect(completedCharges[0]!.end_rated_range_km == null || typeof completedCharges[0]!.end_rated_range_km === "number").toBe(true);
    expect(geofences.length).toBeGreaterThan(0);
    expect(latestPositions.length).toBeGreaterThan(0);
    expect(updates.length).toBeGreaterThan(0);

    const drive = completedDrives[0]!;
    expect(drive.end_time).not.toBeNull();
    const routePoints = await fetchPositionsForDrive(
      tm,
      drive.car_id,
      drive.start_time,
      drive.end_time!,
    );
    expect(routePoints.length).toBeGreaterThan(0);

    const chargePoints = await fetchChargesForProcess(tm, completedCharges[0]!.id);
    expect(chargePoints.length).toBeGreaterThan(0);
  });
});
