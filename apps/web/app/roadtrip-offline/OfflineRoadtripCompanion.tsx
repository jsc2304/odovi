"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, BatteryCharging, Check, ChevronLeft, ChevronRight, MapPin, Navigation, RotateCcw, Wifi, WifiOff } from "lucide-react";
import type { OfflineRoadtrip } from "../(app)/journeys/[id]/OfflinePlanButton";
import { OFFLINE_ROADTRIP_STORAGE_KEY } from "../(app)/journeys/[id]/OfflinePlanButton";
import { buttonClasses } from "../../components/ui/Button";

const PROGRESS_KEY = "tripatlas:offline-roadtrip-progress:v1";

type Labels = Record<
  | "title" | "emptyTitle" | "emptyHint" | "back" | "version" | "saved"
  | "nextStop" | "arrived" | "distance" | "duration" | "arrivalSoc"
  | "chargeTarget" | "chargeEstimate"
  | "navigate" | "previous" | "next" | "complete" | "routeComplete"
  | "reset" | "offlineReady" | "online" | "offline",
  string
>;

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  return hours > 0 ? `${hours} h ${minutes} min` : `${minutes} min`;
}

export function OfflineRoadtripCompanion({ labels }: { labels: Labels }) {
  const [trip, setTrip] = useState<OfflineRoadtrip | null>(null);
  const [currentIndex, setCurrentIndex] = useState(1);
  const [loaded, setLoaded] = useState(false);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    setOnline(navigator.onLine);
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    try {
      const raw = localStorage.getItem(OFFLINE_ROADTRIP_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as OfflineRoadtrip;
        setTrip(parsed);
        const progress = Number(localStorage.getItem(`${PROGRESS_KEY}:${parsed.journeyId}:${parsed.version}`));
        if (Number.isInteger(progress) && progress >= 1) setCurrentIndex(progress);
      }
    } catch {
      localStorage.removeItem(OFFLINE_ROADTRIP_STORAGE_KEY);
    }
    setLoaded(true);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  useEffect(() => {
    if (!trip) return;
    localStorage.setItem(`${PROGRESS_KEY}:${trip.journeyId}:${trip.version}`, String(currentIndex));
  }, [currentIndex, trip]);

  const complete = trip != null && currentIndex >= trip.plan.stops.length;
  const stop = complete ? null : trip?.plan.stops[currentIndex];
  const leg = complete ? null : trip?.plan.legs[currentIndex - 1];
  const charge = stop
    ? trip?.plan.charging?.stops.find((candidate) => candidate.stopId === stop.id)
    : null;
  const mapsUrl = useMemo(() => {
    if (!stop) return "#";
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${stop.lat},${stop.lon}`)}`;
  }, [stop]);

  return (
    <main className="min-h-dvh bg-neutral-950 px-4 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-[calc(1rem+env(safe-area-inset-top))] text-white">
      <div className="mx-auto max-w-lg">
        <div className="flex items-center justify-between gap-3">
          <a href={trip ? `/journeys/${trip.journeyId}` : "/journeys"} className="inline-flex items-center gap-1 text-sm text-neutral-300">
            <ArrowLeft aria-hidden size={16} /> {labels.back}
          </a>
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs ${online ? "bg-emerald-950 text-emerald-300" : "bg-amber-950 text-amber-300"}`}>
            {online ? <Wifi aria-hidden size={13} /> : <WifiOff aria-hidden size={13} />}
            {online ? labels.online : labels.offline}
          </span>
        </div>

        <h1 className="mt-5 text-2xl font-semibold">{labels.title}</h1>
        {!loaded ? null : !trip ? (
          <section className="mt-6 rounded-2xl border border-neutral-800 bg-neutral-900 p-6 text-center">
            <MapPin aria-hidden size={28} className="mx-auto text-neutral-500" />
            <h2 className="mt-3 font-semibold">{labels.emptyTitle}</h2>
            <p className="mt-1 text-sm text-neutral-400">{labels.emptyHint}</p>
          </section>
        ) : (
          <>
            <section className="mt-4 rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
              <p className="text-lg font-semibold">{trip.journeyName}</p>
              <p className="mt-1 text-xs text-neutral-400">
                {labels.version} {trip.version} · {labels.saved} {new Date(trip.savedAt).toLocaleString()}
              </p>
              <p className="mt-3 inline-flex items-center gap-1 text-xs text-emerald-300">
                <Check aria-hidden size={14} /> {labels.offlineReady}
              </p>
            </section>

            {complete ? (
              <section className="mt-4 rounded-2xl bg-emerald-950 p-6 text-center text-emerald-100">
                <Check aria-hidden size={36} className="mx-auto" />
                <h2 className="mt-3 text-xl font-semibold">{labels.routeComplete}</h2>
                <button type="button" onClick={() => setCurrentIndex(1)} className={buttonClasses("secondary", "md", "mt-5 border-emerald-700 text-emerald-100 hover:bg-emerald-900")}>
                  <RotateCcw aria-hidden size={16} /> {labels.reset}
                </button>
              </section>
            ) : stop && leg ? (
              <section className="mt-4 rounded-2xl bg-sky-900 p-5 shadow-lg shadow-sky-950/40">
                <p className="text-xs font-semibold uppercase tracking-wide text-sky-300">{labels.nextStop} {currentIndex + 1}/{trip.plan.stops.length}</p>
                <h2 className="mt-2 text-2xl font-semibold leading-tight">{stop.label}</h2>
                <div className="mt-5 grid grid-cols-3 gap-2">
                  <Metric label={labels.distance} value={`${leg.distanceKm.toFixed(0)} km`} />
                  <Metric label={labels.duration} value={formatDuration(leg.durationSeconds)} />
                  <Metric label={labels.arrivalSoc} value={`${Math.round(leg.arrivalSoc)} %`} />
                </div>
                {charge && (
                  <div className="mt-3 rounded-xl border border-amber-400/30 bg-amber-950/50 p-3 text-amber-100">
                    <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-300">
                      <BatteryCharging aria-hidden size={15} />
                      {labels.chargeTarget}
                    </p>
                    <p className="mt-2 text-sm font-semibold tabular-nums">
                      {Math.round(charge.arrivalSoc)} % → {Math.round(charge.targetSoc)} % · +{charge.energyAddedKwh.toFixed(1)} kWh
                    </p>
                    <p className="mt-1 text-xs text-amber-200/80">
                      {labels.chargeEstimate}: {formatDuration(charge.durationSeconds)}
                    </p>
                  </div>
                )}
                <a href={mapsUrl} target="_blank" rel="noreferrer" className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 font-semibold text-sky-950">
                  <Navigation aria-hidden size={18} /> {labels.navigate}
                </a>
              </section>
            ) : null}

            <div className="mt-4 grid grid-cols-2 gap-3">
              <button type="button" disabled={currentIndex <= 1} onClick={() => setCurrentIndex((value) => Math.max(1, value - 1))} className={buttonClasses("secondary", "md", "border-neutral-700 text-neutral-200 disabled:opacity-40")}>
                <ChevronLeft aria-hidden size={16} /> {labels.previous}
              </button>
              <button type="button" disabled={complete} onClick={() => setCurrentIndex((value) => value + 1)} className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-white px-4 py-2 text-sm font-medium text-neutral-950 disabled:opacity-40">
                {currentIndex === trip.plan.stops.length - 1 ? labels.complete : labels.next} <ChevronRight aria-hidden size={16} />
              </button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-sky-950/70 p-3">
      <p className="text-[10px] uppercase tracking-wide text-sky-300">{label}</p>
      <p className="mt-1 text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}
