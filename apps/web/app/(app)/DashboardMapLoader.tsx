"use client";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import type { DriveTrack } from "../../lib/dashboard";
import { MapTileGate } from "../../components/LocationProviderClientConfig";

// Leaflet touches window/document at import time, so the map must never be
// part of the server-rendered bundle (same pattern as drives/[id]/DriveMapLoader.tsx).
// `ssr: false` is only allowed inside a Client Component in Next.js 15, so
// this tiny wrapper exists solely to host the dynamic() call for the
// server-component page.tsx.
const DashboardMap = dynamic(() => import("./DashboardMap").then((m) => m.DashboardMap), {
  ssr: false,
  loading: () => (
    <div className="h-[220px] w-full animate-pulse rounded-lg border border-neutral-300 bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800 sm:h-[230px]" />
  ),
});

export interface DashboardMapLoaderProps {
  tracks: DriveTrack[];
  car: {
    lat: number;
    lon: number;
    displayName: string;
    placeName: string | null;
  } | null;
}

export function DashboardMapLoader({ tracks, car }: DashboardMapLoaderProps) {
  const router = useRouter();
  return (
    <MapTileGate className="h-[220px] w-full sm:h-[230px]">
      {(mapTiles) => (
        <DashboardMap
          tracks={tracks}
          car={car}
          mapTiles={mapTiles}
          onSelectDrive={(driveId) => router.push(`/drives/${driveId}`)}
        />
      )}
    </MapTileGate>
  );
}
