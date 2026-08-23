import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getVehicles } from "../../../lib/queries";
import { getPlannerContext, getPlannerPlaces } from "../../../lib/planner";
import { getJourneyById } from "../../../lib/journeys";
import { getLatestJourneyPlan } from "../../../lib/roadtripPlans";
import { getCurrentWeather } from "../../../lib/weather";
import { Planner } from "./Planner";
import { VehicleRequiredState } from "../../../components/VehicleRequiredState";

export const dynamic = "force-dynamic";

// Vorbelegung des SoC-Feldes, falls der aktuelle Fahrzeug-SoC nicht bekannt ist.
const FALLBACK_SOC = 80;
// Vorbelegung der Außentemperatur, falls kein Wetter abrufbar ist.
const FALLBACK_TEMP_C = 15;

export default async function PlannerPage({
  searchParams,
}: {
  searchParams: Promise<{ journey?: string }>;
}) {
  const t = await getTranslations("planner");
  const vehicles = await getVehicles();
  if (vehicles.length === 0) {
    return (
      <VehicleRequiredState
        title={t("title")}
        subtitle={t("subtitle")}
      />
    );
  }
  const params = await searchParams;
  const requestedJourneyId = Number(params.journey);
  const editJourneyId =
    Number.isInteger(requestedJourneyId) && requestedJourneyId > 0
      ? requestedJourneyId
      : null;
  const [journey, storedPlan] = editJourneyId
    ? await Promise.all([
        getJourneyById(editJourneyId),
        getLatestJourneyPlan(editJourneyId),
      ])
    : [null, null];
  if (editJourneyId && (!journey || !storedPlan)) notFound();
  const vehicleId = storedPlan?.vehicleId ?? vehicles[0]!.id;

  const [context, places] = await Promise.all([
    getPlannerContext(vehicleId),
    getPlannerPlaces(),
  ]);

  // Außentemperatur aus dem aktuellen Wetter an der Fahrzeugposition vorbelegen.
  let defaultTempC = FALLBACK_TEMP_C;
  if (context.status?.lat != null && context.status?.lon != null) {
    const weather = await getCurrentWeather(
      context.status.lat,
      context.status.lon,
    );
    if (weather) defaultTempC = Math.round(weather.temperature);
  }

  const defaultSoc =
    context.status?.soc != null ? context.status.soc : FALLBACK_SOC;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-start gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">
              {t("title")}
            </h1>
            <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-400">
              {t("experimentalBadge")}
            </span>
          </div>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            {t("subtitle")}
          </p>
        </div>
      </div>

      <div className="mt-6">
        <Planner
          vehicleId={vehicleId}
          places={places}
          status={context.status}
          defaultSoc={defaultSoc}
          defaultTempC={defaultTempC}
          defaultCapacityKwh={Math.round(context.suggestedCapacityKwh)}
          capacityIsDerived={context.capacityIsDerived}
          historyDriveCount={context.historyDriveCount}
          osrmIsDefault={process.env.OSRM_URL == null}
          initialPlan={
            journey && storedPlan
              ? {
                  journeyId: journey.id,
                  name: journey.name,
                  version: storedPlan.version,
                  snapshot: storedPlan.snapshot,
                }
              : null
          }
        />
      </div>
    </div>
  );
}
