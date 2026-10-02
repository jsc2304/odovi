import Link from "next/link";
import { getTranslations } from "next-intl/server";

export async function ProviderReviewNotice() {
  const t = await getTranslations("settings.providerReview");
  return (
    <aside
      data-testid="provider-disabled"
      className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 [overflow-wrap:anywhere] dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"
    >
      <p className="font-medium">{t("notice.title")}</p>
      <p className="mt-1">{t("notice.description")}</p>
      <Link className="mt-2 inline-block font-medium underline underline-offset-2" href="/settings#provider-review">
        {t("notice.action")}
      </Link>
    </aside>
  );
}
