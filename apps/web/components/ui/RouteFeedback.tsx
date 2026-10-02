"use client";

import { useTranslations } from "next-intl";
import { Button } from "./Button";

/** Pending content has no fabricated freshness timestamp or cached metrics. */
export function RouteLoading() {
  const t = useTranslations("ui.feedback");
  return <section className="mx-auto max-w-2xl" aria-busy="true">
    <p role="status" className="mb-6 text-sm text-neutral-600 dark:text-neutral-300">{t("loading")}</p>
    <div aria-hidden className="card min-h-32 bg-neutral-100 dark:bg-neutral-900" />
    <div aria-hidden className="card mt-4 min-h-64 bg-neutral-100 dark:bg-neutral-900" />
  </section>;
}

export function RouteError({ reset }: { reset: () => void }) {
  const t = useTranslations("ui.feedback");
  return <section className="card mx-auto max-w-2xl p-6" role="alert">
    <h1>{t("failedTitle")}</h1>
    <p className="my-4 text-sm text-neutral-600 dark:text-neutral-300">{t("failedHint")}</p>
    <Button onClick={reset}>{t("retry")}</Button>
  </section>;
}
