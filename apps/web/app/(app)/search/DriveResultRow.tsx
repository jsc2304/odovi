"use client";
import { ArchiveDriveLink } from "../../../components/ArchiveDriveLink";
import { useTranslations } from "next-intl";
import { formatKm, formatPlaceLabel, formatTimeRange } from "@odovi/core";
import {
  CLASSIFICATION_BADGE,
  type Classification,
} from "../../../lib/classification";
import { TagChip } from "../../../components/TagChip";
import {
  SelectionCheckbox,
  useBulkSelection,
} from "../../../components/bulkSelection";
import type { SearchResultRow } from "../../../lib/search";
import { matchHint } from "./matchHint";

type DriveRow = Extract<SearchResultRow, { kind: "drive" }>;

/** Inner content of a drive search hit — shared by link and selection modes. */
function DriveResultBody({
  row,
  tz,
  q,
}: {
  row: DriveRow;
  tz: string;
  q: string;
}) {
  const t = useTranslations("search");
  const tc = useTranslations("common");
  const from = formatPlaceLabel(row.startPlaceName, row.startAddress, null, null);
  const to = formatPlaceLabel(row.endPlaceName, row.endAddress, null, null);
  const classification = row.classification as Classification;
  const hint = matchHint(q, [
    { label: t("matchFieldStartPlace"), value: row.startPlaceName ?? row.startAddress },
    { label: t("matchFieldEndPlace"), value: row.endPlaceName ?? row.endAddress },
    ...row.tags.map((tag) => ({ label: t("matchFieldTag"), value: tag.name })),
  ]);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="tabular-nums text-xs text-neutral-500 dark:text-neutral-400">
          {formatTimeRange(row.startTime, row.endTime, tz)}
        </span>
        <span
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${CLASSIFICATION_BADGE[classification]}`}
        >
          {tc(`classification.${classification}`)}
        </span>
      </div>

      <p className="mt-1 text-sm font-medium">
        {from} <span className="text-neutral-500 dark:text-neutral-400">→</span> {to}
      </p>

      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-neutral-500 dark:text-neutral-400">
        {row.distanceKm != null && (
          <span className="tabular-nums">{formatKm(row.distanceKm)}</span>
        )}
        {hint && (
          <>
            <span aria-hidden>·</span>
            <span>{t("matchLabel", { hint })}</span>
          </>
        )}
      </div>

      {row.tags.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {row.tags.map((tag) => (
            <TagChip key={tag.id} tag={tag} />
          ))}
        </div>
      )}
    </>
  );
}

export function DriveResultRow({
  row,
  tz,
  q,
}: {
  row: DriveRow;
  tz: string;
  q: string;
}) {
  const { selectionMode, isSelected, toggle } = useBulkSelection();
  const selected = isSelected(row.id);

  const cardClasses = `rounded-xl border bg-white shadow-sm dark:bg-neutral-900 ${
    selectionMode && selected
      ? "border-neutral-900 ring-1 ring-neutral-900 dark:border-white dark:ring-white"
      : "border-neutral-200 dark:border-neutral-800"
  }`;

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
            <DriveResultBody row={row} tz={tz} q={q} />
          </span>
        </button>
      </li>
    );
  }

  return (
    <li className={cardClasses}>
      <ArchiveDriveLink driveId={row.id} className="block px-4 py-3">
        <DriveResultBody row={row} tz={tz} q={q} />
      </ArchiveDriveLink>
    </li>
  );
}
