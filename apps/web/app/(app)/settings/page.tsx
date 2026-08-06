import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { ChevronRight, Wand2 } from "lucide-react";
import { APP_TIMEZONE } from "../../../lib/config";
import { formatRelativeTime } from "../../../lib/day";
import { getSyncState, getVehiclesDetailed } from "../../../lib/queries";
import { entityLabel, buildEntityLabels } from "../../../lib/diagnostics";
import { getSoftwareUpdates } from "../../../lib/softwareUpdates";
import { LogoutButton } from "./LogoutButton";
import { ResyncButton } from "./ResyncButton";
import { EfficiencyOverrideForm } from "./EfficiencyOverrideForm";
import { PasswordChangeForm } from "./PasswordChangeForm";
import { SoftwareTimeline } from "./SoftwareTimeline";
import { DiagnosticsCard } from "./DiagnosticsCard";
import { TeslaIntegrationCard } from "./TeslaIntegrationCard";
import { getTeslaIntegrationStatus } from "../../../lib/tesla/integration";

export const dynamic = "force-dynamic";

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-6 rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
        {title}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function maskVin(vin: string | null): string {
  if (vin == null || vin.length < 4) return "—";
  return `${"•".repeat(Math.max(vin.length - 4, 0))}${vin.slice(-4)}`;
}

