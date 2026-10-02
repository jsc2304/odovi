import { CloudOff, Wind } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { weatherCodeIcon, weatherCodeKey } from "../../lib/weatherCodes";
import type { WeatherLoadResult } from "../../lib/weather";

function formatTemp(value: number): string {
  return `${Math.round(value)}°`;
}

export async function WeatherCard({ result }: { result: WeatherLoadResult }) {
  const t = await getTranslations("weather");

  if (result.status !== "ok") {
    return (
      <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex items-start gap-2 text-neutral-500 dark:text-neutral-400">
          <CloudOff aria-hidden size={18} />
          <div>
            <p className="text-sm">
              {result.status === "disabled" ? t("disabled") : t("unavailable")}
            </p>
            {result.status === "disabled" && (
              <Link
                href="/settings#provider-review"
                className="mt-2 inline-flex min-h-11 items-center rounded-md border border-neutral-300 px-3 text-sm font-medium text-neutral-800 dark:border-neutral-700 dark:text-neutral-200"
              >
                {t("activate")}
              </Link>
            )}
          </div>
        </div>
      </section>
    );
  }

  const weather = result.weather;
  const Icon = weatherCodeIcon(weather.weatherCode);
  const showColdHint = weather.apparentTemperature < 5;

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Icon aria-hidden size={32} className="text-neutral-500 dark:text-neutral-400" />
          <div>
            <p className="text-3xl font-semibold tabular-nums">
              {formatTemp(weather.temperature)}
            </p>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              {t(`code.${weatherCodeKey(weather.weatherCode)}`)}
            </p>
          </div>
        </div>
        <div className="text-right text-sm text-neutral-500 dark:text-neutral-400">
          <p>{t("feelsLike", { temp: formatTemp(weather.apparentTemperature) })}</p>
          <p className="mt-1 flex items-center justify-end gap-1">
            <Wind aria-hidden size={13} />
            {Math.round(weather.windSpeedKmh)} km/h
          </p>
        </div>
      </div>

      <p className="mt-3 text-sm text-neutral-500 dark:text-neutral-400">
        {t("todayRange", {
          min: formatTemp(weather.todayMin),
          max: formatTemp(weather.todayMax),
        })}
      </p>

      {showColdHint && (
        <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">{t("coldHint")}</p>
      )}
    </section>
  );
}
