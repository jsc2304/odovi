import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getLocale, getTranslations } from "next-intl/server";
import { validateSession } from "../../lib/auth/session";
import { getVehicles } from "../../lib/queries";
import { BottomNav, HeaderSearch, SideNav } from "../../components/Nav";
import { ThemeToggle, type ThemeChoice } from "../../components/ThemeToggle";
import { LocaleSwitcher } from "../../components/LocaleSwitcher";
import { BrandWordmark } from "../../components/BrandWordmark";
import { getProviderReviewSnapshot } from "../../lib/locationProviders/policy";
import { ProviderReviewNotice } from "./ProviderReviewNotice";
import { LocationProviderClientConfigProvider } from "../../components/LocationProviderClientConfig";
import { DEFAULT_LOCALE, isLocale } from "../../lib/locale";

import { getLatestClassificationOperation } from "../../lib/actions/drives";
import { ClassificationUndoNotice, ClassificationUndoProvider } from "../../components/ClassificationUndo";

export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await validateSession();
  if (!user) redirect("/login");

  const [vehicles, providerReview, classificationOperation] = await Promise.all([
    getVehicles(),
    getProviderReviewSnapshot(),
    getLatestClassificationOperation(),
  ]);
  const vehicleName = vehicles[0]?.displayName ?? "—";

  const [cookieStore, requestLocale, t] = await Promise.all([cookies(), getLocale(), getTranslations("ui")]);
  const locale = isLocale(requestLocale) ? requestLocale : DEFAULT_LOCALE;
  const cookieTheme =
    cookieStore.get("odovi_theme")?.value ??
    cookieStore.get("tripatlas_theme")?.value;
  const theme: ThemeChoice =
    cookieTheme === "light" || cookieTheme === "dark" ? cookieTheme : "system";
  return (
    <ClassificationUndoProvider initial={classificationOperation}>
    <LocationProviderClientConfigProvider config={providerReview.clientConfig}>
      <a href="#main-content" className="skip-link">{t("skipToContent")}</a>
      <div className="min-h-dvh bg-neutral-50 text-neutral-900 md:flex dark:bg-neutral-950 dark:text-neutral-100">
        {/* Sidebar on md+ */}
        <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col border-r border-neutral-200 bg-neutral-50 md:flex dark:border-neutral-800 dark:bg-neutral-950">
          <div className="flex h-[126px] shrink-0 items-center px-7 py-7">
            <Link href="/" aria-label="Odovi start">
              <BrandWordmark size="md" />
            </Link>
          </div>
          <SideNav />
          <div className="shrink-0 border-t border-neutral-200 p-5 dark:border-neutral-800">
            <div className="flex flex-col gap-2">
              <ThemeToggle initial={theme} variant="segmented" />
              <LocaleSwitcher initial={locale} variant="segmented" />
            </div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          {/* Mobile header */}
          <header className="flex items-center gap-2 border-b border-neutral-200 bg-neutral-50/95 px-4 py-3 backdrop-blur-xl md:hidden dark:border-neutral-800 dark:bg-neutral-950">
            <Link href="/" aria-label="Odovi start" className="shrink-0">
              <BrandWordmark size="sm" />
            </Link>
            <HeaderSearch />
            <div className="flex min-w-0 flex-1 items-center justify-end gap-1 sm:gap-3">
              <p title={vehicleName} className="hidden min-w-0 truncate text-sm text-neutral-500 min-[360px]:block dark:text-neutral-400">
                {vehicleName}
              </p>
              <div className="flex shrink-0 items-center gap-1 sm:gap-3">
                <LocaleSwitcher initial={locale} variant="compact" />
                <ThemeToggle initial={theme} variant="compact" />
              </div>
            </div>
          </header>

          <main id="main-content" tabIndex={-1} className="app-main min-w-0 flex-1 px-5 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-6 md:px-9 md:pb-9 md:pt-9">
            {providerReview.requiresReview && <ProviderReviewNotice />}
            <ClassificationUndoNotice />
            {children}
          </main>
        </div>

        <BottomNav />
      </div>
    </LocationProviderClientConfigProvider>
    </ClassificationUndoProvider>
  );
}
