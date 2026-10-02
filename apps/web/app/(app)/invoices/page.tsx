import { getTranslations } from "next-intl/server";
import { validateSession } from "../../../lib/auth/session";
import { redirect } from "next/navigation";
import { listArchive } from "../../../lib/invoices/archive";
import { InvoiceArchive } from "./InvoiceArchive";

export const dynamic = "force-dynamic";
export default async function InvoicesPage() {
  if (!await validateSession()) redirect("/login");
  const t = await getTranslations("invoices");
  return <div className="mx-auto max-w-5xl space-y-6 px-4 py-6">
    <header><h1 className="text-2xl font-semibold">{t("title")}</h1><p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">{t("description")}</p></header>
    <InvoiceArchive initial={await listArchive()} />
  </div>;
}
