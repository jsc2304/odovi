"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight, CalendarDays, Check, CircleHelp, Undo2 } from "lucide-react";
import type { DrivingProfile } from "@odovi/core";
import { classifyOpenDrives, undoOpenDrives } from "../../lib/actions/drivingProfile";
import { Button } from "../../components/ui/Button";

export function ClassificationTask({ vehicleId, count, imported, profile }: {
  vehicleId: number; count: number; imported: number; profile: DrivingProfile | null;
}) {
  const t = useTranslations("dashboard");
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ message: string; error?: boolean; batchId?: number } | null>(null);
  const usage = profile?.usage;
  const canUseDefault = usage === "private" || usage === "business";
  return <section className="overview-task-wrap" aria-label={t("stats.unclassified")}>
    <div className="overview-task">
      <div className="flex items-center gap-3.5">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${count > 0 ? "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300" : "bg-accent-100 text-accent-700 dark:bg-accent-950 dark:text-accent-300"}`}>
          {count > 0 ? <CircleHelp aria-hidden size={24} strokeWidth={1.5} /> : <Check aria-hidden size={24} />}
        </span>
        <div>
          <p className="text-base font-medium tracking-tight md:text-lg">{count > 0 ? t("overview.openDrives", { count }) : t("stats.allDone")}</p>
          {imported > 0 && <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">{t("drivingProfile.imported", { count: imported })}</p>}
          {profile && <a href="/settings#driving-profiles" className="mt-1 inline-flex min-h-6 items-center text-xs text-neutral-600 underline underline-offset-4 dark:text-neutral-400">{t(`drivingProfile.active.${profile.usage}`)}</a>}
        </div>
      </div>
      <div className="flex flex-wrap gap-2.5">
        {count > 0 && <Button href="/search?classification=unclassified" variant="primary">{t("overview.classifyNow")}<ArrowRight aria-hidden size={17} /></Button>}
        {count > 0 && canUseDefault && <Button type="button" disabled={pending} onClick={() => {
          startTransition(async () => {
            try {
              const result = await classifyOpenDrives(vehicleId, usage);
              setFeedback({ message: t("drivingProfile.applied", { count: result.count }), batchId: result.batchId ?? undefined });
            } catch {
              setFeedback({ message: t("drivingProfile.applyFailed"), error: true });
            }
          });
        }}>{t(`drivingProfile.apply.${usage}`)}</Button>}
        <div className={count > 0 ? "hidden md:block" : undefined}>
          <Button href="/day" variant="ghost" icon={<CalendarDays aria-hidden size={17} />}>{t("overview.openDay")}</Button>
        </div>
      </div>
    </div>
    {feedback && <div className="mt-2 flex flex-wrap items-center gap-x-3 px-1 text-sm">
      <p role={feedback.error ? "alert" : "status"} className={feedback.error ? "text-red-700 dark:text-red-300" : "text-accent-700 dark:text-accent-300"}>{feedback.message}</p>
      {feedback.batchId && <Button type="button" variant="ghost" disabled={pending} icon={<Undo2 aria-hidden size={16} />} onClick={() => {
        startTransition(async () => {
          try {
            const result = await undoOpenDrives(feedback.batchId!);
            setFeedback({ message: t(result.skipped ? "drivingProfile.undonePartial" : "drivingProfile.undone", result) });
          } catch {
            setFeedback({ message: t("drivingProfile.undoUnavailable"), error: true });
          }
        });
      }}>{t("overview.undo")}</Button>}
    </div>}
  </section>;
}
