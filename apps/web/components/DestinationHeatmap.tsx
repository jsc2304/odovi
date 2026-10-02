"use client";

import React, { useEffect, useId, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { ActiveMapTileConfig } from "../lib/locationProviders/clientConfig";
import { addConfiguredMapTiles, createConfiguredMap } from "../lib/locationProviders/mapTiles.client";
import type { DestinationHeatmapLoaderProps, DestinationHeatmapPoint } from "./DestinationHeatmapLoader";

type DestinationHeatmapProps = DestinationHeatmapLoaderProps & { mapTiles: ActiveMapTileConfig };
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

function mappedPoints(points: DestinationHeatmapPoint[]): DestinationHeatmapPoint[] {
  return points.filter((point) => Number.isFinite(point.lat) && point.lat >= -90 && point.lat <= 90
    && Number.isFinite(point.lon) && point.lon >= -180 && point.lon <= 180
    && Number.isSafeInteger(point.visits) && point.visits > 0);
}

/** Own the Leaflet lifecycle separately from React, including print/resize cleanup. */
export function mountDestinationHeatmap(
  container: HTMLDivElement,
  props: Pick<DestinationHeatmapProps, "points" | "mapTiles" | "visitLabels" | "locale">,
  gradientId: string,
  printContainer: HTMLDivElement,
): () => void {
  const points = mappedPoints(props.points);
  const map = createConfiguredMap(container, {
    scrollWheelZoom: false, zoomControl: true, fadeAnimation: false, trackResize: false,
  });
  const bounds = L.latLngBounds(points.map((point) => [point.lat, point.lon]));
  const fit = () => {
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [48, 48], maxZoom: 12, animate: false });
    else map.setView([0, 0], 2, { animate: false });
  };
  fit();
  const tiles = addConfiguredMapTiles(map, props.mapTiles);

  const svg = document.createElementNS(SVG_NAMESPACE, "svg");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.style.pointerEvents = "none";
  const defs = document.createElementNS(SVG_NAMESPACE, "defs");
  const gradient = document.createElementNS(SVG_NAMESPACE, "radialGradient");
  gradient.id = gradientId;
  for (const [offset, color, opacity] of [
    ["0%", "#0d9488", "0.95"],
    ["35%", "#14b8a6", "0.7"],
    ["70%", "#2dd4bf", "0.3"],
    ["100%", "#5eead4", "0"],
  ]) {
    const stop = document.createElementNS(SVG_NAMESPACE, "stop");
    stop.setAttribute("offset", offset!);
    stop.setAttribute("stop-color", color!);
    stop.setAttribute("stop-opacity", opacity!);
    gradient.append(stop);
  }
  defs.append(gradient);
  svg.append(defs);
  const dots = document.createElementNS(SVG_NAMESPACE, "g");
  svg.append(dots);

  // SVGOverlay keeps the glows in Leaflet's projection and prints as vectors.
  // https://leafletjs.com/reference.html#svgoverlay
  const heat = L.svgOverlay(svg, map.getBounds(), { interactive: false, opacity: 1 }).addTo(map);
  const maximumVisits = points.reduce((maximum, point) => Math.max(maximum, point.visits), 1);
  const number = new Intl.NumberFormat(props.locale);
  const pointLabel = (point: DestinationHeatmapPoint) => `${point.label} · ${number.format(point.visits)} ${point.visits === 1 ? props.visitLabels.one : props.visitLabels.other}`;
  const printMedia = window.matchMedia("print");
  let printing = printMedia.matches;
  let printEventActive = false;
  const appendGlows = (target: SVGElement, identifier: string) => {
    for (const point of points) {
      const position = map.latLngToContainerPoint([point.lat, point.lon]);
      const strength = Math.sqrt(point.visits / maximumVisits);
      const circle = document.createElementNS(SVG_NAMESPACE, "circle");
      circle.setAttribute("cx", String(position.x));
      circle.setAttribute("cy", String(position.y));
      circle.setAttribute("r", String(14 + 30 * strength));
      circle.setAttribute("opacity", String(0.3 + 0.7 * strength));
      circle.setAttribute("fill", `url(#${identifier})`);
      target.append(circle);
    }
  };

  // Prepare a vector copy of the loaded screen view before print changes page
  // geometry. SVG images reuse only tile URLs already loaded by this map;
  // printing never calculates another tile grid or reads pixels through canvas.
  // https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Attribute/viewBox
  const capturePrintView = () => {
    if (printing || printMedia.matches || container.clientWidth <= 0 || container.clientHeight <= 0) return;
    const size = map.getSize();
    const box = container.getBoundingClientRect();
    const snapshot = document.createElementNS(SVG_NAMESPACE, "svg");
    snapshot.setAttribute("viewBox", `0 0 ${size.x} ${size.y}`);
    snapshot.setAttribute("width", String(size.x));
    snapshot.setAttribute("height", String(size.y));
    snapshot.setAttribute("preserveAspectRatio", "xMidYMid meet");
    snapshot.setAttribute("aria-hidden", "true");
    snapshot.style.cssText = "display:block;width:100%;height:auto;overflow:hidden";
    const background = document.createElementNS(SVG_NAMESPACE, "rect");
    background.setAttribute("width", "100%");
    background.setAttribute("height", "100%");
    background.setAttribute("fill", "#e5e7eb");
    snapshot.append(background);

    for (const tile of container.querySelectorAll<HTMLImageElement>(".leaflet-tile-pane img.leaflet-tile-loaded")) {
      if (!tile.complete || tile.naturalWidth === 0) continue;
      const tileBox = tile.getBoundingClientRect();
      if (tileBox.width <= 0 || tileBox.height <= 0 || tileBox.right < box.left || tileBox.left > box.right
        || tileBox.bottom < box.top || tileBox.top > box.bottom) continue;
      const image = document.createElementNS(SVG_NAMESPACE, "image");
      image.setAttribute("href", tile.currentSrc || tile.src);
      image.setAttribute("x", String(tileBox.left - box.left - container.clientLeft));
      image.setAttribute("y", String(tileBox.top - box.top - container.clientTop));
      image.setAttribute("width", String(tileBox.width));
      image.setAttribute("height", String(tileBox.height));
      image.setAttribute("preserveAspectRatio", "none");
      snapshot.append(image);
    }

    const printGradientId = `${gradientId}-print`;
    const printDefs = document.createElementNS(SVG_NAMESPACE, "defs");
    const printGradient = gradient.cloneNode(true) as SVGRadialGradientElement;
    printGradient.id = printGradientId;
    printDefs.append(printGradient);
    snapshot.append(printDefs);
    appendGlows(snapshot, printGradientId);
    for (const point of points) {
      const position = map.latLngToContainerPoint([point.lat, point.lon]);
      const marker = document.createElementNS(SVG_NAMESPACE, "circle");
      marker.setAttribute("data-destination-print-marker", point.key);
      marker.setAttribute("cx", String(position.x));
      marker.setAttribute("cy", String(position.y));
      marker.setAttribute("r", "5");
      marker.setAttribute("fill", "#0f766e");
      marker.setAttribute("stroke", "white");
      marker.setAttribute("stroke-width", "2");
      const title = document.createElementNS(SVG_NAMESPACE, "title");
      title.textContent = pointLabel(point);
      marker.append(title);
      snapshot.append(marker);
    }
    printContainer.replaceChildren(snapshot);
  };
  const redraw = () => {
    if (printing || printMedia.matches) return;
    const size = map.getSize();
    if (size.x <= 0 || size.y <= 0) return;
    svg.setAttribute("viewBox", `0 0 ${size.x} ${size.y}`);
    heat.setBounds(map.getBounds());
    dots.replaceChildren();
    appendGlows(dots, gradientId);
    capturePrintView();
  };

  for (const point of points) {
    const text = pointLabel(point);
    const dot = document.createElement("span");
    dot.setAttribute("aria-hidden", "true");
    dot.style.cssText = "display:block;width:10px;height:10px;border-radius:50%;background:#0f766e;border:2px solid white;box-shadow:0 0 0 1px #115e59";
    const marker = L.marker([point.lat, point.lon], {
      icon: L.divIcon({ html: dot, className: "", iconSize: [10, 10], iconAnchor: [5, 5] }),
      keyboard: true,
      title: text,
      alt: text,
    }).addTo(map);
    const icon = marker.getElement();
    if (icon) {
      icon.setAttribute("role", "img");
      icon.setAttribute("aria-label", text);
    }
  }

  map.on("moveend zoomend resize", redraw);
  tiles.on("tileload load tileunload", capturePrintView);
  redraw();
  let sized = container.clientWidth > 0 && container.clientHeight > 0;
  const refreshSize = () => {
    if (printing || printMedia.matches || container.clientWidth <= 0 || container.clientHeight <= 0) return;
    // Keep the user's screen view. Print scales the prepared SVG independently.
    map.invalidateSize({ pan: true, animate: false });
    if (!sized) {
      sized = true;
      fit();
    }
    redraw();
  };
  const syncPrint = () => {
    const next = printEventActive || printMedia.matches;
    const wasPrinting = printing;
    printing = next;
    if (wasPrinting && !printing) refreshSize();
  };
  const beforePrint = () => { printEventActive = true; syncPrint(); };
  const afterPrint = () => { printEventActive = false; syncPrint(); };
  const resizeObserver = new ResizeObserver(refreshSize);
  resizeObserver.observe(container);
  printMedia.addEventListener("change", syncPrint);
  window.addEventListener("beforeprint", beforePrint);
  window.addEventListener("afterprint", afterPrint);

  return () => {
    printMedia.removeEventListener("change", syncPrint);
    window.removeEventListener("beforeprint", beforePrint);
    window.removeEventListener("afterprint", afterPrint);
    resizeObserver.disconnect();
    tiles.off("tileload load tileunload", capturePrintView);
    map.off("moveend zoomend resize", redraw);
    map.remove();
    printContainer.replaceChildren();
  };
}

