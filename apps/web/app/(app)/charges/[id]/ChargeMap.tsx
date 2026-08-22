"use client";
import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export interface ChargeMapProps {
  lat: number;
  lon: number;
}

const CHARGE_ICON = L.divIcon({
  className: "",
  html: '<span style="display:block;width:16px;height:16px;border-radius:9999px;background:#7c3aed;border:2px solid #f7f8fb;box-shadow:0 0 0 3px rgba(124,58,237,0.24);"></span>',
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

/**
 * Hand-rolled Leaflet wrapper matching drives/[id]/DriveMap.tsx:
 * no react-leaflet, must be loaded via next/dynamic with ssr: false.
 * scrollWheelZoom stays off until the user clicks into the map.
 */
export function ChargeMap({ lat, lon }: ChargeMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const center: L.LatLngTuple = [lat, lon];
    const map = L.map(containerRef.current, {
      scrollWheelZoom: false,
      zoomControl: true,
    });

    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);

    L.marker(center, { icon: CHARGE_ICON }).addTo(map);
    map.setView(center, 15);

    map.on("click", () => map.scrollWheelZoom.enable());

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [lat, lon]);

  return (
    <div
      ref={containerRef}
      className="h-48 w-full rounded-lg border border-neutral-300 dark:border-neutral-700 sm:h-56"
    />
  );
}
