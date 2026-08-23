import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import {
  APP_DESTINATIONS,
  type MoreGroup,
} from "../../../components/navigation";

const GROUPS: MoreGroup[] = ["plan", "review", "configure"];

export async function MoreHub() {
  const t = await getTranslations("settings");

  return (
    <section className="mt-6" aria-labelledby="more-hub-title">
      <div>
        <h2 id="more-hub-title" className="text-lg font-semibold tracking-tight">
          {t("quickLinks.title")}
        </h2>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          {t("quickLinks.subtitle")}
        </p>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        {GROUPS.map((group) => {
          const destinations = APP_DESTINATIONS.filter(
            (destination) => destination.moreGroup === group,
          );
          return (
            <section
              key={group}
              aria-labelledby={`more-group-${group}`}
              className="rounded-2xl border border-neutral-200 bg-white p-2 dark:border-neutral-800 dark:bg-neutral-900"
            >
              <h3
                id={`more-group-${group}`}
                className="px-3 pb-2 pt-2 text-xs font-semibold uppercase tracking-[0.14em] text-neutral-500 dark:text-neutral-400"
              >
                {t(`quickLinks.groups.${group}`)}
              </h3>
              <ul className="flex flex-col gap-1">
                {destinations.map((destination) => {
                  const Icon = destination.icon;
                  return (
                    <li key={destination.id}>
                      <Link
                        href={destination.href}
                        className="group flex min-h-14 items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 dark:hover:bg-neutral-800"
                      >
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300">
                          <Icon aria-hidden size={19} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                            {t(`quickLinks.items.${destination.id}.title`)}
                          </span>
                          <span className="mt-0.5 block text-xs leading-5 text-neutral-500 dark:text-neutral-400">
                            {t(`quickLinks.items.${destination.id}.description`)}
                          </span>
                        </span>
                        <ChevronRight
                          aria-hidden
                          size={17}
                          className="shrink-0 text-neutral-400 transition-transform group-hover:translate-x-0.5"
                        />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </section>
  );
}
