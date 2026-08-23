import Link from "next/link";
import { CircleGauge, TriangleAlert } from "lucide-react";
import { getTranslations } from "next-intl/server";
import {
  compareRoadtripPlanToActual,
  formatConsumption,
  formatDuration,
  formatKm,
  formatSoc,
  type RoadtripPlanActualComparison,
  type RoadtripPlanSnapshot,
} from "@tripatlas/core";
import type { JourneyDriveItem } from "../../../../lib/journeys";

function sign(value: number): string {
  return value > 0 ? "+" : value < 0 ? "−" : "±";
}

function formatSignedKm(value: number): string {
  return `${sign(value)}${formatKm(Math.abs(value))}`;
}

function formatSignedDuration(value: number): string {
  return `${sign(value)}${formatDuration(Math.abs(value))}`;
}

function formatSignedConsumption(value: number): string {
  return `${sign(value)}${Math.round(Math.abs(value))} Wh/km`;
}

function formatSignedSoc(value: number): string {
  return `${sign(value)}${Math.round(Math.abs(value))} %-Pkt.`;
}

function comparisonValue(
  actual: number | null,
  formatter: (value: number) => string,
): string {
  return actual == null ? "—" : formatter(actual);
}

function deltaValue(
  delta: number | null,
  formatter: (value: number) => string,
): string {
  return delta == null ? "—" : formatter(delta);
}

function Metric({
  label,
  actual,
  planned,
  delta,
}: {
  label: string;
  actual: string;
  planned: string;
  delta: string;
}) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
      <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-neutral-900 dark:text-neutral-100">
        {actual}
      </p>
      <p className="mt-1 text-[11px] tabular-nums text-neutral-500 dark:text-neutral-400">
        {planned} · <span className="font-medium">{delta}</span>
      </p>
    </div>
  );
}

type Translator = Awaited<ReturnType<typeof getTranslations>>;

function buildChangeNotes(
  comparison: RoadtripPlanActualComparison,
  t: Translator,
): string[] {
  const deltas = comparison.deltas;
  if (!deltas) return [];
  const notes: string[] = [];

  if (deltas.distanceKm != null && Math.abs(deltas.distanceKm) >= 2) {
    notes.push(
      t(
        deltas.distanceKm > 0
          ? "detail.planActual.changes.distanceLonger"
          : "detail.planActual.changes.distanceShorter",
        { value: formatKm(Math.abs(deltas.distanceKm)) },
      ),
    );
  }
  if (
    deltas.durationSeconds != null &&
    Math.abs(deltas.durationSeconds) >= 5 * 60
  ) {
    notes.push(
      t(
        deltas.durationSeconds > 0
          ? "detail.planActual.changes.durationLonger"
          : "detail.planActual.changes.durationShorter",
        { value: formatDuration(Math.abs(deltas.durationSeconds)) },
      ),
    );
  }
  if (deltas.whPerKm != null && Math.abs(deltas.whPerKm) >= 8) {
    notes.push(
      t(
        deltas.whPerKm > 0
          ? "detail.planActual.changes.consumptionHigher"
          : "detail.planActual.changes.consumptionLower",
        { value: `${Math.round(Math.abs(deltas.whPerKm))} Wh/km` },
      ),
    );
  }
  if (deltas.arrivalSoc != null && Math.abs(deltas.arrivalSoc) >= 2) {
    notes.push(
      t(
        deltas.arrivalSoc > 0
          ? "detail.planActual.changes.socHigher"
          : "detail.planActual.changes.socLower",
        { value: `${Math.round(Math.abs(deltas.arrivalSoc))} %-Pkt.` },
      ),
    );
  }

  return notes.length > 0
    ? notes.slice(0, 3)
    : [t("detail.planActual.changes.onPlan")];
}

function confidenceClasses(confidence: "high" | "medium" | "low"): string {
  if (confidence === "high") {
    return "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300";
  }
  if (confidence === "medium") {
    return "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-300";
  }
  return "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300";
}

function hasIncompleteCoverage(comparison: RoadtripPlanActualComparison): boolean {
  return Object.values(comparison.coverage).some((value) => value < 1);
}

