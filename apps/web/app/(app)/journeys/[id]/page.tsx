import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, Zap, ArrowRight, ChevronLeft, MapPinned, Pencil, Sparkles } from "lucide-react";
import { getTranslations } from "next-intl/server";
import {
  buildJourneyKpis,
  formatConsumption,
  formatDuration,
  formatKm,
  formatKwh,
  formatTime,
  type RoadtripPlanSnapshot,
} from "@tripatlas/core";
import { APP_TIMEZONE } from "../../../../lib/config";
import {
  getJourneyCandidates,
  getJourneyDetail,
  getJourneyRouteTracks,
  type JourneyDriveItem,
  type JourneyTimelineItem,
} from "../../../../lib/journeys";
import { buttonClasses } from "../../../../components/ui/Button";
import { getLatestJourneyPlan } from "../../../../lib/roadtripPlans";
import { DeleteJourneyButton } from "./DeleteJourneyButton";
import { AddItemButton, RemoveItemButton } from "./ItemButtons";
import { JourneyMapLoader } from "./JourneyMapLoader";
import { OfflinePlanButton } from "./OfflinePlanButton";
import { TeslaSendButton } from "./TeslaSendButton";
import { PlanActualCard } from "./PlanActualCard";

export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: APP_TIMEZONE,
});

function formatRange(start: Date, end: Date): string {
  return `${dateFmt.format(start)} – ${dateFmt.format(end)}`;
}

function formatDateTimeShort(date: Date): string {
  return `${dateFmt.format(date)} ${formatTime(date, APP_TIMEZONE)}`;
}

function formatEur(value: number): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
  }).format(value);
}

function Kpi({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
      <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-neutral-900 dark:text-neutral-100">
        {value}
      </p>
      {sub && (
        <p className="text-xs tabular-nums text-neutral-500 dark:text-neutral-400">
          {sub}
        </p>
      )}
    </div>
  );
}

