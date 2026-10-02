import { getTranslations } from "next-intl/server";
import type { AuditLogRow } from "../../../../lib/queries";
import { APP_TIMEZONE } from "../../../../lib/config";
import { CLASSIFICATION_LABELS, type Classification } from "../../../../lib/classification";

const dateTimeFormatter = new Intl.DateTimeFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: APP_TIMEZONE,
});

function formatChangedAt(date: Date): string {
  return dateTimeFormatter.format(date).replace(",", "");
}

function valueLabel(
  field: string,
  value: string | null,
  tCommon: (key: string) => string,
): string {
  if (value === null || value === "") return "—";
  if (field === "classification" && value in CLASSIFICATION_LABELS) {
    return tCommon(`classification.${value as Classification}`).toLowerCase();
  }
  return value;
}

/** Verlauf card body: audit_log rows for a drive, newest first. */
export async function AuditLogList({ entries }: { entries: AuditLogRow[] }) {
  const t = await getTranslations("drives");
  const tCommon = await getTranslations("common");

  if (entries.length === 0) {
    return (
      <p className="text-sm text-neutral-500 dark:text-neutral-400">
        {t("auditLog.noChanges")}
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-1.5 text-sm">
      {entries.map((entry) => (
        <li
          key={entry.id}
          className="flex flex-wrap items-baseline gap-x-1.5 text-neutral-600 dark:text-neutral-400"
        >
          <span className="tabular-nums text-neutral-500 dark:text-neutral-400">
            {formatChangedAt(entry.changedAt)}
          </span>
          <span aria-hidden>·</span>
          <span className="font-medium text-neutral-700 dark:text-neutral-300">
            {entry.field}
          </span>
          <span>:</span>
          <span>{valueLabel(entry.field, entry.oldValue, tCommon)}</span>
          <span aria-hidden>→</span>
          <span className="font-medium text-neutral-900 dark:text-neutral-100">
            {valueLabel(entry.field, entry.newValue, tCommon)}
          </span>
        </li>
      ))}
    </ul>
  );
}
