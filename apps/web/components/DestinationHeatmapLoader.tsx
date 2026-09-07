"use client";

import React from "react";
import dynamic from "next/dynamic";
import { MapTileGate } from "./LocationProviderClientConfig";

export interface DestinationHeatmapPoint {
  key: string;
  label: string;
  lat: number;
  lon: number;
  visits: number;
}

export interface DestinationHeatmapLoaderProps {
  points: DestinationHeatmapPoint[];
  ariaLabel: string;
  emptyLabel: string;
  visitLabels: { one: string; other: string };
  intensityLabel: string;
  locale: string;
}

// Leaflet accesses the DOM at import time. The existing provider gate decides
// whether this client-only component is mounted at all.
const DestinationHeatmap = dynamic(
  () => import("./DestinationHeatmap").then((module) => module.DestinationHeatmap),
  {
    ssr: false,
    loading: () => <div className="h-[360px] w-full animate-pulse rounded-lg bg-neutral-100 dark:bg-neutral-800 sm:h-[420px]" />,
  },
);

export function DestinationHeatmapLoader(props: DestinationHeatmapLoaderProps) {
  return (
    <MapTileGate className="h-[360px] w-full sm:h-[420px]">
      {(mapTiles) => <DestinationHeatmap {...props} mapTiles={mapTiles} />}
    </MapTileGate>
  );
}