export async function PlanActualCard({
  plan,
  drives,
}: {
  plan: RoadtripPlanSnapshot;
  drives: JourneyDriveItem[];
}) {
  const t = await getTranslations("journeys");
  const comparison = compareRoadtripPlanToActual(
    plan,
    drives.map((drive) => ({
      id: drive.id,
      distanceKm: drive.distanceKm,
      durationSeconds: drive.durationSeconds,
      energyKwh: drive.consumedEnergyKwh,
      energyIsEstimated: drive.energyIsEstimated,
      startSoc: drive.startSoc,
      endSoc: drive.endSoc,
      startLat: drive.startLat,
      startLon: drive.startLon,
      endLat: drive.endLat,
      endLon: drive.endLon,
    })),
  );

  if (!comparison.actual || !comparison.deltas) {
    return (
      <section className="mt-4 rounded-2xl border border-dashed border-violet-300 bg-violet-50/50 p-5 dark:border-violet-900 dark:bg-violet-950/20">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300">
            <CircleGauge aria-hidden size={20} />
          </span>
          <div>
            <h2 className="font-semibold">{t("detail.planActual.title")}</h2>
            <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">
              {t("detail.planActual.emptyTitle")}
            </p>
            <p className="mt-1 text-xs leading-5 text-neutral-500 dark:text-neutral-400">
              {t("detail.planActual.emptyHint")}
            </p>
          </div>
        </div>
      </section>
    );
  }

  const notes = buildChangeNotes(comparison, t);
  const { planned, actual, deltas } = comparison;

  return (
    <section className="mt-4 rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50/80 via-white to-cyan-50/60 p-4 sm:p-5 dark:border-violet-900/60 dark:from-violet-950/30 dark:via-neutral-950 dark:to-cyan-950/20">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <CircleGauge aria-hidden size={19} className="text-violet-600 dark:text-violet-300" />
            <h2 className="text-base font-semibold">
              {t("detail.planActual.title")}
            </h2>
          </div>
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            {t("detail.planActual.summary", {
              matched: comparison.matchedLegCount,
              total: comparison.legs.length,
              drives: comparison.actualDriveCount,
            })}
          </p>
        </div>
        {comparison.energyIsEstimated && (
          <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-semibold text-amber-700 dark:bg-amber-950 dark:text-amber-300">
            {t("detail.planActual.estimated")}
          </span>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Metric
          label={t("detail.planActual.metrics.distance")}
          actual={comparisonValue(actual.distanceKm, formatKm)}
          planned={comparisonValue(planned.distanceKm, formatKm)}
          delta={deltaValue(deltas.distanceKm, formatSignedKm)}
        />
        <Metric
          label={t("detail.planActual.metrics.duration")}
          actual={comparisonValue(actual.durationSeconds, formatDuration)}
          planned={comparisonValue(planned.durationSeconds, formatDuration)}
          delta={deltaValue(deltas.durationSeconds, formatSignedDuration)}
        />
        <Metric
          label={t("detail.planActual.metrics.consumption")}
          actual={comparisonValue(actual.whPerKm, (value) =>
            formatConsumption(value, comparison.energyIsEstimated),
          )}
          planned={comparisonValue(planned.whPerKm, (value) =>
            formatConsumption(value),
          )}
          delta={deltaValue(deltas.whPerKm, formatSignedConsumption)}
        />
        <Metric
          label={t("detail.planActual.metrics.arrivalSoc")}
          actual={comparisonValue(actual.arrivalSoc, formatSoc)}
          planned={comparisonValue(planned.arrivalSoc, formatSoc)}
          delta={deltaValue(deltas.arrivalSoc, formatSignedSoc)}
        />
      </div>

      <div className="mt-4 rounded-xl bg-neutral-950 p-4 text-white dark:bg-white dark:text-neutral-950">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-300 dark:text-violet-700">
          {t("detail.planActual.changes.title")}
        </p>
        <ul className="mt-2 grid gap-2 sm:grid-cols-3">
          {notes.map((note) => (
            <li key={note} className="flex items-start gap-2 text-sm leading-5">
              <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-300 dark:bg-violet-600" />
              <span>{note}</span>
            </li>
          ))}
        </ul>
      </div>

      {hasIncompleteCoverage(comparison) && (
        <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-amber-700 dark:text-amber-300">
          <TriangleAlert aria-hidden size={15} className="mt-0.5 shrink-0" />
          {t("detail.planActual.coverageHint")}
        </p>
      )}

      <h3 className="mt-5 text-sm font-semibold">
        {t("detail.planActual.legsTitle")}
      </h3>
      <ol className="mt-3 grid gap-3">
        {comparison.legs.map((leg) => (
          <li
            key={leg.index}
            className="rounded-xl border border-neutral-200 bg-white/85 p-3 dark:border-neutral-800 dark:bg-neutral-900/80"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-neutral-400">
                {String(leg.index + 1).padStart(2, "0")}
              </span>
              <p className="min-w-0 flex-1 truncate text-sm font-semibold">
                {leg.from.label} <span className="text-neutral-400">→</span>{" "}
                {leg.to.label}
              </p>
              {leg.matchConfidence && (
                <span
                  title={t("detail.planActual.confidence.hint")}
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${confidenceClasses(leg.matchConfidence)}`}
                >
                  {t(`detail.planActual.confidence.${leg.matchConfidence}`)}
                </span>
              )}
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <div className="rounded-lg bg-neutral-50 p-3 dark:bg-neutral-950">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-500 dark:text-neutral-400">
                  {t("detail.planActual.planned")}
                </p>
                <p className="mt-1 text-xs tabular-nums text-neutral-700 dark:text-neutral-300">
                  {formatKm(leg.planned.distanceKm ?? 0)} ·{" "}
                  {formatDuration(leg.planned.durationSeconds ?? 0)} ·{" "}
                  {formatSoc(leg.planned.arrivalSoc ?? 0)}
                </p>
              </div>
              <div className="rounded-lg bg-violet-50 p-3 dark:bg-violet-950/30">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-violet-600 dark:text-violet-300">
                  {t("detail.planActual.actual")}
                </p>
                {leg.actual ? (
                  <>
                    <p className="mt-1 text-xs tabular-nums text-neutral-700 dark:text-neutral-300">
                      {comparisonValue(leg.actual.distanceKm, formatKm)} ·{" "}
                      {comparisonValue(leg.actual.durationSeconds, formatDuration)} ·{" "}
                      {comparisonValue(leg.actual.arrivalSoc, formatSoc)}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {leg.actualDriveIds.map((id) => (
                        <Link
                          key={id}
                          href={`/drives/${id}`}
                          className="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-violet-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 dark:bg-neutral-900 dark:text-violet-300"
                        >
                          {t("detail.planActual.drive", { id })}
                        </Link>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                    {t("detail.planActual.noMatch")}
                  </p>
                )}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
