"use client";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, Loader2, X } from "lucide-react";
import { bulkSetDriveClassification, bulkUpdateDrives } from "../lib/actions/drives";
import { useClassificationUndo } from "./ClassificationUndo";
import { buttonClasses } from "./ui/Button";
import type { Classification } from "../lib/classification";
import type { TagLite } from "../lib/queries";

/** Fields the bar can apply — mirrors bulkUpdateDrives' optional inputs. */
interface BulkPatch {
  classification?: Classification;
  addTagId?: number;
  customer?: string;
  project?: string;
}

const CLASS_OPTIONS: Classification[] = ["private", "business", "commute"];

/**
 * Sticky bottom action bar shown while drives are selected. Each control
 * applies immediately to the current selection via bulkUpdateDrives; on
 * success the parent resets the selection and shows a toast. Positioned above
 * the mobile BottomNav (bottom-16) and lower on desktop (md:bottom-4).
 */
export function BulkActionBar({
  selectedIds,
  tags,
  onCancel,
  onApplied,
}: {
  selectedIds: number[];
  tags: TagLite[];
  onCancel: () => void;
  onApplied: (count: number) => void;
}) {
  const count = selectedIds.length;
  const { recordOperation, reportError } = useClassificationUndo();
  const tDrives = useTranslations("drives");
  const t = useTranslations("bulk");
  const tCommon = useTranslations("common");
  const [pending, startTransition] = useTransition();
  const [showMore, setShowMore] = useState(false);
  const [customer, setCustomer] = useState("");
  const [project, setProject] = useState("");
  const [error, setError] = useState<string | null>(null);

  function apply(patch: BulkPatch) {
    setError(null);
    startTransition(async () => {
      try {
        const operation = patch.classification ? await bulkSetDriveClassification(selectedIds, patch.classification) : null;
        const n = patch.classification ? operation?.count ?? 0 : await bulkUpdateDrives({ driveIds: selectedIds, ...patch });
        if (operation) recordOperation(operation);
        setCustomer("");
        setProject("");
        onApplied(n);
      } catch {
        setError(t("applyError"));
        reportError(t("applyError"));
      }
    });
  }

  const inputClasses =
    "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-base text-neutral-900 shadow-sm focus:border-neutral-500 focus:outline-none disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100";

  const canApplyText = customer.trim() !== "" || project.trim() !== "";

  return (
    <div className="fixed inset-x-0 bottom-16 z-20 px-4 md:bottom-4 md:left-56">
      <div
        aria-busy={pending}
        className={`mx-auto max-w-2xl rounded-2xl border border-neutral-200 bg-white/95 p-3 shadow-xl backdrop-blur transition dark:border-neutral-700 dark:bg-neutral-900/95 ${
          pending ? "opacity-70" : ""
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <span role="status" className="flex items-center gap-2 text-sm font-medium text-neutral-800 dark:text-neutral-200">
            {pending && <Loader2 aria-hidden size={15} className="animate-spin" />}
            {pending ? tCommon("state.loading") : t("selectedCount", { count })}
          </span>
          <button
            type="button"
            onClick={onCancel}
            className={buttonClasses("ghost", "sm")}
          >
            <X aria-hidden size={14} />
            {tCommon("actions.cancel")}
          </button>
        </div>

        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">{tDrives("undo.bulkScope", { count })}</p>

        {/* Klassifizierung — Segmented-Control, wendet sofort an */}
        <div
          role="group"
          aria-label={t("applyClassificationLabel")}
          className="mt-2 grid grid-cols-3 gap-1 rounded-lg border border-neutral-200 bg-neutral-100 p-0.5 dark:border-neutral-700 dark:bg-neutral-800/60"
        >
          {CLASS_OPTIONS.map((c) => (
            <button
              key={c}
              type="button"
              disabled={pending}
              onClick={() => apply({ classification: c })}
              className="flex min-h-11 items-center justify-center rounded-md px-1 text-center text-xs font-medium leading-tight text-neutral-700 transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 disabled:pointer-events-none dark:text-neutral-300 dark:hover:bg-neutral-700 dark:focus-visible:ring-white sm:text-sm"
            >
              {tCommon(`classification.${c}`)}
            </button>
          ))}
        </div>

        {/* Tag + Mehr */}
        <div className="mt-2 flex items-center gap-2">
          <label className="sr-only" htmlFor="bulk-tag">
            {t("addTag")}
          </label>
          <select
            id="bulk-tag"
            defaultValue=""
            disabled={pending || tags.length === 0}
            onChange={(e) => {
              const v = e.target.value;
              e.currentTarget.value = "";
              if (v) apply({ addTagId: Number(v) });
            }}
            className={`${inputClasses} flex-1`}
          >
            <option value="" disabled>
              {tags.length === 0 ? t("noTags") : t("addTagPlaceholder")}
            </option>
            {tags.map((tag) => (
              <option key={tag.id} value={tag.id}>
                {tag.name}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => setShowMore((v) => !v)}
            aria-expanded={showMore}
            className={buttonClasses("secondary", "md")}
          >
            {t("more")}
            <ChevronDown
              aria-hidden
              size={15}
              className={`transition ${showMore ? "rotate-180" : ""}`}
            />
          </button>
        </div>

        {showMore && (
          <div className="mt-2 flex flex-col gap-2">
            <input
              type="text"
              value={customer}
              onChange={(e) => setCustomer(e.target.value)}
              placeholder={t("customer")}
              aria-label={t("customer")}
              disabled={pending}
              className={inputClasses}
            />
            <input
              type="text"
              value={project}
              onChange={(e) => setProject(e.target.value)}
              placeholder={t("project")}
              aria-label={t("project")}
              disabled={pending}
              className={inputClasses}
            />
            <button
              type="button"
              disabled={pending || !canApplyText}
              onClick={() =>
                apply({
                  customer: customer.trim() || undefined,
                  project: project.trim() || undefined,
                })
              }
              className={buttonClasses("primary", "md")}
            >
              {t("apply")}
            </button>
          </div>
        )}

        {error && (
          <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>
        )}
      </div>
    </div>
  );
}
