"use client";

import { useEffect, useMemo, useRef, type RefObject } from "react";
import type { buildRecapRoute } from "../../../lib/journeyRecap";
import styles from "./RecapExperience.module.css";

export interface RecapMotion {
  route: number;
  overview: number;
  reduced: boolean;
  charging: boolean;
}

type RouteData = ReturnType<typeof buildRecapRoute>;
type Point = { x: number; z: number; distance: number; breakBefore: boolean };

function prepareScene(route: RouteData, planned: [number, number][]) {
  const coordinates = [...route.points.map((point) => point.coordinates), ...planned];
  let minLat = Infinity, maxLat = -Infinity, minLon = Infinity, maxLon = -Infinity;
  for (const [lat, lon] of coordinates) {
    minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat);
    minLon = Math.min(minLon, lon); maxLon = Math.max(maxLon, lon);
  }
  if (!coordinates.length) minLat = maxLat = minLon = maxLon = 0;
  const latitude = (minLat + maxLat) / 2;
  const longitude = (minLon + maxLon) / 2;
  const correction = Math.cos(latitude * Math.PI / 180);
  const span = Math.max(maxLat - minLat, (maxLon - minLon) * correction, 0.0001);
  const point = ([lat, lon]: [number, number]) => ({
    x: (lon - longitude) * correction / span,
    z: (lat - latitude) / span,
  });
  return {
    actual: route.points.map((p) => ({ ...point(p.coordinates), distance: p.distance, breakBefore: p.breakBefore })),
    planned: planned.map((p, i) => ({ ...point(p), distance: i, breakBefore: i === 0 })),
    length: route.totalDistance,
  };
}

function atDistance(points: Point[], distance: number) {
  if (!points.length) return { x: 0, z: 0 };
  let low = 0, high = points.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (points[middle].distance < distance) low = middle + 1;
    else high = middle;
  }
  const to = points[low], from = points[Math.max(0, low - 1)];
  const fraction = Math.max(0, Math.min(1, (distance - from.distance) / (to.distance - from.distance || 1)));
  return { x: from.x + (to.x - from.x) * fraction, z: from.z + (to.z - from.z) * fraction };
}

