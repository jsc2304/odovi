import { CarFront, ExternalLink } from "lucide-react";
import { buttonClasses } from "../../../components/ui/Button";
import { disconnectTesla } from "../../../lib/actions/tesla";
import type { TeslaIntegrationStatus } from "../../../lib/tesla/integration";

function maskVin(vin: string | null): string {
  if (!vin) return "—";
  return `${"•".repeat(Math.max(0, vin.length - 4))}${vin.slice(-4)}`;
}

export function TeslaIntegrationCard({
  status,
  labels,
}: {
  status: TeslaIntegrationStatus;
  labels: Record<"title" | "description" | "notConfigured" | "connected" | "vehicle" | "connect" | "disconnect" | "pair" | "pairHint", string>;
}) {
  const pairUrl = status.partnerDomain
    ? `https://tesla.com/_ak/${status.partnerDomain}`
    : null;
  return (
    <section className="mt-6 rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-center gap-2">
        <CarFront aria-hidden size={18} />
        <h2 className="text-sm font-semibold">{labels.title}</h2>
      </div>
      <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">{labels.description}</p>
      {!status.configured ? (
        <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">{labels.notConfigured}</p>
      ) : status.connected ? (
        <div className="mt-3">
          <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">{labels.connected}</p>
          <p className="mt-1 text-sm text-neutral-500">{labels.vehicle}: <span className="font-mono">{maskVin(status.vehicleVin)}</span></p>
          <p className="mt-3 text-xs text-neutral-500 dark:text-neutral-400">{labels.pairHint}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {pairUrl && (
              <a href={pairUrl} target="_blank" rel="noreferrer" className={buttonClasses("secondary", "sm")}>
                {labels.pair}<ExternalLink aria-hidden size={13} />
              </a>
            )}
            <form action={disconnectTesla}>
              <button className={buttonClasses("destructive", "sm")} type="submit">{labels.disconnect}</button>
            </form>
          </div>
        </div>
      ) : (
        <a href="/api/tesla/connect" className={buttonClasses("primary", "md", "mt-4")}>{labels.connect}</a>
      )}
    </section>
  );
}
