import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import { maybeSeedFromEnv, usersTableIsEmpty } from "../../lib/auth/actions";
import { validateSession } from "../../lib/auth/session";
import { BrandWordmark } from "../../components/BrandWordmark";
import { LocaleSwitcher, type Locale } from "../../components/LocaleSwitcher";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  // Already signed in? Skip the login page.
  if (await validateSession()) {
    redirect("/");
  }

  // Honour INITIAL_ADMIN_PASSWORD by seeding on first visit.
  await maybeSeedFromEnv();

  const bootstrap = await usersTableIsEmpty();
  const t = await getTranslations("auth");

  const cookieLocale = (await cookies()).get("tripatlas_locale")?.value;
  const locale: Locale = cookieLocale === "en" ? "en" : "de";

  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center gap-4 overflow-hidden bg-neutral-50 px-4 dark:bg-neutral-950">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-24 top-1/4 h-72 w-72 rounded-full bg-violet-300/30 blur-3xl dark:bg-violet-700/20"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-24 bottom-1/4 h-72 w-72 rounded-full bg-cyan-200/35 blur-3xl dark:bg-cyan-500/10"
      />
      <div className="relative w-full max-w-sm rounded-3xl border border-neutral-200 bg-white/85 p-8 shadow-[0_30px_80px_rgba(8,10,24,0.12)] backdrop-blur-xl dark:border-neutral-800 dark:bg-neutral-900/85 dark:shadow-[0_30px_80px_rgba(0,0,0,0.38)]">
        <div className="mb-6">
          <h1>
            <BrandWordmark size="lg" />
          </h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            {bootstrap ? t("setupSubtitle") : t("loginSubtitle")}
          </p>
        </div>
        <LoginForm bootstrap={bootstrap} />
      </div>
      <LocaleSwitcher initial={locale} variant="inline" />
    </main>
  );
}
