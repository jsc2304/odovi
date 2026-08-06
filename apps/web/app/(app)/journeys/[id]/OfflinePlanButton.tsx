"use client";

import { useState } from "react";
import { Download, Smartphone } from "lucide-react";
import type { RoadtripPlanSnapshot } from "@tripatlas/core";
import { buttonClasses } from "../../../../components/ui/Button";

export const OFFLINE_ROADTRIP_STORAGE_KEY = "tripatlas:offline-roadtrip:v1";

export interface OfflineRoadtrip {
  journeyId: number;
  journeyName: string;
  version: number;
  savedAt: string;
  plan: RoadtripPlanSnapshot;
}

type OfflinePlanButtonProps = Omit<OfflineRoadtrip, "savedAt"> & {
  saveLabel: string;
  openLabel: string;
  savedLabel: string;
};

export function OfflinePlanButton({
  journeyId,
  journeyName,
  version,
  plan,
  saveLabel,
  openLabel,
  savedLabel,
}: OfflinePlanButtonProps) {
  const [saved, setSaved] = useState(false);

  function saveOffline() {
    const payload: OfflineRoadtrip = {
      journeyId,
      journeyName,
      version,
      savedAt: new Date().toISOString(),
      plan,
    };
    localStorage.setItem(OFFLINE_ROADTRIP_STORAGE_KEY, JSON.stringify(payload));
    setSaved(true);
  }

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={saveOffline}
        className={buttonClasses("secondary", "sm")}
      >
        <Download aria-hidden size={14} />
        {saved ? savedLabel : saveLabel}
      </button>
      <a href="/roadtrip-offline" className={buttonClasses("primary", "sm")}>
        <Smartphone aria-hidden size={14} />
        {openLabel}
      </a>
    </div>
  );
}
