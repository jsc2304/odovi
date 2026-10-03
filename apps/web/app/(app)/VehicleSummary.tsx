"use client";

import { BatteryMedium, Car, ChevronDown, TriangleAlert } from "lucide-react";
import { assessTpms } from "@odovi/core";
import { useTranslations } from "next-intl";
import type { OpenSessionStatus, VehicleStatusRow } from "../../lib/dashboard";

export function VehicleSummary({ status, openSession }: {
  status: VehicleStatusRow;
  openSession: OpenSessionStatus | null;
}) {
  const t = useTranslations("dashboard");
  const tireWarning = assessTpms({ fl: status.tpmsFlBar, fr: status.tpmsFrBar, rl: status.tpmsRlBar, rr: status.tpmsRrBar }).anyWarn;
  const state = openSession?.kind ?? status.state;
  const statusKey = state === "driving" ? "drivingNow" : state === "charging" ? "chargingNow"
    : ["parked", "online", "asleep", "offline"].includes(state ?? "") ? "parked" : "statusUnknown";

  return (
    <button type="button" className="overview-vehicle" title={t("overview.vehicleDetails")}
      onClick={() => {
        const details = document.getElementById("vehicle-details");
        if (details instanceof HTMLDetailsElement) {
          details.open = true;
          details.querySelector("summary")?.focus();
          details.scrollIntoView({ block: "start" });
        }
      }}>
      <Car aria-hidden size={23} className="hidden lg:block" />
      <strong className="max-w-36 truncate font-medium text-neutral-900 dark:text-neutral-100">{status.displayName}</strong>
      <span className="flex items-center gap-1.5 tabular-nums"><BatteryMedium aria-hidden size={20} className="text-accent-700 dark:text-accent-300" />{status.soc == null ? "—" : `${Math.round(status.soc)} %`}</span>
      {status.ratedRangeKm != null && <span title={t("vehicleCard.ratedRangeTitle")} className="tabular-nums">≈ {Math.round(status.ratedRangeKm)} km</span>}
      {tireWarning && <span className="flex items-center gap-1 text-amber-800 dark:text-amber-300"><TriangleAlert aria-hidden size={16} />{t("tpms.checkWarning")}</span>}
      <span className="hidden xl:inline">{t(`vehicleCard.${statusKey}`)}</span>
      <ChevronDown aria-hidden size={15} />
    </button>
  );
}
