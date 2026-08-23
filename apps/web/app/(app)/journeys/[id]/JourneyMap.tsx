"use client";
import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export interface JourneyMapTrack {
  driveId: number;
  /** [lat, lon] tuples, ordered by ts. */
  points: [number, number][];
}

export interface JourneyMapCharge {
  id: number;
  lat: number;
  lon: number;
  placeName: string | null;
}

export interface JourneyMapProps {
  tracks: JourneyMapTrack[];
  charges: JourneyMapCharge[];
  /** Journey accent color (journeys.color); falls back to Route Violet. */
  color?: string | null;
}

function markerIcon(color: string, size = 14): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<span style="display:block;width:${size}px;height:${size}px;border-radius:9999px;background:${color};border:2px solid white;box-shadow:0 0 0 1px rgba(0,0,0,0.4);"></span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

const START_ICON = markerIcon("#16a34a"); // green-600: journey start
const END_ICON = markerIcon("#dc2626"); // red-600: journey end
const CHARGE_ICON = markerIcon("#d97706", 12); // amber-600: charge stop

/**
 * Hand-rolled Leaflet wrapper mirroring drives/[id]/DriveMap.tsx and
 * app/(app)/DashboardMap.tsx: no react-leaflet, must be loaded via
 * next/dynamic with ssr: false. Draws one polyline per drive of the journey
 * (journey color, or a neutral default) plus charge-stop markers, fit to the
 * combined bounds of everything drawn.
 */
export function JourneyMap({ tracks, charges, color }: JourneyMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const drawable = tracks.filter((t) => t.points.length >= 2);
    if (drawable.length === 0 && charges.length === 0) return;

    const map = L.map(containerRef.current, {
      scrollWheelZoom: false,
      zoomControl: true,
    });

    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);

    const lineColor = color ?? "#7c3aed"; // Tripatlas Route Violet
    const bounds = L.latLngBounds([]);

    drawable.forEach((track, i) => {
      const line = L.polyline(track.points, {
        color: lineColor,
        weight: 4,
        opacity: i === drawable.length - 1 ? 0.85 : 0.6,
      }).addTo(map);
      bounds.extend(line.getBounds());
    });

    const first = drawable[0];
    const last = drawable[drawable.length - 1];
    if (first) L.marker(first.points[0]!, { icon: START_ICON }).addTo(map);
    if (last) L.marker(last.points[last.points.length - 1]!, { icon: END_ICON }).addTo(map);

    for (const charge of charges) {
      const marker = L.marker([charge.lat, charge.lon], { icon: CHARGE_ICON }).addTo(map);
      if (charge.placeName) marker.bindTooltip(charge.placeName);
      bounds.extend([charge.lat, charge.lon]);
    }

    const fit = () => {
      map.invalidateSize();
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [24, 24] });
      }
    };
    fit();

    // Die Journey-Seite streamt (RSC) — beim Map-Init kann der Container noch
    // 0 Höhe haben, dann rechnet fitBounds auf degenerierter Größe und klemmt
    // auf Max-Zoom. Nach dem ersten echten Layout einmal nachziehen, danach
    // abmelden (Muster: DashboardMap.tsx).
    const ro = new ResizeObserver(() => {
      const el = containerRef.current;
      if (el && el.clientHeight > 0) {
        fit();
        ro.disconnect();
      }
    });
    if (containerRef.current) ro.observe(containerRef.current);

    // Enable scroll-to-zoom only once the user has clicked into the map,
    // otherwise a page-scroll gesture over the map hijacks the scroll.
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