export function SceneCanvas({ route, plannedRoute, motion }: {
  route: RouteData;
  plannedRoute: [number, number][];
  motion: RefObject<RecapMotion>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scene = useMemo(() => prepareScene(route, plannedRoute), [route, plannedRoute]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    let width = 1, height = 1, frame = 0, lastTime = 0;
    let progress = motion.current.route, overview = motion.current.overview;
    let focus = atDistance(scene.actual, progress * scene.length);
    let dirty = true;
    let charging = motion.current.charging;
    let palette = { ink: "", accent: "", muted: "", paper: "", charge: "" };
    const readPalette = () => {
      const css = getComputedStyle(canvas);
      palette = {
        charge: css.getPropertyValue("--recap-charge").trim(),
        ink: css.getPropertyValue("--recap-ink").trim(),
        accent: css.getPropertyValue("--recap-accent").trim(),
        muted: css.getPropertyValue("--recap-muted").trim(),
        paper: css.getPropertyValue("--recap-paper").trim(),
      };
      dirty = true;
    };
    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, canvas.clientWidth < 760 ? 1.5 : 2);
      width = canvas.clientWidth; height = canvas.clientHeight;
      canvas.width = Math.max(1, Math.floor(width * ratio));
      canvas.height = Math.max(1, Math.floor(height * ratio));
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      dirty = true;
    };
    const project = (point: { x: number; z: number }) => {
      const compact = width < 760;
      const scale = Math.min(width * (compact ? 0.9 : 0.54), height * 0.85) * (1.8 - overview * 0.8);
      return {
        x: width * (compact ? 0.5 : 0.7) + (point.x - focus.x * (1 - overview)) * scale,
        y: height * (compact ? 0.3 : 0.48) - (point.z - focus.z * (1 - overview)) * scale * 0.82,
      };
    };
    const trace = (points: Point[], until: number) => {
      context.beginPath();
      for (let i = 0; i < points.length; i++) {
        const point = points[i];
        if (point.distance > until) {
          if (i > 0 && !point.breakBefore) {
            const end = project(atDistance(points, until));
            context.lineTo(end.x, end.y);
          }
          break;
        }
        const p = project(point);
        if (point.breakBefore) context.moveTo(p.x, p.y);
        else context.lineTo(p.x, p.y);
      }
    };
    const paint = () => {
      context.clearRect(0, 0, width, height);
      context.lineCap = "round"; context.lineJoin = "round";
      // Quiet contour rings provide depth without obscuring the real GPS line.
      context.strokeStyle = palette.accent;
      context.globalAlpha = 0.06;
      for (let i = 0; i < 7; i++) {
        const p = project({ x: (i % 3 - 1) * 0.32, z: (Math.floor(i / 3) - 1) * 0.4 });
        for (let ring = 1; ring < 4; ring++) {
          context.beginPath();
          context.ellipse(p.x, p.y, 35 + ring * 25, 16 + ring * 12, -0.2, 0, Math.PI * 2);
          context.lineWidth = 1; context.stroke();
        }
      }
      context.setLineDash([5, 7]);
      trace(scene.planned, Infinity);
      context.strokeStyle = palette.muted; context.globalAlpha = 0.5; context.lineWidth = 1.5; context.stroke();
      context.setLineDash([]);
      trace(scene.actual, Infinity);
      context.strokeStyle = palette.accent; context.globalAlpha = 0.36; context.lineWidth = 2; context.stroke();
      trace(scene.actual, progress * scene.length);
      context.globalAlpha = 1; context.lineWidth = 3; context.stroke();
      for (let i = 0; i < scene.actual.length; i++) {
        const point = scene.actual[i];
        if (i < scene.actual.length - 1 && !scene.actual[i + 1].breakBefore) continue;
        const p = project(point);
        context.beginPath(); context.arc(p.x, p.y, 3, 0, Math.PI * 2);
        context.fillStyle = palette.paper; context.fill();
        context.globalAlpha = point.distance <= progress * scene.length ? 0.8 : 0.3;
        context.lineWidth = 1.5; context.stroke();
      }
      if (scene.actual.length && overview < 0.98) {
        const p = project(atDistance(scene.actual, progress * scene.length));
        context.globalAlpha = 0.13 * (1 - overview);
        context.beginPath(); context.arc(p.x, p.y, charging ? 26 : 17, 0, Math.PI * 2);
        context.fillStyle = charging ? palette.charge : palette.accent; context.fill();
        context.globalAlpha = 1 - overview;
        context.beginPath(); context.arc(p.x, p.y, charging ? 15 : 6, 0, Math.PI * 2); context.fill();
        context.lineWidth = 2; context.strokeStyle = palette.paper; context.stroke();
        if (charging) {
          context.beginPath();
          context.moveTo(p.x + 2, p.y - 9);
          context.lineTo(p.x - 6, p.y + 1);
          context.lineTo(p.x, p.y + 1);
          context.lineTo(p.x - 2, p.y + 9);
          context.lineTo(p.x + 6, p.y - 1);
          context.lineTo(p.x, p.y - 1);
          context.closePath();
          context.fillStyle = palette.paper; context.fill();
        }
      }
      context.globalAlpha = 1;
    };
    const draw = (timestamp: number) => {
      const dt = Math.min(64, lastTime ? timestamp - lastTime : 16.67);
      lastTime = timestamp;
      const { route: target, overview: targetOverview, reduced } = motion.current;
      const damping = reduced ? 1 : 1 - Math.exp(-dt / 125);
      const nextFocus = atDistance(scene.actual, target * scene.length);
      const moving = Math.abs(target - progress) > 0.000001 || Math.abs(targetOverview - overview) > 0.0001 ||
        Math.abs(nextFocus.x - focus.x) + Math.abs(nextFocus.z - focus.z) > 0.00001;
      if (dirty || moving || charging !== motion.current.charging) {
        charging = motion.current.charging;
        progress += (target - progress) * damping;
        overview += (targetOverview - overview) * damping;
        focus = { x: focus.x + (nextFocus.x - focus.x) * damping, z: focus.z + (nextFocus.z - focus.z) * damping };
        paint(); dirty = false;
      }
      frame = requestAnimationFrame(draw);
    };
    resize(); readPalette();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    const theme = new MutationObserver(readPalette);
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    frame = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); theme.disconnect(); };
  }, [scene, motion]);

  return <canvas ref={canvasRef} className={styles.canvas} aria-hidden />;
}
