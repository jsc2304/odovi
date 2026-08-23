"use client";
import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export interface PlannerMapProps {
  /** Route-Polyline als [lat, lon]-Tupel (server-seitig ausgedünnt). */
  geometry: [number, number][];
}

function markerIcon(color: string): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<span style="display:block;width:14px;height:14px;border-radius:9999px;background:${color};border:2px solid white;box-shadow:0 0 0 1px rgba(0,0,0,0.4);"></span>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

const START_ICON = markerIcon("#16a34a"); // green-600: Start
const END_ICON = markerIcon("#dc2626"); // red-600: Ziel

/**
 * Handgerollter Leaflet-Wrapper (Muster drives/[id]/DriveMap.tsx): kein
 * react-leaflet, muss via next/dynamic mit ssr:false geladen werden, da Leaflet
 * beim Import window/document anfasst. Zeigt die geplante Route als Polyline mit
 * Start-/Ziel-Marker. Der Aufrufer remountet die Karte über einen key, sobald
 * eine neue Route berechnet wird.
 *
 * scrollWheelZoom bleibt aus, bis in die Karte geklickt wird, damit ein
 * Seiten-Scroll über der Karte nicht gekapert wird. ResizeObserver zieht die
 * fitBounds einmal nach, falls der Container beim Init noch 0 Höhe hatte.
 */
export function PlannerMap({ geometry }: PlannerMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    if (geometry.length < 2) return;

    const latLngs: L.LatLngTuple[] = geometry.map((p) => [p[0], p[1]]);

    const map = L.map(containerRef.current, {
      scrollWheelZoom: false,
      zoomControl: true,
    });

    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);

    const polyline = L.polyline(latLngs, {
      color: "#7c3aed", // Tripatlas Route Violet
      weight: 4,
      opacity: 0.85,
    }).addTo(map);

    L.marker(latLngs[0]!, { icon: START_ICON }).addTo(map);
    L.marker(latLngs[latLngs.length - 1]!, { icon: END_ICON }).addTo(map);

    const fit = () => {
      map.invalidateSize();
      map.fitBounds(polyline.getBounds(), { padding: [24, 24] });
    };
    fit();

    const ro = new ResizeObserver(() => {
      const el = containerRef.current;
      if (el && el.clientHeight > 0) {
        fit();
        ro.disconnect();
      }
    });
    if (containerRef.current) ro.observe(containerRef.current);

    map.on("click", () => map.scrollWheelZoom.enable());

    mapRef.current = map;

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={containerRef}
      className="h-64 w-full rounded-lg border border-neutral-300 dark:border-neutral-700 sm:h-[360px]"
    />
  );
}
