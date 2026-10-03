"use client";
import { useOptimistic, useTransition } from "react";
import { useTranslations } from "next-intl";
import { setDriveClassification } from "../../../../lib/actions/drives";
import { useClassificationUndo } from "../../../../components/ClassificationUndo";
import {
  QUICK_ORDER,
  type Classification,
} from "../../../../lib/classification";

/**
 * Segmented control replacing the old 4 mini-buttons + separate badge.
 * This IS the state display for day-view drive cards now — no badge
 * alongside it. Drive detail page keeps its own header badge separately.
 */
export function QuickClassify({
  driveId,
  value,
}: {
  driveId: number;
  value: Classification;
}) {
  const [optimistic, setOptimistic] = useOptimistic(value);
  const { recordOperation, reportError } = useClassificationUndo();
  const tDrives = useTranslations("drives");
  const [pending, startTransition] = useTransition();
  const t = useTranslations("day");

  function choose(next: Classification) {
    if (next === optimistic) return;
    startTransition(async () => {
      setOptimistic(next);
      try {
        recordOperation(await setDriveClassification(driveId, next));
      } catch {
        reportError(tDrives("undo.saveFailed"));
      }
    });
  }

  return (
    <div
      role="group"
      aria-label={`${t("classifyGroupLabel")} — ${tDrives("undo.scope")}`}
      data-drive-classification={optimistic}
      className={`grid grid-cols-4 gap-0.5 rounded-lg border border-neutral-200 bg-neutral-100 p-0.5 transition dark:border-neutral-800 dark:bg-neutral-800/60 ${
        pending ? "opacity-60" : ""
      }`}
    >
      <span role="status" className="sr-only">{pending ? tDrives("annotationForm.saving") : null}</span>
      {QUICK_ORDER.map((c) => {
        const active = optimistic === c;
        return (
          <button
            key={c}
            type="button"
            disabled={pending}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              choose(c);
            }}
            aria-pressed={active}
            className={`flex min-h-10 items-center justify-center rounded-md px-1 text-center text-[11px] font-medium leading-tight transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-100 disabled:pointer-events-none dark:focus-visible:ring-white dark:focus-visible:ring-offset-neutral-800 sm:min-h-8 sm:text-xs ${
              active
                ? "bg-neutral-900 text-white shadow-sm dark:bg-white dark:text-neutral-900"
                : "text-neutral-600 hover:bg-white/70 dark:text-neutral-400 dark:hover:bg-neutral-700/60"
            }`}
          >
            {t(`classifyShort.${c}`)}
          </button>
        );
      })}
    </div>
  );
}
