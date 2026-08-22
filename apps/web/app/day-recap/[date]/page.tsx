import { notFound, redirect } from "next/navigation";
import { buildJourneyKpis } from "@tripatlas/core";
import { getLocale, getTranslations } from "next-intl/server";
import { validateSession } from "../../../lib/auth/session";
import { APP_TIMEZONE } from "../../../lib/config";
import { formatLongDate, isValidDateParam } from "../../../lib/day";
import { getJourneyRouteTracks } from "../../../lib/journeys";
import { getDayTimeline, getVehicles } from "../../../lib/queries";
import {
  RecapExperience,
  type JourneyRecapData,
} from "../../journey-recap/[id]/RecapExperience";

export const dynamic = "force-dynamic";

export default async function DayRecapPage({
  params,
  searchParams,
}: {
  params: Promise<{ date: string }>;
  searchParams: Promise<{ vehicle?: string }>;
}) {
  if (!(await validateSession())) redirect("/login");

  const { date } = await params;
  if (!isValidDateParam(date)) notFound();

  const [{ vehicle }, vehicles, t, locale] = await Promise.all([
    searchParams,
    getVehicles(),
    getTranslations("day"),
    getLocale(),
  ]);
  if (vehicles.length === 0) notFound();

  const requestedVehicleId = vehicle ? Number(vehicle) : NaN;
  const current =
    vehicles.find((entry) => entry.id === requestedVehicleId) ?? vehicles[0];
  const timeline = await getDayTimeline(current.id, date);

  // A single drive already has its dedicated detail page. The day becomes a
  // route story only once there are at least two legs to experience.
  if (timeline.drives.length < 2) notFound();

  const driveIds = timeline.drives.map((drive) => drive.id);
  const tracks = await getJourneyRouteTracks(driveIds);
  const tracksById = new Map(tracks.map((track) => [track.driveId, track]));
  const orderedTracks = driveIds
    .map((driveId) => tracksById.get(driveId))
    .filter((track): track is NonNullable<typeof track> => Boolean(track));

  const items = [
    ...timeline.drives.map((drive) => ({
      kind: "drive" as const,
      id: drive.id,
      startTime: drive.startTime.toISOString(),
      distanceKm: drive.distanceKm,
      durationSeconds: drive.durationSeconds,
      energyKwh: drive.consumedEnergyKwh,
      startSoc: drive.startSoc,
      endSoc: drive.endSoc,
      from: drive.startPlaceName ?? drive.startAddress,
      to: drive.endPlaceName ?? drive.endAddress,
    })),
    ...timeline.charges.map((charge) => ({
      kind: "charge" as const,
      id: charge.id,
      startTime: charge.startTime.toISOString(),
      durationSeconds: charge.durationSeconds,
      energyKwh: charge.energyAddedKwh,
      startSoc: charge.startSoc,
      endSoc: charge.endSoc,
      maxPowerKw: charge.maxPowerKw,
      place: charge.placeName ?? charge.address,
    })),
  ].sort(
    (a, b) =>
      new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
  );

  const kpis = buildJourneyKpis(
    timeline.drives.map((drive) => ({
      startTime: drive.startTime,
      distanceKm: drive.distanceKm,
      durationSeconds: drive.durationSeconds,
      consumedEnergyKwh: drive.consumedEnergyKwh,
      energyIsEstimated: drive.energyIsEstimated,
      startSoc: drive.startSoc,
      endSoc: drive.endSoc,
      ascentM: null,
      descentM: null,
    })),
    timeline.charges.map((charge) => ({
      startTime: charge.startTime,
      durationSeconds: charge.durationSeconds,
      energyAddedKwh: charge.energyAddedKwh,
      cost: null,
    })),
  );

  const firstDrive = timeline.drives[0];
  const lastDrive = timeline.drives[timeline.drives.length - 1];
  const vehicleQuery = vehicles.length > 1 ? `?vehicle=${current.id}` : "";

  const data: JourneyRecapData = {
    timeZone: APP_TIMEZONE,
    journey: {
      id: null,
      name: t("recap.title"),
      type: "day",
      startTime: firstDrive.startTime.toISOString(),
      endTime: (lastDrive.endTime ?? lastDrive.startTime).toISOString(),
      color: "#8b5cf6",
      description: null,
    },
    items,
    tracks: orderedTracks,
    plannedRoute: [],
    presentation: {
      backHref: `/day/${date}${vehicleQuery}`,
      backLabel: t("recap.back"),
      eyebrow: t("recap.eyebrow"),
      dateLabel: formatLongDate(date, locale),
      finaleEyebrow: t("recap.finaleEyebrow"),
      finaleTitle: t("recap.finaleTitle"),
      scrollHint: t("recap.scrollHint"),
      chaptersLabel: t("recap.chaptersLabel"),
    },
    totals: {
      distanceKm: kpis.totalDistanceKm,
      driveTimeSeconds: kpis.driveTimeSeconds,
      chargeTimeSeconds: kpis.chargeTimeSeconds,
      chargeStops: kpis.chargeStopCount,
      consumedEnergyKwh: kpis.consumedEnergyKwh,
      chargedEnergyKwh: kpis.chargedEnergyKwh,
      startSoc: kpis.startSoc,
      endSoc: kpis.endSoc,
    },
  };

  return <RecapExperience data={data} />;
}
