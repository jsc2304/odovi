"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import type { Vehicle } from "../../../../lib/queries";

export function VehicleSwitcher({
  vehicles,
  current,
  date,
}: {
  vehicles: Vehicle[];
  current: number;
  date: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations("day");
  return (
    <select
      aria-label={t("vehicleSelectLabel")}
      value={current}
      onChange={(e) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set("vehicle", e.target.value);
        router.push(`/day/${date}?${params}`);
      }}
      className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
    >
      {vehicles.map((v) => (
        <option key={v.id} value={v.id}>
          {v.displayName}
        </option>
      ))}
    </select>
  );
}