export default async function JourneyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const t = await getTranslations("journeys");
  const tCommon = await getTranslations("common");
  const { id } = await params;
  const journeyId = Number(id);
  if (!Number.isInteger(journeyId) || journeyId <= 0) notFound();

  const detail = await getJourneyDetail(journeyId);
  if (!detail) notFound();

  const { journey, items, kpiDrives, kpiCharges } = detail;
  const kpis = buildJourneyKpis(kpiDrives, kpiCharges);
  const driveItems = items.filter(
    (item): item is JourneyDriveItem => item.kind === "drive",
  );
  const driveIds = driveItems.map((item) => item.id);
  const [candidates, routeTracks, storedPlan] = await Promise.all([
    getJourneyCandidates(journeyId),
    getJourneyRouteTracks(driveIds),
    getLatestJourneyPlan(journeyId),
  ]);

  const chargeMarkers = items
    .filter(
      (i): i is Extract<JourneyTimelineItem, { kind: "charge" }> =>
        i.kind === "charge" && i.lat != null && i.lon != null,
    )
    .map((i) => ({ id: i.id, lat: i.lat as number, lon: i.lon as number, placeName: i.placeName }));
  const hasRouteData = routeTracks.some((t) => t.points.length >= 2) || chargeMarkers.length > 0;
  const mapKey = `${routeTracks.map((t) => t.driveId).join("-")}:${chargeMarkers.map((c) => c.id).join("-")}`;

  const socValue =
    kpis.minSoc != null && kpis.maxSoc != null
      ? `${kpis.minSoc} – ${kpis.maxSoc} %`
      : "–";
  const socSub =
    kpis.startSoc != null && kpis.endSoc != null
      ? t("detail.kpi.socRange", { start: kpis.startSoc, end: kpis.endSoc })
      : undefined;

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href="/journeys"
        className="inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
      >
        <ChevronLeft aria-hidden size={16} />
        {t("detail.allJourneys")}
      </Link>

      {/* Header */}
      <div className="mt-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              aria-hidden
              className="h-3 w-3 shrink-0 rounded-full"
              style={{ backgroundColor: journey.color ?? "#a78bfa" }}
            />
            <h1 className="text-2xl font-semibold tracking-tight">
              {journey.name}
            </h1>
            <span className="inline-flex items-center rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
              {t(`type.${journey.type}`)}
            </span>
          </div>
          <p className="mt-1 text-sm tabular-nums text-neutral-500 dark:text-neutral-400">
            {formatRange(journey.startTime, journey.endTime)}
          </p>
          {journey.description && (
            <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">
              {journey.description}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <Link
            href={`/journeys/${journey.id}/edit`}
            className={buttonClasses("secondary", "md")}
          >
            {tCommon("actions.edit")}
          </Link>
          <DeleteJourneyButton journeyId={journey.id} name={journey.name} />
        </div>
      </div>

      {items.length > 0 && (
        <Link
          href={`/journey-recap/${journey.id}`}
          className="group mt-5 flex items-center justify-between gap-4 overflow-hidden rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 via-white to-sky-50 p-4 transition hover:-translate-y-0.5 hover:border-violet-300 hover:shadow-lg hover:shadow-violet-100 dark:border-violet-900/60 dark:from-violet-950/50 dark:via-neutral-900 dark:to-sky-950/40 dark:hover:border-violet-700 dark:hover:shadow-violet-950/40"
        >
          <span className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-white shadow-lg shadow-violet-300 dark:shadow-violet-950">
              <Sparkles aria-hidden size={19} />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-neutral-900 dark:text-white">
                {t("recap.open")}
              </span>
              <span className="block truncate text-xs text-neutral-500 dark:text-neutral-400">
                {t("recap.preview")}
              </span>
            </span>
          </span>
          <ArrowRight
            aria-hidden
            size={18}
            className="shrink-0 text-violet-500 transition-transform group-hover:translate-x-1"
          />
        </Link>
      )}

      {/* Export (vision.md §20.4) */}
      <div className="mt-4 flex items-center gap-1.5">
        <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
          {t("detail.export")}
        </span>
        <a
          href={`/api/export/journey/${journey.id}?format=csv`}
          className={buttonClasses("ghost", "sm")}
        >
          <Download aria-hidden size={14} />
          CSV
        </a>
        <a
          href={`/api/export/journey/${journey.id}?format=pdf`}
          className={buttonClasses("ghost", "sm")}
        >
          <Download aria-hidden size={14} />
          PDF
        </a>
        {hasRouteData && (
          <a
            href={`/api/export/journey/${journey.id}?format=gpx`}
            className={buttonClasses("ghost", "sm")}
          >
            <Download aria-hidden size={14} />
            GPX
          </a>
        )}
      </div>

      {storedPlan && (
        <>
          <PlannedRoadtripCard
            journeyId={journey.id}
            version={storedPlan.version}
            plan={storedPlan.snapshot}
            journeyName={journey.name}
            t={t}
          />
          <PlanActualCard plan={storedPlan.snapshot} drives={driveItems} />
        </>
      )}

      {hasRouteData && (
        <div className="mt-4">
          <JourneyMapLoader
            key={mapKey}
            tracks={routeTracks}
            charges={chargeMarkers}
            color={journey.color}
          />
        </div>
      )}

      {/* KPI grid */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Kpi label={t("detail.kpi.totalDistance")} value={formatKm(kpis.totalDistanceKm)} />
        <Kpi label={t("detail.kpi.driveTime")} value={formatDuration(kpis.driveTimeSeconds)} />
        <Kpi label={t("detail.kpi.chargeTime")} value={formatDuration(kpis.chargeTimeSeconds)} />
        <Kpi
          label={t("detail.kpi.avgConsumption")}
          value={
            kpis.avgConsumptionWhKm != null
              ? formatConsumption(kpis.avgConsumptionWhKm, kpis.anyEstimated)
              : "–"
          }
        />
        <Kpi
          label={t("detail.kpi.consumedEnergy")}
          value={formatKwh(kpis.consumedEnergyKwh)}
          sub={kpis.anyEstimated ? t("detail.kpi.partiallyEstimated") : undefined}
        />
        <Kpi
          label={t("detail.kpi.chargedEnergy")}
          value={formatKwh(kpis.chargedEnergyKwh)}
        />
        <Kpi
          label={t("detail.kpi.chargeStops")}
          value={String(kpis.chargeStopCount)}
        />
        <Kpi label={t("detail.kpi.socMinMax")} value={socValue} sub={socSub} />
        <Kpi
          label={t("detail.kpi.cost")}
          value={kpis.totalCost != null ? formatEur(kpis.totalCost) : "–"}
          sub={
            kpis.costPer100Km != null
              ? t("detail.kpi.costPerKm", { value: formatEur(kpis.costPer100Km) })
              : kpis.hasIncompleteCost
                ? t("detail.kpi.incomplete")
                : undefined
          }
        />
      </div>

      {kpis.hasIncompleteCost && kpis.totalCost != null && (
        <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
          {t("detail.incompleteCostNote")}
        </p>
      )}

      {/* Chronological item list */}
      <h2 className="mt-8 text-sm font-semibold text-neutral-900 dark:text-neutral-100">
        {t("detail.itemsHeading")}
      </h2>
      <div className="mt-3 overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-800">
        {items.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-neutral-500 dark:text-neutral-400">
            {t("detail.noItems")}
          </p>
        ) : (
          <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {items.map((item) => (
              <ItemRow key={`${item.kind}-${item.id}`} item={item} journeyId={journey.id} t={t} />
            ))}
          </ul>
        )}
      </div>

      {/* Add candidates */}
      <h2 className="mt-8 text-sm font-semibold text-neutral-900 dark:text-neutral-100">
        {t("detail.add")}
      </h2>
      <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
        {t("detail.addHint")}
      </p>
      <div className="mt-3 overflow-hidden rounded-xl border border-neutral-200 dark:border-neutral-800">
        {candidates.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-neutral-500 dark:text-neutral-400">
            {t("detail.noCandidates")}
          </p>
        ) : (
          <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {candidates.map((c) => (
              <li
                key={`${c.kind}-${c.id}`}
                className="flex items-center gap-3 px-4 py-2.5"
              >
                {c.kind === "charge" ? (
                  <Zap aria-hidden size={16} className="shrink-0 text-amber-500" />
                ) : (
                  <ArrowRight aria-hidden size={16} className="shrink-0 text-neutral-400" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-neutral-800 dark:text-neutral-200">
                    {c.label}
                    {c.excluded && (
                      <span className="ml-1.5 rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">
                        {t("detail.previouslyRemoved")}
                      </span>
                    )}
                  </p>
                  <p className="text-xs tabular-nums text-neutral-500 dark:text-neutral-400">
                    {formatDateTimeShort(c.startTime)}
                    {c.kind === "drive" && c.distanceKm != null
                      ? ` · ${formatKm(c.distanceKm)}`
                      : ""}
                    {c.kind === "charge" && c.energyAddedKwh != null
                      ? ` · ${formatKwh(c.energyAddedKwh, { sign: true })}${
                          c.chargerType ? ` · ${c.chargerType.toUpperCase()}` : ""
                        }`
                      : ""}
                  </p>
                </div>
                <AddItemButton
                  journeyId={journey.id}
                  itemType={c.kind}
                  itemId={c.id}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function PlannedRoadtripCard({
  journeyId,
  version,
  plan,
  journeyName,
  t,
}: {
  journeyId: number;
  version: number;
  plan: RoadtripPlanSnapshot;
  journeyName: string;
  t: Awaited<ReturnType<typeof getTranslations>>;
}) {
  return (
    <section className="mt-5 rounded-2xl border border-sky-200 bg-sky-50/70 p-4 dark:border-sky-900/60 dark:bg-sky-950/20">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <MapPinned aria-hidden size={18} className="text-sky-600 dark:text-sky-400" />
            <h2 className="text-sm font-semibold">{t("detail.plan.title")}</h2>
            <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-neutral-500 dark:bg-neutral-900 dark:text-neutral-400">
              {t("detail.plan.version", { version })}
            </span>
          </div>
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            {t("detail.plan.summary", {
              stops: plan.stops.length,
              distance: formatKm(plan.totals.distanceKm),
              duration: formatDuration(plan.totals.durationSeconds),
            })}
          </p>
        </div>
        <Link
          href={`/planner?journey=${journeyId}`}
          className={buttonClasses("secondary", "sm")}
        >
          <Pencil aria-hidden size={14} />
          {t("detail.plan.edit")}
        </Link>
      </div>

      <ol className="mt-4 flex flex-col gap-2">
        {plan.stops.map((stop, index) => {
          const leg = index > 0 ? plan.legs[index - 1] : null;
          return (
            <li key={stop.id} className="flex items-start gap-3 text-sm">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-xs font-semibold text-sky-700 shadow-sm dark:bg-neutral-900 dark:text-sky-300">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{stop.label}</p>
                {leg && (
                  <p className="text-xs tabular-nums text-neutral-500 dark:text-neutral-400">
                    {formatKm(leg.distanceKm)} · {formatDuration(leg.durationSeconds)} · {Math.round(leg.arrivalSoc)}% {t("detail.plan.arrival")}
                  </p>
                )}
              </div>
              {stop.kind === "charge" && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                  {t("detail.plan.charge")}
                </span>
              )}
            </li>
          );
        })}
      </ol>

      <p className="mt-4 text-xs text-neutral-500 dark:text-neutral-400">
        {t("detail.plan.teslaHint")}
      </p>
      <div className="mt-3">
        <div className="flex flex-wrap items-start gap-2">
          <TeslaSendButton
            journeyId={journeyId}
            version={version}
            labels={{
              send: t("detail.plan.teslaSend"),
              sending: t("detail.plan.teslaSending"),
              confirm: t("detail.plan.teslaConfirm", { count: plan.stops.length - 1 }),
            }}
          />
          <OfflinePlanButton
            journeyId={journeyId}
            journeyName={journeyName}
            version={version}
            plan={plan}
            saveLabel={t("detail.plan.offlineSave")}
            openLabel={t("detail.plan.offlineOpen")}
            savedLabel={t("detail.plan.offlineSaved")}
          />
        </div>
      </div>
    </section>
  );
}

function ItemRow({
  item,
  journeyId,
  t,
}: {
  item: JourneyTimelineItem;
  journeyId: number;
  t: Awaited<ReturnType<typeof getTranslations>>;
}) {
  const href = item.kind === "drive" ? `/drives/${item.id}` : `/charges/${item.id}`;

  const title =
    item.kind === "drive"
      ? `${item.startPlaceName ?? item.startAddress ?? "?"} → ${
          item.endPlaceName ?? item.endAddress ?? "?"
        }`
      : item.placeName ?? item.address ?? t("chargingSession");

  const sub =
    item.kind === "drive"
      ? [
          formatDateTimeShort(item.startTime),
          item.distanceKm != null ? formatKm(item.distanceKm) : null,
          item.durationSeconds != null
            ? formatDuration(item.durationSeconds)
            : null,
        ]
          .filter(Boolean)
          .join(" · ")
      : [
          formatDateTimeShort(item.startTime),
          item.energyAddedKwh != null
            ? formatKwh(item.energyAddedKwh, { sign: true })
            : null,
          item.chargerType ? item.chargerType.toUpperCase() : null,
        ]
          .filter(Boolean)
          .join(" · ");

  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      {item.kind === "charge" ? (
        <Zap aria-hidden size={16} className="shrink-0 text-amber-500" />
      ) : (
        <ArrowRight aria-hidden size={16} className="shrink-0 text-neutral-400" />
      )}
      <Link href={href} className="min-w-0 flex-1 hover:underline">
        <p className="truncate text-sm font-medium text-neutral-900 dark:text-neutral-100">
          {title}
        </p>
        <p className="truncate text-xs tabular-nums text-neutral-500 dark:text-neutral-400">
          {sub}
        </p>
      </Link>
      <RemoveItemButton
        journeyId={journeyId}
        itemType={item.kind}
        itemId={item.id}
      />
    </li>
  );
}
