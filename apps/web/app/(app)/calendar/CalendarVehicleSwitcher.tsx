"use client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { Vehicle } from "../../../lib/queries";

export function CalendarVehicleSwitcher({
  vehicles,
  current,
  month,
}: {
  vehicles: Vehicle[];
  current: number;
  month: string;
}) {
  const router = useRouter();
  const t = useTranslations("calendar");
  return (
    <select
      aria-label={t("vehicleSelectLabel")}
      value={current}
      onChange={(e) => router.push(`/calendar?month=${month}&vehicle=${e.target.value}`)}
      className="min-h-11 max-w-full rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
    >
      {vehicles.map((v) => (
        <option key={v.id} value={v.id}>
          {v.displayName}
        </option>
      ))}
    </select>
  );
}
