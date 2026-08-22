import { notFound, redirect } from "next/navigation";
import { buildJourneyKpis } from "@tripatlas/core";
import { validateSession } from "../../../lib/auth/session";
import { APP_TIMEZONE } from "../../../lib/config";
import { getJourneyDetail, getJourneyRouteTracks } from "../../../lib/journeys";
import { getLatestJourneyPlan } from "../../../lib/roadtripPlans";
import { RecapExperience, type JourneyRecapData } from "./RecapExperience";

export const dynamic = "force-dynamic";

export default async function JourneyRecapPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!(await validateSession())) redirect("/login");

  const { id } = await params;
  const journeyId = Number(id);
  if (!Number.isInteger(journeyId) || journeyId <= 0) notFound();

  const detail = await getJourneyDetail(journeyId);
  if (!detail) notFound();

  const driveIds = detail.items
    .filter((item) => item.kind === "drive")
    .map((item) => item.id);
  const [tracks, storedPlan] = await Promise.all([
    getJourneyRouteTracks(driveIds),
    getLatestJourneyPlan(journeyId),
  ]);
  const tracksById = new Map(tracks.map((track) => [track.driveId, track]));
  const orderedTracks = driveIds
    .map((driveId) => tracksById.get(driveId))
    .filter((track): track is NonNullable<typeof track> => Boolean(track));
  const kpis = buildJourneyKpis(detail.kpiDrives, detail.kpiCharges);

  const data: JourneyRecapData = {
    timeZone: APP_TIMEZONE,
    journey: {
      id: detail.journey.id,
      name: detail.journey.name,
      type: detail.journey.type,
      startTime: detail.journey.startTime.toISOString(),
      endTime: detail.journey.endTime.toISOString(),
      color: detail.journey.color ?? "#8b5cf6",
      description: detail.journey.description,
    },
    items: detail.items.map((item) =>
      item.kind === "drive"
        ? {
            kind: "drive" as const,
            id: item.id,
            startTime: item.startTime.toISOString(),
            distanceKm: item.distanceKm,
            durationSeconds: item.durationSeconds,
            energyKwh: item.consumedEnergyKwh,
            startSoc: item.startSoc,
            endSoc: item.endSoc,
            from: item.startPlaceName ?? item.startAddress,
            to: item.endPlaceName ?? item.endAddress,
          }
        : {
            kind: "charge" as const,
            id: item.id,
            startTime: item.startTime.toISOString(),
            durationSeconds: item.durationSeconds,
            energyKwh: item.energyAddedKwh,
            startSoc: item.startSoc,
            endSoc: item.endSoc,
            maxPowerKw: item.maxPowerKw,
            place: item.placeName ?? item.address,
          },
    ),
    tracks: orderedTracks,
    plannedRoute: storedPlan?.snapshot.geometry ?? [],
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
