"use client";
import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { RoutePointTuple } from "../../../../lib/driveRoute";

export interface DriveMapProps {
  points: RoutePointTuple[];
}

function markerIcon(color: string): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<span style="display:block;width:14px;height:14px;border-radius:9999px;background:${color};border:2px solid white;box-shadow:0 0 0 1px rgba(0,0,0,0.4);"></span>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

const START_ICON = markerIcon("#16a34a"); // green-600: start
const END_ICON = markerIcon("#dc2626"); // red-600: end

/**
 * Hand-rolled Leaflet wrapper mirroring app/(app)/places/PlaceMap.tsx:
 * no react-leaflet (React 19 / Next 15 friction), must be loaded via
 * next/dynamic with ssr: false since Leaflet touches window/document.
 *
 * Read-only track view: polyline of the drive plus start/end markers.
 * scrollWheelZoom stays off until the user clicks into the map, so the
 * page doesn't get scroll-hijacked while scrolling past the card.
 */
export function DriveMap({ points }: DriveMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    if (points.length < 2) return;

    const latLngs: L.LatLngTuple[] = points.map((p) => [p[0], p[1]]);

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
      opacity: 0.8,
    }).addTo(map);

    L.marker(latLngs[0], { icon: START_ICON }).addTo(map);
    L.marker(latLngs[latLngs.length - 1], { icon: END_ICON }).addTo(map);

    map.fitBounds(polyline.getBounds(), { padding: [24, 24] });

    // Enable scroll-to-zoom only once the user has clicked into the map,
    // otherwise a page-scroll gesture over the map hijacks the scroll.
    map.on("click", () => map.scrollWheelZoom.enable());

    mapRef.current = map;

    return () => {
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