export default async function SettingsPage() {
  const [t, locale, vehicles, syncRows, teslaStatus] = await Promise.all([
    getTranslations("settings"),
    getLocale(),
    getVehiclesDetailed(),
    getSyncState(),
    getTeslaIntegrationStatus(),
  ]);
  const defaultVehicleId = vehicles[0]?.id;
  const softwareUpdates =
    defaultVehicleId != null ? await getSoftwareUpdates(defaultVehicleId) : [];
  const entityLabels = buildEntityLabels(t);

  const links = [
    { href: "/tags", label: t("links.tags") },
    { href: "/journeys", label: t("links.journeys") },
    { href: "/calendar", label: t("links.calendar") },
    { href: "/reports", label: t("links.reports") },
    { href: "/insights", label: t("links.insights") },
  ];

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
      <p className="mt-3 text-neutral-500 dark:text-neutral-400">
        {t("subtitle")}
      </p>

      <DiagnosticsCard />

      <TeslaIntegrationCard
        status={teslaStatus}
        labels={{
          title: t("tesla.title"),
          description: t("tesla.description"),
          notConfigured: t("tesla.notConfigured"),
          connected: t("tesla.connected"),
          vehicle: t("tesla.vehicle"),
          connect: t("tesla.connect"),
          disconnect: t("tesla.disconnect"),
          pair: t("tesla.pair"),
          pairHint: t("tesla.pairHint"),
        }}
      />

      <Link
        href="/rules"
        className="mt-6 flex items-center gap-3 rounded-xl border border-neutral-200 bg-white p-4 transition hover:border-neutral-300 hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:border-neutral-700 dark:hover:bg-neutral-800"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300">
          <Wand2 aria-hidden size={20} />
        </span>
        <span className="flex-1">
          <span className="block text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            {t("rulesLink.title")}
          </span>
          <span className="block text-sm text-neutral-500 dark:text-neutral-400">
            {t("rulesLink.subtitle")}
          </span>
        </span>
        <ChevronRight aria-hidden size={18} className="shrink-0 text-neutral-400" />
      </Link>

      <Card title={t("vehicles.title")}>
        <div className="flex flex-col gap-3">
          {vehicles.length === 0 && (
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              {t("vehicles.empty")}
            </p>
          )}
          {vehicles.map((v) => (
            <div
              key={v.id}
              className="border-b border-neutral-100 pb-3 last:border-0 last:pb-0 dark:border-neutral-800"
            >
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                <dt className="col-span-2 font-medium text-neutral-900 dark:text-neutral-100">
                  {v.displayName}
                </dt>
                <dt className="text-neutral-500 dark:text-neutral-400">{t("vehicles.model")}</dt>
                <dd className="text-right tabular-nums">{v.model ?? "—"}</dd>
                <dt className="text-neutral-500 dark:text-neutral-400">{t("vehicles.vin")}</dt>
                <dd className="text-right font-mono tabular-nums">{maskVin(v.vin)}</dd>
                <dt className="text-neutral-500 dark:text-neutral-400">
                  {t("vehicles.efficiencyTeslamate")}
                </dt>
                <dd className="text-right tabular-nums">
                  {v.efficiencyKwhPerKm != null
                    ? `${(v.efficiencyKwhPerKm * 1000).toFixed(0)} Wh/km`
                    : t("vehicles.efficiencyNotLearned")}
                </dd>
              </dl>
              <EfficiencyOverrideForm
                vehicleId={v.id}
                currentWhPerKm={
                  v.efficiencyOverrideKwhPerKm != null
                    ? Math.round(v.efficiencyOverrideKwhPerKm * 1000)
                    : null
                }
                teslaMateHasLearned={v.efficiencyKwhPerKm != null}
              />
            </div>
          ))}
        </div>
      </Card>

      <SoftwareTimeline updates={softwareUpdates} />

      <Card title={t("sync.title")}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs font-medium text-neutral-500 dark:text-neutral-400">
              <tr>
                <th className="py-1.5 pr-2">{t("sync.entity")}</th>
                <th className="py-1.5 pr-2">{t("sync.run")}</th>
                <th className="py-1.5 pr-2">{t("sync.status")}</th>
                <th className="hidden py-1.5 pr-2 sm:table-cell">{t("sync.watermark")}</th>
                <th className="hidden py-1.5 text-right sm:table-cell">{t("sync.rows")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {syncRows.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-3 text-center text-neutral-500 dark:text-neutral-400">
                    {t("sync.empty")}
                  </td>
                </tr>
              )}
              {syncRows.map((row) => {
                const status =
                  row.lastStatus === "ok"
                    ? "ok"
                    : row.lastStatus === "deferred"
                      ? "deferred"
                      : "error";
                return (
                  <tr key={`${row.source}-${row.entity}`}>
                    <td className="max-w-[7.5rem] truncate py-2 pr-2 font-medium text-neutral-900 dark:text-neutral-100 sm:max-w-none sm:whitespace-nowrap">
                      {entityLabel(row.source, row.entity, entityLabels)}
                    </td>
                    <td className="whitespace-nowrap py-2 pr-2 text-xs tabular-nums text-neutral-600 sm:text-sm dark:text-neutral-400">
                      {row.lastRunAt ? formatRelativeTime(row.lastRunAt, locale) : "—"}
                    </td>
                    <td className="whitespace-nowrap py-2 pr-2">
                      <span
                        title={status !== "ok" ? (row.lastError ?? undefined) : undefined}
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          status === "ok"
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                            : status === "deferred"
                              ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                            : "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
                        }`}
                      >
                        {t(`sync.${status}`)}
                      </span>
                    </td>
                    <td className="hidden whitespace-nowrap py-2 pr-2 tabular-nums text-neutral-600 sm:table-cell dark:text-neutral-400">
                      {row.watermarkTs ? formatRelativeTime(row.watermarkTs, locale) : "—"}
                    </td>
                    <td className="hidden whitespace-nowrap py-2 text-right tabular-nums text-neutral-600 sm:table-cell dark:text-neutral-400">
                      {row.rowsUpserted ?? "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {syncRows.some((r) => r.lastStatus === "error" && r.lastError) && (
          <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
            {t("sync.errorHint")}
          </p>
        )}

        <div className="mt-4">
          <ResyncButton />
        </div>
      </Card>

      <Card title={t("display.title")}>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
          <div className="flex justify-between gap-4 text-sm">
            <dt className="text-neutral-500 dark:text-neutral-400">{t("display.timezone")}</dt>
            <dd className="text-right font-medium tabular-nums">{APP_TIMEZONE}</dd>
          </div>
          <div className="flex justify-between gap-4 text-sm">
            <dt className="text-neutral-500 dark:text-neutral-400">{t("display.dateFormat")}</dt>
            <dd className="text-right font-medium">de-DE</dd>
          </div>
          <div className="flex justify-between gap-4 text-sm">
            <dt className="text-neutral-500 dark:text-neutral-400">{t("display.units")}</dt>
            <dd className="text-right font-medium">km</dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-neutral-500 dark:text-neutral-400">
          {t("display.note")}
        </p>
      </Card>

      <Card title={t("security.title")}>
        <PasswordChangeForm />
      </Card>

      <div className="mt-6 divide-y divide-neutral-200 rounded-xl border border-neutral-200 bg-white dark:divide-neutral-800 dark:border-neutral-800 dark:bg-neutral-900">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="flex items-center justify-between px-4 py-3 text-sm font-medium text-neutral-900 hover:bg-neutral-50 dark:text-neutral-100 dark:hover:bg-neutral-800"
          >
            {link.label}
            <ChevronRight aria-hidden size={18} className="text-neutral-400" />
          </Link>
        ))}
      </div>

      <div className="mt-8 border-t border-neutral-200 pt-6 dark:border-neutral-800">
        <LogoutButton />
      </div>
    </div>
  );
}
