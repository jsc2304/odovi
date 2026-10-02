"use client";
import { useActionState, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  updateDriveAnnotations,
  type UpdateAnnotationsResult,
} from "../../../../lib/actions/drives";
import { type Classification } from "../../../../lib/classification";
import { buttonClasses } from "../../../../components/ui/Button";

const CLASSIFICATION_OPTIONS: Classification[] = [
  "unclassified",
  "private",
  "business",
  "commute",
];

const initialState: UpdateAnnotationsResult = { ok: false };

const fieldClasses =
  "rounded-lg border border-neutral-300 bg-white px-3 py-2 text-base text-neutral-900 outline-none focus:border-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:focus:border-neutral-100";

export function AnnotationForm({
  driveId,
  classification,
  purpose,
  customer,
  project,
  notes,
}: {
  driveId: number;
  classification: Classification;
  purpose: string | null;
  customer: string | null;
  project: string | null;
  notes: string | null;
}) {
  const t = useTranslations("drives");
  const tCommon = useTranslations("common");
  const [state, formAction, pending] = useActionState(
    async (previous: UpdateAnnotationsResult, data: FormData) => {
      try { return await updateDriveAnnotations(previous, data); }
      catch { return { ok: false, error: t("annotationForm.saveFailed") }; }
    },
    initialState,
  );


  // Keep the stored baseline alongside the draft. Refresh clean fields after
  // quick undo/navigation, and preserve deliberate unsaved edits.
  const [model, setModel] = useState(() => {
    const initial = { classification: classification as string, purpose: purpose ?? "", customer: customer ?? "", project: project ?? "", notes: notes ?? "" };
    return { draft: initial, saved: initial };
  });
  const fields = model.draft;
  const dirty = (Object.keys(fields) as Array<keyof typeof fields>).some(name => fields[name].trim() !== model.saved[name]);
  function setField(name: keyof typeof fields, value: string) {
    setModel(previous => ({ ...previous, draft: { ...previous.draft, [name]: value } }));
  }
  useEffect(() => {
    const saved = { classification, purpose: purpose ?? "", customer: customer ?? "", project: project ?? "", notes: notes ?? "" };
    setModel(previous => ({ saved, draft: Object.fromEntries(Object.keys(saved).map(name => {
      const key = name as keyof typeof saved;
      return [key, previous.draft[key].trim() === previous.saved[key] ? saved[key] : previous.draft[key]];
    })) as typeof saved }));
  }, [classification, purpose, customer, project, notes]);
  useEffect(() => {
    if (state.ok && state.values) setModel({ saved: state.values, draft: state.values });
  }, [state]);
  useEffect(() => {
    if (!dirty) return;
    function beforeUnload(event: BeforeUnloadEvent) { event.preventDefault(); event.returnValue = ""; }
    function beforeLink(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest("a");
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download") || anchor.getAttribute("href")?.startsWith("#")) return;
      if (!window.confirm(t("annotationForm.unsaved"))) { event.preventDefault(); event.stopPropagation(); }
    }
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", beforeLink, true);
    return () => { window.removeEventListener("beforeunload", beforeUnload); document.removeEventListener("click", beforeLink, true); };
  }, [dirty, t]);

  return (
    <form action={formAction} data-unsaved={dirty ? "true" : undefined} data-unsaved-message={t("annotationForm.unsaved")} className="flex flex-col gap-4">
      <input type="hidden" name="driveId" value={driveId} />

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
          {t("annotationForm.classification")}
        </span>
        <select
          name="classification"
          disabled={pending}
          value={fields.classification}
          onChange={(e) => setField("classification", e.target.value)}
          className={fieldClasses}
        >
          {CLASSIFICATION_OPTIONS.map((c) => (
            <option key={c} value={c}>
              {tCommon(`classification.${c}`)}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
          {t("annotationForm.purpose")}
        </span>
        <input
          type="text"
          name="purpose"
          disabled={pending}
          value={fields.purpose}
          onChange={(e) => setField("purpose", e.target.value)}
          maxLength={500}
          className={fieldClasses}
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
          {t("annotationForm.customer")}
        </span>
        <input
          type="text"
          name="customer"
          disabled={pending}
          value={fields.customer}
          onChange={(e) => setField("customer", e.target.value)}
          maxLength={200}
          className={fieldClasses}
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
          {t("annotationForm.project")}
        </span>
        <input
          type="text"
          name="project"
          disabled={pending}
          value={fields.project}
          onChange={(e) => setField("project", e.target.value)}
          maxLength={200}
          className={fieldClasses}
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
          {t("annotationForm.notes")}
        </span>
        <textarea
          name="notes"
          disabled={pending}
          value={fields.notes}
          onChange={(e) => setField("notes", e.target.value)}
          rows={4}
          maxLength={5000}
          className={fieldClasses}
        />
      </label>

      {state.error && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300"
        >
          {state.error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending || !dirty} className={buttonClasses("primary", "md")}>
          {pending ? t("annotationForm.saving") : tCommon("actions.save")}
        </button>
        <button type="button" disabled={pending || !dirty} onClick={() => setModel(previous => ({ ...previous, draft: previous.saved }))} className={buttonClasses("secondary", "md")}>{t("annotationForm.discard")}</button>
        {state.ok && !dirty && (
          <span role="status" className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
            {t("annotationForm.saved")}
          </span>
        )}
      </div>
    </form>
  );
}
