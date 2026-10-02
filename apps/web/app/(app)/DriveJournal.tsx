"use client";

import Link from "next/link";
import { useOptimistic, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight, Check, ChevronDown, ChevronRight, MapPin, X } from "lucide-react";
import { setDriveClassification } from "../../lib/actions/drives";
import { useClassificationUndo } from "../../components/ClassificationUndo";
import { CLASSIFICATION_BADGE, QUICK_ORDER, type Classification } from "../../lib/classification";

export interface JournalDrive {
  id: number;
  date: string;
  time: string;
  from: string;
  to: string;
  distance: string;
  duration: string;
  consumption: string | null;
  classification: Classification;
}

export function DriveJournal({ drives }: { drives: JournalDrive[] }) {
  const t = useTranslations("dashboard.overview");
  const common = useTranslations("common");
  const { recordOperation, reportError } = useClassificationUndo();
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ message: string; error?: boolean } | null>(null);
  const [rows, updateRow] = useOptimistic(drives, (current, update: { id: number; classification: Classification }) =>
    current.map((row) => row.id === update.id ? { ...row, classification: update.classification } : row));

  // The transition owns pending/optimistic state; a failed action restores server data.
  // https://react.dev/reference/react/useTransition#perform-non-blocking-updates-with-actions
  function classify(row: JournalDrive, classification: Classification) {
    startTransition(async () => {
      updateRow({ id: row.id, classification });
      try {
        const change = await setDriveClassification(row.id, classification);
        recordOperation(change);
        setFeedback({ message: t("saved") });
      } catch {
        reportError(t("saveFailed"));
        setFeedback({ message: t("saveFailed"), error: true });
      }
    });
  }

  return (
    <>
      <p className="mb-2 text-sm text-neutral-600 dark:text-neutral-400">{common("classification.saveImmediately")}</p>
      <table className="drive-journal" aria-busy={pending}>
        <thead><tr>
          <th scope="col">{t("time")}</th><th scope="col">{t("route")}</th>
          <th scope="col">{t("distance")}</th><th scope="col">{t("duration")}</th>
          <th scope="col">{t("classification")}</th><th scope="col"><span className="sr-only">{t("details")}</span></th>
        </tr></thead>
        <tbody>{rows.map((row) => <tr key={row.id}>
          <td className="journal-time"><span>{row.date}</span><span>{row.time}</span></td>
          <td className="journal-route">
            <Link href={`/drives/${row.id}`} className="journal-route-link">
              <MapPin aria-hidden size={16} className="shrink-0 text-accent-700 dark:text-accent-300" />
              <span>{row.from}<ArrowRight aria-hidden size={14} className="mx-2 inline-block text-neutral-500" />{row.to}</span>
            </Link>
            {row.consumption && <span className="journal-consumption">{row.consumption}</span>}
          </td>
          <td className="journal-distance">{row.distance}</td><td className="journal-duration">{row.duration}</td>
          <td className="journal-classification">
            <div className={`relative inline-flex rounded-full ${CLASSIFICATION_BADGE[row.classification]}`}>
              <select aria-label={t("classifyRoute", { from: row.from, to: row.to })} value={row.classification}
                disabled={pending} onChange={(event) => classify(row, event.target.value as Classification)}
                className="min-h-11 md:min-h-10 max-w-full appearance-none rounded-full bg-transparent py-1 pl-3 pr-8 text-xs font-medium disabled:opacity-60">
                {QUICK_ORDER.map((classification) => <option key={classification} value={classification}>{common(`classification.${classification}`)}</option>)}
              </select>
              <ChevronDown aria-hidden size={13} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2" />
            </div>
          </td>
          <td className="journal-detail"><Link href={`/drives/${row.id}`} aria-label={t("openRoute", { from: row.from, to: row.to })} className="inline-flex h-11 w-8 items-center justify-center rounded-md text-neutral-500 hover:text-accent-700 dark:text-neutral-400"><ChevronRight aria-hidden size={17} /></Link></td>
        </tr>)}</tbody>
      </table>
      <div className="sr-only" aria-live="polite" aria-atomic="true">{pending ? common("state.loading") : feedback?.message}</div>
      {feedback && <div className={`journal-feedback ${feedback.error ? "journal-feedback-error" : ""}`}>
        {!feedback.error && <Check aria-hidden size={18} />}
        <p>{feedback.message}</p>
        <button type="button" disabled={pending} aria-label={common("actions.close")} onClick={() => setFeedback(null)} className="inline-flex h-11 w-9 shrink-0 items-center justify-center rounded-md"><X aria-hidden size={16} /></button>
      </div>}
    </>
  );
}
