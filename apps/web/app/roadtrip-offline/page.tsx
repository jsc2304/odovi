import { getTranslations } from "next-intl/server";
import { OfflineRoadtripCompanion } from "./OfflineRoadtripCompanion";

export const dynamic = "force-dynamic";

export default async function OfflineRoadtripPage() {
  const t = await getTranslations("journeys");
  return (
    <OfflineRoadtripCompanion
      labels={{
        title: t("offline.title"),
        emptyTitle: t("offline.emptyTitle"),
        emptyHint: t("offline.emptyHint"),
        back: t("offline.back"),
        version: t("offline.version"),
        saved: t("offline.saved"),
        nextStop: t("offline.nextStop"),
        arrived: t("offline.arrived"),
        distance: t("offline.distance"),
        duration: t("offline.duration"),
        arrivalSoc: t("offline.arrivalSoc"),
        chargeTarget: t("offline.chargeTarget"),
        chargeEstimate: t("offline.chargeEstimate"),
        navigate: t("offline.navigate"),
        previous: t("offline.previous"),
        next: t("offline.next"),
        complete: t("offline.complete"),
        routeComplete: t("offline.routeComplete"),
        reset: t("offline.reset"),
        offlineReady: t("offline.offlineReady"),
        online: t("offline.online"),
        offline: t("offline.offline"),
      }}
    />
  );
}