export function DestinationHeatmap(props: DestinationHeatmapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const printRef = useRef<HTMLDivElement | null>(null);
  const gradientId = `destination-heat-${useId().replaceAll(":", "")}`;
  const { points, mapTiles, locale, visitLabels } = props;
  useEffect(() => {
    if (!containerRef.current || !printRef.current) return;
    return mountDestinationHeatmap(containerRef.current, { points, mapTiles, locale, visitLabels }, gradientId, printRef.current);
  }, [points, mapTiles, locale, visitLabels, gradientId]);

  return (
    <>
      <div className="relative">
        <div ref={containerRef} role="region" aria-label={props.ariaLabel}
          className="h-[360px] w-full rounded-lg border border-neutral-300 dark:border-neutral-700 sm:h-[420px] print:hidden" />
        <div ref={printRef} role="img" aria-label={props.ariaLabel} data-destination-print-map
          className="pointer-events-none invisible absolute inset-0 overflow-hidden print:visible print:static print:overflow-visible" />
        {mappedPoints(points).length === 0 && <p className="pointer-events-none absolute inset-x-4 top-16 z-[500] rounded-lg bg-white/95 px-4 py-3 text-center text-sm text-neutral-600 shadow-sm dark:bg-neutral-900/95 dark:text-neutral-300">{props.emptyLabel}</p>}
      </div>
      <p className="mt-2 flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
        <span aria-hidden="true" className="h-2 w-16 shrink-0 rounded-full bg-gradient-to-r from-teal-100 to-teal-700" />
        {props.intensityLabel}
      </p>
    </>
  );
}
