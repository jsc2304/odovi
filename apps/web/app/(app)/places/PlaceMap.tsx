"use client";
import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fallback view when no coordinates are set yet: Zürich city center.
const FALLBACK_CENTER: [number, number] = [47.3769, 8.5417];
const FALLBACK_ZOOM = 13;

export interface PlaceMapProps {
  lat: number | null;
  lon: number | null;
  radiusM: number;
  onChange: (lat: number, lon: number) => void;
}

/**
 * Hand-rolled Leaflet wrapper (no react-leaflet, to avoid React 19 / Next 15
 * compatibility friction). Renders OSM raster tiles, a draggable-by-click
 * marker (divIcon, no PNG assets needed) and a circle showing the configured
 * radius. Must be loaded via next/dynamic with ssr: false, since Leaflet
 * touches `window`/`document` at import time.
 */
export function PlaceMap({ lat, lon, radiusM, onChange }: PlaceMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const circleRef = useRef<L.Circle | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Init map once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const hasCoords = lat != null && lon != null;
    const center: [number, number] = hasCoords
      ? [lat as number, lon as number]
      : FALLBACK_CENTER;

    const map = L.map(containerRef.current, {
      center,
      zoom: hasCoords ? 15 : FALLBACK_ZOOM,
    });

    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);

    const icon = L.divIcon({
      className: "",
      html: '<span style="display:block;width:16px;height:16px;border-radius:9999px;background:#7c3aed;border:2px solid #f7f8fb;box-shadow:0 0 0 3px rgba(124,58,237,0.24);"></span>',
      iconSize: [16, 16],
      iconAnchor: [8, 8],
    });

    const marker = L.marker(center, { icon, draggable: true }).addTo(map);
    marker.on("dragend", () => {
      const pos = marker.getLatLng();
      onChangeRef.current(pos.lat, pos.lng);
    });

    const circle = L.circle(center, {
      radius: radiusM,
      color: "#7c3aed",
      weight: 1.5,
      fillColor: "#7c3aed",
      fillOpacity: 0.12,
    }).addTo(map);

    map.on("click", (e: L.LeafletMouseEvent) => {
      onChangeRef.current(e.latlng.lat, e.latlng.lng);
    });

    mapRef.current = map;
    markerRef.current = marker;
    circleRef.current = circle;

    return () => {
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
      circleRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pan/move pin on external lat/lon changes (e.g. address search, prefill).
  useEffect(() => {
    if (!mapRef.current || !markerRef.current || !circleRef.current) return;
    if (lat == null || lon == null) return;
    const pos: [number, number] = [lat, lon];
    markerRef.current.setLatLng(pos);
    circleRef.current.setLatLng(pos);
    mapRef.current.panTo(pos);
  }, [lat, lon]);

  // Update circle radius live.
  useEffect(() => {
    circleRef.current?.setRadius(radiusM);
  }, [radiusM]);

  return (
    <div
      ref={containerRef}
      className="h-80 w-full rounded-lg border border-neutral-300 dark:border-neutral-700"
    />
  );
}
