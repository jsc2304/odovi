"use client";
import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { DriveTrack } from "../../lib/dashboard";

export interface DashboardMapProps {
  tracks: DriveTrack[];
  car: {
    lat: number;
    lon: number;
    displayName: string;
    placeName: string | null;
  } | null;
  onSelectDrive: (driveId: number) => void;
}

function carIcon(): L.DivIcon {
  return L.divIcon({
    className: "",
    html: '<span style="display:block;width:16px;height:16px;border-radius:9999px;background:#7c3aed;border:2px solid #f7f8fb;box-shadow:0 0 0 4px rgba(124,58,237,0.24);"></span>',
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

function endDotIcon(): L.DivIcon {
  return L.divIcon({
    className: "",
    html: '<span style="display:block;width:10px;height:10px;border-radius:9999px;background:#67e8f9;border:2px solid #f7f8fb;box-shadow:0 0 0 3px rgba(124,58,237,0.28);"></span>',
    iconSize: [10, 10],
    iconAnchor: [5, 5],
  });
}

const CAR_ICON = carIcon();
const END_ICON = endDotIcon();

/**
 * Hand-rolled Leaflet wrapper mirroring drives/[id]/DriveMap.tsx: no
 * react-leaflet, loaded via next/dynamic with ssr: false. Shows an overview
 * of the most recent drives' routes plus the car's current position.
 *
 * scrollWheelZoom stays off until the user clicks into the map, so page
 * scroll isn't hijacked while scrolling past the dashboard card.
 */
export function DashboardMap({ tracks, car, onSelectDrive }: DashboardMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    if (tracks.length === 0) return;

    const map = L.map(containerRef.current, {
      scrollWheelZoom: false,
      zoomControl: true,
    });

    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);

    // Most recent drive is first (caller sorts newest-first): draw the older
    // ones first (muted) so the prominent newest polyline ends up on top.
    const bounds = L.latLngBounds([]);
    const [newest, ...older] = tracks;

    for (const track of older) {
      const latLngs: L.LatLngTuple[] = track.points.map((p) => [p[0], p[1]]);
      if (latLngs.length < 2) continue;
      const line = L.polyline(latLngs, {
        color: "#a3a3a3", // neutral-400
        weight: 3,
        opacity: 0.5,
      }).addTo(map);
      line.on("click", () => onSelectDrive(track.driveId));
      line.on("mouseover", () => line.setStyle({ opacity: 0.8 }));
      line.on("mouseout", () => line.setStyle({ opacity: 0.5 }));
      bounds.extend(line.getBounds());
    }

    if (newest && newest.points.length >= 2) {
      const latLngs: L.LatLngTuple[] = newest.points.map((p) => [p[0], p[1]]);
      const line = L.polyline(latLngs, {
        color: "#7c3aed", // Tripatlas Route Violet
        weight: 4,
        opacity: 0.9,
      }).addTo(map);
      line.on("click", () => onSelectDrive(newest.driveId));
      L.marker(latLngs[latLngs.length - 1], { icon: END_ICON }).addTo(map);
      bounds.extend(line.getBounds());
    }

    if (car) {
      const marker = L.marker([car.lat, car.lon], { icon: CAR_ICON }).addTo(map);
      const label = car.placeName ? `${car.displayName} · ${car.placeName}` : car.displayName;
      marker.bindTooltip(label);
      bounds.extend([car.lat, car.lon]);
    }

    const fit = () => {
      map.invalidateSize();
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [24, 24] });
      } else {
        map.setView([47.3769, 8.5417], 12);
      }
    };
    fit();

    // Das Dashboard streamt sein Layout — beim Map-Init kann der Container
    // noch 0 Höhe haben, dann rechnet fitBounds auf degenerierter Größe und
    // klemmt auf Max-Zoom. Nach dem ersten echten Layout einmal nachziehen,
    // danach abmelden (sonst würde jedes Fenster-Resize Pan/Zoom resetten).
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
      className="h-[300px] w-full rounded-lg border border-neutral-300 dark:border-neutral-700 sm:h-[340px]"
    />
  );
}
