"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight, CalendarRange } from "lucide-react";
import { buttonClasses } from "../../../../components/ui/Button";

interface Props {
  date: string; // YYYY-MM-DD
  longLabel: string;
  prevDate: string;
  nextDate: string;
  today: string;
  vehicleQuery: string; // "" or "?vehicle=2"
}

const arrowClasses = buttonClasses(
  "secondary",
  "md",
  "!h-9 !w-9 !p-0 text-base",
);

export function DateNav({
  date,
  longLabel,
  prevDate,
  nextDate,
  today,
  vehicleQuery,
}: Props) {
  const router = useRouter();
  const t = useTranslations("day");
  const suffix = vehicleQuery;
  const context = new URLSearchParams(vehicleQuery);
  const calendarQuery = new URLSearchParams({ month: context.get("month") ?? date.slice(0, 7) });
  if (context.has("vehicle")) calendarQuery.set("vehicle", context.get("vehicle")!);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-1">
        <Link
          href={`/day/${prevDate}${suffix}`}
          aria-label={t("prevDay")}
          className={arrowClasses}
        >
          <ChevronLeft aria-hidden size={18} />
        </Link>
        <Link
          href={`/day/${nextDate}${suffix}`}
          aria-label={t("nextDay")}
          className={arrowClasses}
        >
          <ChevronRight aria-hidden size={18} />
        </Link>
      </div>

      <h1 className="min-w-0 text-xl font-semibold tracking-tight md:text-2xl">
        {longLabel}
      </h1>

      <div className="ml-auto flex items-center gap-2">
        {date !== today && (
          <Link href={`/day/${today}${suffix}`} className={buttonClasses("secondary", "md")}>
            {t("today")}
          </Link>
        )}
        <input
          type="date"
          value={date}
          aria-label={t("dateSelectLabel")}
          onChange={(e) => {
            const v = e.target.value;
            if (v) router.push(`/day/${v}${suffix}`);
          }}
          className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm text-neutral-900 outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:focus-visible:ring-white dark:focus-visible:ring-offset-neutral-950"
        />
        <Link
          href={`/calendar?${calendarQuery}`}
          aria-label={t("openCalendar")}
          title={t("openCalendar")}
          className={buttonClasses("ghost", "md", "!h-9 !w-9 !p-0")}
        >
          <CalendarRange aria-hidden size={18} />
        </Link>
      </div>
    </div>
  );
}
