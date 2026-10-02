"use client";

import { useTranslations } from "next-intl";
import { Button } from "./Button";

/** Pending content has no fabricated freshness timestamp or cached metrics. */
export function RouteLoading({ label }: { label?: string }) {
  const t = useTranslations("ui.feedback");
  return <section className="card min-h-32 p-5" aria-busy="true">
    <p role="status" className="text-sm text-neutral-600 dark:text-neutral-300">{label ?? t("loading")}</p>
  </section>;
}

export function RouteRefresh({ pending }: { pending: boolean }) {
  const t = useTranslations("ui.feedback");
  return pending ? <p role="status" className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">{t("refreshing")}</p> : null;
}

export function RouteError({ reset }: { reset: () => void }) {
  const t = useTranslations("ui.feedback");
  return <section className="card mx-auto max-w-2xl p-6" role="alert">
    <h1>{t("failedTitle")}</h1>
    <p className="my-4 text-sm text-neutral-600 dark:text-neutral-300">{t("failedHint")}</p>
    <Button onClick={reset}>{t("retry")}</Button>
  </section>;
}
