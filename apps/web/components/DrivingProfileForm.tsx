"use client";

import { useId, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { DRIVING_USAGES, type DrivingProfile, type DrivingUsage } from "@odovi/core";
import { saveDrivingProfile } from "../lib/actions/drivingProfile";
import { Button } from "./ui/Button";

export function DrivingProfileForm({ vehicleId, profile }: { vehicleId: number; profile: DrivingProfile | null }) {
  const t = useTranslations("dashboard.drivingProfile");
  const id = useId();
  const [usage, setUsage] = useState<DrivingUsage | null>(profile?.usage ?? null);
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ error: boolean; message: string } | null>(null);
  return <form className="driving-profile-form" onSubmit={event => {
    event.preventDefault();
    if (!usage) return;
    startTransition(async () => {
      try {
        await saveDrivingProfile(vehicleId, usage);
        setFeedback({ error: false, message: t("saved") });
      } catch {
        setFeedback({ error: true, message: t("saveFailed") });
      }
    });
  }}>
    <fieldset disabled={pending} aria-describedby={`${id}-hint`}>
      <legend className="text-sm font-semibold">{t("question")}</legend>
      <p id={`${id}-hint`} className="mt-1.5 text-sm text-neutral-600 dark:text-neutral-400">{t("hint")}</p>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1">
        {DRIVING_USAGES.map(option => <label key={option} className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
          <input type="radio" name={id} value={option} checked={usage === option} onChange={() => { setUsage(option); setFeedback(null); }}
            className="h-4 w-4 accent-accent-700 dark:accent-accent-300" />
          {t(`usage.${option}`)}
        </label>)}
      </div>
    </fieldset>
    <div className="mt-2 flex flex-wrap items-center gap-3">
      <Button type="submit" variant="primary" disabled={pending || !usage || usage === profile?.usage}>{pending ? t("saving") : t("save")}</Button>
      <p className="text-xs text-neutral-600 dark:text-neutral-400">{t("editable")}</p>
    </div>
    {feedback && <p role={feedback.error ? "alert" : "status"} className={`mt-3 text-sm ${feedback.error ? "text-red-700 dark:text-red-300" : "text-accent-700 dark:text-accent-300"}`}>{feedback.message}</p>}
  </form>;
}
