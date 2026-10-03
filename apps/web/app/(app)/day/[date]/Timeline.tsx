import { getLocale, getTranslations } from "next-intl/server";
import { Zap } from "lucide-react";
import {
  formatDuration,
  formatKwh,
  formatPlaceLabel,
  formatSoc,
  formatTimeRange,
} from "@odovi/core";
import type {
  ChargeRow,
  DayTimeline,
  DriveRow,
  ParkRow,
} from "../../../../lib/queries";
import type { ParkLoss } from "../../../../lib/parkAnalytics";
import { DriveEntry } from "./DriveEntry";

type Item =
  | { kind: "park"; start: number; row: ParkRow }
  | { kind: "drive"; start: number; row: DriveRow }
  | { kind: "charge"; start: number; row: ChargeRow };

export async function Timeline({
  timeline,
  tz,
  now,
  parkLossById,
}: {
  timeline: DayTimeline;
  tz: string;
  now: number;
  parkLossById?: Map<number, ParkLoss>;
}) {
  const [t, locale] = await Promise.all([getTranslations("day"), getLocale()]);
  const items: Item[] = [
    ...timeline.parks.map((row) => ({
      kind: "park" as const,
      start: row.startTime.getTime(),
      row,
    })),
    ...timeline.drives.map((row) => ({
      kind: "drive" as const,
      start: row.startTime.getTime(),
      row,
    })),
    ...timeline.charges.map((row) => ({
      kind: "charge" as const,
      start: row.startTime.getTime(),
      row,
    })),
  ].sort((a, b) => a.start - b.start);

  return (
    <ol className="flex flex-col gap-3">
      {items.map((item) => {
        if (item.kind === "park") {
          return (
            <ParkEntry
              key={`p${item.row.id}`}
              row={item.row}
              tz={tz}
              loss={parkLossById?.get(item.row.id) ?? null}
              t={t}
              locale={locale}
            />
          );
        }
        if (item.kind === "charge") {
          return (
            <ChargeEntry key={`c${item.row.id}`} row={item.row} tz={tz} t={t} locale={locale} />
          );
        }
        return (
          <DriveEntry
            key={`d${item.row.id}`}
            row={item.row}
            tz={tz}
            now={now}
          />
        );
      })}
    </ol>
  );
}

type DayT = Awaited<ReturnType<typeof getTranslations>>;

function ParkEntry({
  row,
  tz,
  loss,
  t,
  locale,
}: {
  row: ParkRow;
  tz: string;
  loss: ParkLoss | null;
  t: DayT;
  locale: string;
}) {
  const label = formatPlaceLabel(row.placeName, row.address, row.lat, row.lon, locale);
  const dur =
    row.endTime != null
      ? formatDuration((row.endTime.getTime() - row.startTime.getTime()) / 1000)
      : null;

  // Offener Park (endTime null): kein Vampir-Marker, egal was die Query liefert.
  const showLoss =
    row.endTime != null && loss != null && loss.lossPct != null && loss.lossPct >= 1;
  const showCharged = row.endTime != null && loss != null && loss.hadCharge;

  return (
    <li className="flex flex-wrap items-center gap-2 px-1 text-sm text-neutral-500 dark:text-neutral-400">
      <span className="tabular-nums">
        {formatTimeRange(row.startTime, row.endTime, tz, locale)}
      </span>
      <span aria-hidden>·</span>
      <span>{t("parkedAt", { place: label })}</span>
      {dur && (
        <>
          <span aria-hidden>·</span>
          <span>{dur}</span>
        </>
      )}
      {showLoss && (
        <>
          <span aria-hidden>·</span>
          <span className="tabular-nums text-red-400/80 dark:text-red-400/70">
            −{Math.round(loss!.lossPct!)} % SoC
          </span>
        </>
      )}
      {showCharged && (
        <>
          <span aria-hidden>·</span>
          <span>{t("chargedShort")}</span>
        </>
      )}
    </li>
  );
}

function ChargeEntry({ row, tz, t, locale }: { row: ChargeRow; tz: string; t: DayT; locale: string }) {
  const label = formatPlaceLabel(row.placeName, row.address, row.lat, row.lon, locale);
  const parts: string[] = [];
  if (row.energyAddedKwh != null) {
    parts.push(formatKwh(row.energyAddedKwh, { sign: true }, locale));
  }
  if (row.startSoc != null && row.endSoc != null) {
    parts.push(`${formatSoc(row.startSoc)} → ${formatSoc(row.endSoc)}`);
  }
  if (row.chargerType && row.maxPowerKw != null) {
    parts.push(
      `${row.chargerType.toUpperCase()} ${Math.round(row.maxPowerKw)} kW`,
    );
  }

  return (
    <li className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm dark:border-emerald-900 dark:bg-emerald-950/40">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-emerald-800 dark:text-emerald-300">
        <Zap aria-hidden size={16} className="shrink-0" />
        <span className="tabular-nums">
          {formatTimeRange(row.startTime, row.endTime, tz, locale)}
        </span>
        <span aria-hidden>·</span>
        <span className="font-medium">{t("chargedAt", { place: label })}</span>
        {parts.map((p, i) => (
          <span key={i} className="flex items-center gap-2">
            <span aria-hidden>·</span>
            <span>{p}</span>
          </span>
        ))}
      </div>
    </li>
  );
}
