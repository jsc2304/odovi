"use client";
import { ArchiveDriveLink } from "../../../../components/ArchiveDriveLink";
import { useLocale, useTranslations } from "next-intl";
import {
  formatConsumption,
  formatDuration,
  formatKm,
  formatPlaceLabel,
  formatTime,
  formatTimeRange,
} from "@odovi/core";
import type { DriveRow } from "../../../../lib/queries";
import type { Classification } from "../../../../lib/classification";
import { TagChip } from "../../../../components/TagChip";
import {
  SelectionCheckbox,
  useBulkSelection,
} from "../../../../components/bulkSelection";
import { QuickClassify } from "./QuickClassify";

function isActive(start: Date, end: Date | null, now: number): boolean {
  return start.getTime() <= now && (end === null || end.getTime() > now);
}

/** Inner card content (time, route, metrics, tags) — shared by both modes. */
function DriveBody({ row, tz }: { row: DriveRow; tz: string }) {
  const t = useTranslations("day");
  const locale = useLocale();
  const from = formatPlaceLabel(
    row.startPlaceName,
    row.startAddress,
    row.startLat,
    row.startLon, locale,
  );
  const to = formatPlaceLabel(
    row.endPlaceName,
    row.endAddress,
    row.endLat,
    row.endLon, locale,
  );
  const inProgress = row.endTime === null;

  const meta: Array<{ text: string; title?: string }> = [];
  if (row.distanceKm != null) meta.push({ text: formatKm(row.distanceKm, locale) });
  if (row.durationSeconds != null)
    meta.push({ text: formatDuration(row.durationSeconds) });
  if (row.avgConsumptionWhKm != null) {
    meta.push({
      text: formatConsumption(row.avgConsumptionWhKm, row.energyIsEstimated),
      title: row.energyIsEstimated ? t("estimatedValueTitle") : undefined,
    });
  }

  return (
    <>
      <span className="tabular-nums text-sm text-neutral-500 dark:text-neutral-400">
        {inProgress
          ? t("sinceTime", { time: formatTime(row.startTime, tz) })
          : formatTimeRange(row.startTime, row.endTime, tz, locale)}
      </span>

      <p className="mt-1.5 text-base font-medium">
        {from} <span className="text-neutral-500 dark:text-neutral-400">→</span> {to}
      </p>

      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-neutral-500 dark:text-neutral-400">
        {inProgress && (
          <span className="flex items-center gap-1.5 font-medium text-neutral-900 dark:text-white">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
            {t("driveInProgress")}
          </span>
        )}
        {meta.map((m, i) => (
          <span key={i} className="flex items-center gap-2">
            {(i > 0 || inProgress) && <span aria-hidden>·</span>}
            <span className="tabular-nums" title={m.title}>
              {m.text}
            </span>
          </span>
        ))}
      </div>

      {row.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {row.tags.map((tag) => (
            <TagChip key={tag.id} tag={tag} />
          ))}
        </div>
      )}
    </>
  );
}

export function DriveEntry({
  row,
  tz,
  now,
}: {
  row: DriveRow;
  tz: string;
  now: number;
}) {
  const { selectionMode, isSelected, toggle } = useBulkSelection();
  const active = isActive(row.startTime, row.endTime, now);
  const selected = isSelected(row.id);

  const cardClasses = `rounded-xl border bg-white shadow-sm transition dark:bg-neutral-900 ${
    selectionMode && selected
      ? "border-neutral-900 ring-1 ring-neutral-900 dark:border-white dark:ring-white"
      : active
        ? "border-neutral-900 ring-1 ring-neutral-900 dark:border-white dark:ring-white"
        : "border-neutral-200 dark:border-neutral-800"
  }`;

  // Selection mode: the whole card toggles selection; no navigation, no
  // inline classify control (the bulk bar handles classification instead).
  if (selectionMode) {
    return (
      <li className={cardClasses}>
        <button
          type="button"
          role="checkbox"
          aria-checked={selected}
          onClick={() => toggle(row.id)}
          className="flex min-h-11 w-full items-start gap-3 px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-neutral-900 dark:focus-visible:ring-white"
        >
          <span className="pt-0.5">
            <SelectionCheckbox checked={selected} />
          </span>
          <span className="min-w-0 flex-1">
            <DriveBody row={row} tz={tz} />
          </span>
        </button>
      </li>
    );
  }

  const classification = row.classification as Classification;

  return (
    <li className={cardClasses}>
      <ArchiveDriveLink driveId={row.id} className="block px-4 pt-3">
        <DriveBody row={row} tz={tz} />
      </ArchiveDriveLink>

      <div className="px-4 pb-3 pt-2">
        <QuickClassify driveId={row.id} value={classification} />
      </div>
    </li>
  );
}
