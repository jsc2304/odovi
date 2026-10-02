"use client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { shiftMonth } from "../../../lib/calendarGrid";
import { toIntlLocale } from "../../../lib/i18nLocale";
import { buttonClasses } from "../../../components/ui/Button";
import { RouteRefresh } from "../../../components/ui/RouteFeedback";

interface Props {
  month: string; // YYYY-MM
  currentMonth: string;
  vehicleQuery: string; // "" or "?vehicle=2"
}

export function MonthNav({ month, currentMonth, vehicleQuery }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const t = useTranslations("calendar");
  const locale = useLocale();

  function goTo(nextMonth: string) {
    const suffix = vehicleQuery ? `&${vehicleQuery.slice(1)}` : "";
    startTransition(() => router.push(`/calendar?month=${nextMonth}${suffix}`));
  }

  return (
    <><div className="flex flex-wrap items-center gap-3" aria-busy={pending}>
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label={t("prevMonth")}
          onClick={() => goTo(shiftMonth(month, -1))}
          className={buttonClasses("secondary", "md", "!h-11 !w-11 !p-0")}
        >
          <ChevronLeft aria-hidden size={18} />
        </button>
        <button
          type="button"
          aria-label={t("nextMonth")}
          onClick={() => goTo(shiftMonth(month, 1))}
          className={buttonClasses("secondary", "md", "!h-11 !w-11 !p-0")}
        >
          <ChevronRight aria-hidden size={18} />
        </button>
      </div>

      <h1 className="min-w-0 text-xl font-semibold capitalize tracking-tight md:text-2xl">
        {formatMonthLabelClient(month, locale)}
      </h1>

      <div className="ml-auto flex min-w-0 max-w-full flex-wrap items-center gap-2">
        {month !== currentMonth && (
          <button
            type="button"
            onClick={() => goTo(currentMonth)}
            className={buttonClasses("secondary", "md")}
          >
            {t("today")}
          </button>
        )}
        <input
          type="month"
          value={month}
          aria-label={t("monthSelectLabel")}
          onChange={(e) => {
            if (e.target.value) goTo(e.target.value);
          }}
          className="min-h-11 min-w-0 max-w-full rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm text-neutral-900 outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:focus-visible:ring-white dark:focus-visible:ring-offset-neutral-950"
        />
      </div>
    </div><RouteRefresh pending={pending} /></>
  );
}

function formatMonthLabelClient(month: string, locale: string): string {
  const [y, m] = month.split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, 1, 12));
  return new Intl.DateTimeFormat(toIntlLocale(locale), {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(dt);
}
