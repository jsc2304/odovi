"use client";

import Link from "next/link";
import {
  ArrowLeft,
  BatteryCharging,
  ChevronLeft,
  ChevronRight,
  FastForward,
  MapPin,
  Mouse,
  Pause,
  Play,
  Route,
  Sparkles,
  Timer,
  Zap,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import {
  useEffect,
  useCallback,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  buildChapterRouteProgress,
  type RecapRouteTrack,
} from "../../../lib/journeyRecap";
import styles from "./RecapExperience.module.css";

interface RecapJourney {
  id: number;
  name: string;
  type: string;
  startTime: string;
  endTime: string;
  color: string;
  description: string | null;
}

interface RecapDriveItem {
  kind: "drive";
  id: number;
  startTime: string;
  distanceKm: number | null;
  durationSeconds: number | null;
  energyKwh: number | null;
  startSoc: number | null;
  endSoc: number | null;
  from: string | null;
  to: string | null;
}

interface RecapChargeItem {
  kind: "charge";
  id: number;
  startTime: string;
  durationSeconds: number | null;
  energyKwh: number | null;
  startSoc: number | null;
  endSoc: number | null;
  maxPowerKw: number | null;
  place: string | null;
}

type RecapItem = RecapDriveItem | RecapChargeItem;

export interface JourneyRecapData {
  timeZone: string;
  journey: RecapJourney;
  items: RecapItem[];
  tracks: RecapRouteTrack[];
  plannedRoute: [number, number][];
  totals: {
    distanceKm: number;
    driveTimeSeconds: number;
    chargeTimeSeconds: number;
    chargeStops: number;
    consumedEnergyKwh: number;
    chargedEnergyKwh: number;
    startSoc: number | null;
    endSoc: number | null;
  };
}

type Chapter =
  | { kind: "intro"; key: string }
  | { kind: "item"; key: string; item: RecapItem; itemIndex: number }
  | { kind: "finale"; key: string };

interface WorldPoint {
  x: number;
  y: number;
  z: number;
}

interface SceneData {
  actual: WorldPoint[];
  planned: WorldPoint[];
  markers: { point: WorldPoint; progress: number }[];
}

function buildSceneData(
  tracks: RecapRouteTrack[],
  plannedRoute: [number, number][],
): SceneData {
  const actualGeo = tracks.flatMap((track) => track.points);
  const all = [...actualGeo, ...plannedRoute];
  if (all.length === 0) return { actual: [], planned: [], markers: [] };

  const lats = all.map((point) => point[0]);
  const lons = all.map((point) => point[1]);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const centerLat = (minLat + maxLat) / 2;
  const centerLon = (minLon + maxLon) / 2;
  const span = Math.max(maxLat - minLat, maxLon - minLon, 0.0001);

  const map = (points: [number, number][], heightOffset: number): WorldPoint[] =>
    points.map(([lat, lon], index) => {
      const progress = points.length > 1 ? index / (points.length - 1) : 0;
      return {
        x: ((lon - centerLon) / span) * 10,
        y:
          Math.sin(progress * Math.PI * 5) * 0.22 +
          Math.sin(progress * Math.PI * 11) * 0.08 +
          heightOffset,
        // Geographic north stays at the top of the scene. A larger latitude
        // therefore maps to positive world-Z, which projects upwards below.
        z: ((lat - centerLat) / span) * 10,
      };
    });

  const actual = map(actualGeo, 0.12);
  let pointOffset = 0;
  const markerIndexes = tracks.flatMap((track) => {
    pointOffset += track.points.length;
    return track.points.length > 0 ? [pointOffset - 1] : [];
  });

  return {
    actual,
    planned: map(plannedRoute, -0.12),
    markers: markerIndexes.map((index) => ({
      point: actual[index],
      progress: actual.length > 1 ? index / (actual.length - 1) : 1,
    })),
  };
}

function hexToRgb(hex: string): [number, number, number] {
  const normalized = hex.replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(normalized)) return [139, 92, 246];
  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16),
  ];
}

function SceneCanvas({
  tracks,
  plannedRoute,
  color,
  targetProgress,
  scrollProgress,
  chapterCount,
  ambientMotion,
  reducedMotion,
}: {
  tracks: RecapRouteTrack[];
  plannedRoute: [number, number][];
  color: string;
  targetProgress: number;
  scrollProgress: number;
  chapterCount: number;
  ambientMotion: boolean;
  reducedMotion: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const targetRef = useRef(targetProgress);
  const scrollRef = useRef(scrollProgress);
  const motionRef = useRef(ambientMotion);
  const reducedMotionRef = useRef(reducedMotion);
  const scene = useMemo(
    () => buildSceneData(tracks, plannedRoute),
    [tracks, plannedRoute],
  );

  useEffect(() => {
    targetRef.current = targetProgress;
  }, [targetProgress]);

  useEffect(() => {
    scrollRef.current = scrollProgress;
  }, [scrollProgress]);

  useEffect(() => {
    motionRef.current = ambientMotion;
  }, [ambientMotion]);

  useEffect(() => {
    reducedMotionRef.current = reducedMotion;
  }, [reducedMotion]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const [red, green, blue] = hexToRgb(color);
    const pointer = { x: 0, y: 0 };
    const stars = Array.from({ length: 80 }, (_, index) => ({
      x: ((index * 67) % 101) / 101,
      y: ((index * 43 + 17) % 97) / 97,
      size: 0.5 + ((index * 29) % 17) / 14,
      alpha: 0.12 + ((index * 19) % 23) / 50,
    }));
    let width = 1;
    let height = 1;
    let currentProgress = targetRef.current;
    let animationFrame = 0;
    let frozenTime = performance.now();
    let cameraFocus: WorldPoint = { x: 0, y: 0, z: 0 };

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.max(1, Math.floor(width * ratio));
      canvas.height = Math.max(1, Math.floor(height * ratio));
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };

    const onPointerMove = (event: PointerEvent) => {
      pointer.x = (event.clientX / Math.max(1, width) - 0.5) * 2;
      pointer.y = (event.clientY / Math.max(1, height) - 0.5) * 2;
    };

    const pointAtProgress = (points: WorldPoint[], progress: number): WorldPoint => {
      if (points.length === 0) return { x: 0, y: 0, z: 0 };
      if (points.length === 1) return points[0];
      const position = Math.max(0, Math.min(1, progress)) * (points.length - 1);
      const startIndex = Math.floor(position);
      const endIndex = Math.min(points.length - 1, startIndex + 1);
      const fraction = position - startIndex;
      const start = points[startIndex];
      const end = points[endIndex];
      return {
        x: start.x + (end.x - start.x) * fraction,
        y: start.y + (end.y - start.y) * fraction,
        z: start.z + (end.z - start.z) * fraction,
      };
    };

    const project = (point: WorldPoint, time: number) => {
      const journeyProgress = scrollRef.current;
      // Keep compass orientation stable: yaw would rotate north away from the
      // top of the screen. Motion now comes from pitch, zoom and camera travel.
      const yaw = 0;
      const pitch =
        0.78 + Math.sin(journeyProgress * Math.PI) * 0.18 + pointer.y * 0.025;
      const cosYaw = Math.cos(yaw);
      const sinYaw = Math.sin(yaw);
      const cosPitch = Math.cos(pitch);
      const sinPitch = Math.sin(pitch);
      const relativeX = point.x - cameraFocus.x;
      const relativeY = point.y - cameraFocus.y;
      const relativeZ = point.z - cameraFocus.z;
      const rotatedX = relativeX * cosYaw - relativeZ * sinYaw;
      const rotatedZ = relativeX * sinYaw + relativeZ * cosYaw;
      const rotatedY = relativeY * cosPitch - rotatedZ * sinPitch;
      const depth = relativeY * sinPitch + rotatedZ * cosPitch + 11;
      const chapterPosition = journeyProgress * Math.max(1, chapterCount - 1);
      const chapterStart = Math.floor(chapterPosition);
      const chapterFraction = chapterPosition - chapterStart;
      const easedFraction = chapterFraction * chapterFraction * (3 - 2 * chapterFraction);
      const zoomForChapter = (index: number) =>
        [0.94, 1.1, 0.99, 1.16][Math.max(0, index) % 4];
      const chapterZoom =
        zoomForChapter(chapterStart) +
        (zoomForChapter(chapterStart + 1) - zoomForChapter(chapterStart)) *
          easedFraction;
      const transitionZoom = 1 + Math.sin(chapterFraction * Math.PI) * 0.1;
      const ambientDrift = motionRef.current ? Math.sin(time * 0.00035) * 4 : 0;
      const scale =
        ((Math.min(width, height) * 1.32) / Math.max(4.5, depth)) *
        chapterZoom *
        transitionZoom;
      const compact = width < 760;
      return {
        x:
          width * (compact ? 0.62 : 0.72) +
          rotatedX * scale +
          pointer.x * 5 +
          ambientDrift,
        y: height * (compact ? 0.31 : 0.46) + rotatedY * scale,
        scale,
      };
    };

    const drawRoute = (
      points: WorldPoint[],
      progress: number,
      stroke: string,
      lineWidth: number,
      time: number,
      dash: number[] = [],
    ) => {
      if (points.length < 2 || progress <= 0) return;
      const lastFloat = Math.min(points.length - 1, progress * (points.length - 1));
      const lastIndex = Math.floor(lastFloat);
      context.beginPath();
      const first = project(points[0], time);
      context.moveTo(first.x, first.y);
      for (let index = 1; index <= lastIndex; index += 1) {
        const projected = project(points[index], time);
        context.lineTo(projected.x, projected.y);
      }
      if (lastIndex < points.length - 1) {
        const from = points[lastIndex];
        const to = points[lastIndex + 1];
        const fraction = lastFloat - lastIndex;
        const projected = project(
          {
            x: from.x + (to.x - from.x) * fraction,
            y: from.y + (to.y - from.y) * fraction,
            z: from.z + (to.z - from.z) * fraction,
          },
          time,
        );
        context.lineTo(projected.x, projected.y);
      }
      context.setLineDash(dash);
      context.lineCap = "round";
      context.lineJoin = "round";
      context.lineWidth = lineWidth;
      context.strokeStyle = stroke;
      context.stroke();
      context.setLineDash([]);
    };

    const draw = (timestamp: number) => {
      if (motionRef.current) frozenTime = timestamp;
      const time = motionRef.current ? timestamp : frozenTime;
      currentProgress +=
        (targetRef.current - currentProgress) *
        (reducedMotionRef.current ? 1 : 0.065);
      const cameraRoute = scene.actual.length > 0 ? scene.actual : scene.planned;
      cameraFocus = pointAtProgress(
        cameraRoute,
        scene.actual.length > 0 ? currentProgress : scrollRef.current,
      );
      context.clearRect(0, 0, width, height);

      for (const star of stars) {
        const shimmer = motionRef.current
          ? 0.82 + Math.sin(time * 0.001 + star.x * 20) * 0.18
          : 1;
        context.beginPath();
        context.arc(star.x * width, star.y * height, star.size, 0, Math.PI * 2);
        context.fillStyle = `rgba(255,255,255,${star.alpha * shimmer})`;
        context.fill();
      }

      drawRoute(
        scene.planned,
        1,
        "rgba(111, 224, 255, 0.24)",
        1.4,
        time,
        [4, 8],
      );
      drawRoute(
        scene.actual,
        1,
        `rgba(${red},${green},${blue},0.16)`,
        2,
        time,
        [2, 9],
      );
      drawRoute(
        scene.actual,
        currentProgress,
        `rgba(${red},${green},${blue},0.14)`,
        16,
        time,
      );
      drawRoute(
        scene.actual,
        currentProgress,
        `rgba(${red},${green},${blue},0.45)`,
        7,
        time,
      );
      drawRoute(
        scene.actual,
        currentProgress,
        "rgba(255,255,255,0.94)",
        2,
        time,
      );

      for (const marker of scene.markers) {
        const point = project(marker.point, time);
        const reached = marker.progress <= currentProgress + 0.002;
        context.beginPath();
        context.arc(point.x, point.y, reached ? 4.5 : 3, 0, Math.PI * 2);
        context.fillStyle = reached
          ? "rgba(255,255,255,0.96)"
          : `rgba(${red},${green},${blue},0.28)`;
        context.fill();
        context.lineWidth = reached ? 3 : 1;
        context.strokeStyle = reached
          ? `rgba(${red},${green},${blue},0.52)`
          : "rgba(255,255,255,0.16)";
        context.stroke();
      }

      if (scene.actual.length > 0 && currentProgress > 0) {
        const point = project(pointAtProgress(scene.actual, currentProgress), time);
        const pulse = motionRef.current ? 1 + Math.sin(time * 0.006) * 0.2 : 1;
        const glow = context.createRadialGradient(
          point.x,
          point.y,
          0,
          point.x,
          point.y,
          30 * pulse,
        );
        glow.addColorStop(0, "rgba(255,255,255,0.96)");
        glow.addColorStop(0.18, `rgba(${red},${green},${blue},0.9)`);
        glow.addColorStop(1, `rgba(${red},${green},${blue},0)`);
        context.beginPath();
        context.arc(point.x, point.y, 30 * pulse, 0, Math.PI * 2);
        context.fillStyle = glow;
        context.fill();
      }

      animationFrame = requestAnimationFrame(draw);
    };

    resize();
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    animationFrame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(animationFrame);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointerMove);
    };
  }, [chapterCount, color, scene]);

  return <canvas ref={canvasRef} className={styles.canvas} aria-hidden />;
}

function formatDuration(seconds: number | null, locale: string): string {
  if (seconds == null) return "–";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  const parts = new Intl.ListFormat(locale, { style: "short", type: "unit" });
  return parts.format([
    ...(hours > 0 ? [`${hours} h`] : []),
    `${minutes} min`,
  ]);
}

function formatNumber(value: number | null, locale: string, digits = 1): string {
  if (value == null) return "–";
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  }).format(value);
}

function Metric({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className={styles.metric}>
      <span className={styles.metricIcon}>{icon}</span>
      <span className={styles.metricLabel}>{label}</span>
      <strong className={styles.metricValue}>{value}</strong>
    </div>
  );
}

export function RecapExperience({ data }: { data: JourneyRecapData }) {
  const t = useTranslations("journeys.recap");
  const locale = useLocale();
  const [chapterIndex, setChapterIndex] = useState(0);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.25);
  const [reducedMotion, setReducedMotion] = useState(false);
  const recapRef = useRef<HTMLElement>(null);
  const chapterRefs = useRef<Array<HTMLElement | null>>([]);
  const scrollAnimationRef = useRef<number | null>(null);
  const lastRelativeNavigationRef = useRef(0);
  const chapters = useMemo<Chapter[]>(
    () => [
      { kind: "intro", key: "intro" },
      ...data.items.map((item, itemIndex) => ({
        kind: "item" as const,
        key: `${item.kind}-${item.id}`,
        item,
        itemIndex,
      })),
      { kind: "finale", key: "finale" },
    ],
    [data.items],
  );
  const chapterProgress = useMemo(
    () => buildChapterRouteProgress(data.items, data.tracks),
    [data.items, data.tracks],
  );
  const driveOrdinalByItemIndex = useMemo(() => {
    let ordinal = 0;
    return data.items.map((item) => {
      if (item.kind === "drive") ordinal += 1;
      return ordinal;
    });
  }, [data.items]);
  const routeTargets = useMemo(
    () => [
      data.tracks.length > 0 ? 0.025 : 0,
      ...chapterProgress,
      1,
    ],
    [chapterProgress, data.tracks.length],
  );
  const routePosition = scrollProgress * Math.max(0, routeTargets.length - 1);
  const routeStartIndex = Math.floor(routePosition);
  const routeEndIndex = Math.min(routeTargets.length - 1, routeStartIndex + 1);
  const routeFraction = routePosition - routeStartIndex;
  const targetProgress =
    (routeTargets[routeStartIndex] ?? 0) +
    ((routeTargets[routeEndIndex] ?? 0) - (routeTargets[routeStartIndex] ?? 0)) *
      routeFraction;
  const hasActualRoute = data.tracks.some((track) => track.points.length >= 2);
  const hasPlan = data.plannedRoute.length >= 2;

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const applyPreference = () => {
      setReducedMotion(media.matches);
      if (media.matches) setPlaying(false);
    };
    applyPreference();
    media.addEventListener("change", applyPreference);
    return () => media.removeEventListener("change", applyPreference);
  }, []);

  useEffect(() => {
    let frame = 0;
    const syncChapterToScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const sections = chapterRefs.current.filter(
          (section): section is HTMLElement => section != null,
        );
        if (sections.length === 0) return;
        const viewportCenter = window.scrollY + window.innerHeight / 2;
        const centers = sections.map((section) => {
          const rect = section.getBoundingClientRect();
          return window.scrollY + rect.top + rect.height / 2;
        });
        let chapterPosition = 0;
        if (viewportCenter >= centers[centers.length - 1]) {
          chapterPosition = centers.length - 1;
        } else if (viewportCenter > centers[0]) {
          const startIndex = centers.findIndex(
            (center, index) => index < centers.length - 1 && viewportCenter < centers[index + 1],
          );
          const startCenter = centers[startIndex];
          const endCenter = centers[startIndex + 1];
          chapterPosition =
            startIndex +
            (viewportCenter - startCenter) / Math.max(1, endCenter - startCenter);
        }
        const progress =
          sections.length > 1 ? chapterPosition / (sections.length - 1) : 0;
        setScrollProgress(progress);
        const nextIndex = Math.round(chapterPosition);
        setChapterIndex((currentIndex) =>
          currentIndex === nextIndex ? currentIndex : nextIndex,
        );
      });
    };

    syncChapterToScroll();
    window.addEventListener("scroll", syncChapterToScroll, { passive: true });
    window.addEventListener("resize", syncChapterToScroll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", syncChapterToScroll);
      window.removeEventListener("resize", syncChapterToScroll);
    };
  }, [chapters.length]);

  useEffect(() => {
    const stopAutoplay = () => {
      if (scrollAnimationRef.current != null) {
        cancelAnimationFrame(scrollAnimationRef.current);
        scrollAnimationRef.current = null;
      }
      setPlaying(false);
    };
    const stopAutoplayForKey = (event: KeyboardEvent) => {
      if (
        ["ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End", " "].includes(
          event.key,
        )
      ) {
        stopAutoplay();
      }
    };
    window.addEventListener("wheel", stopAutoplay, { passive: true });
    window.addEventListener("touchstart", stopAutoplay, { passive: true });
    window.addEventListener("keydown", stopAutoplayForKey);
    return () => {
      window.removeEventListener("wheel", stopAutoplay);
      window.removeEventListener("touchstart", stopAutoplay);
      window.removeEventListener("keydown", stopAutoplayForKey);
    };
  }, []);

  const goTo = useCallback(
    (index: number, behavior?: ScrollBehavior) => {
      const nextIndex = Math.max(0, Math.min(chapters.length - 1, index));
      setChapterIndex(nextIndex);
      const section = chapterRefs.current[nextIndex];
      if (!section) return;
      const rect = section.getBoundingClientRect();
      const targetTop = Math.max(
        0,
        window.scrollY + rect.top + (rect.height - window.innerHeight) / 2,
      );
      const resolvedBehavior = behavior ?? (reducedMotion ? "auto" : "smooth");
      if (scrollAnimationRef.current != null) {
        cancelAnimationFrame(scrollAnimationRef.current);
        scrollAnimationRef.current = null;
      }
      if (resolvedBehavior === "auto") {
        window.scrollTo({ top: targetTop, behavior: "auto" });
        return;
      }

      const startTop = window.scrollY;
      const distance = targetTop - startTop;
      const duration = Math.max(420, 1050 / playbackSpeed);
      const startTime = performance.now();
      const animate = (time: number) => {
        const progress = Math.min(1, (time - startTime) / duration);
        const eased = 1 - Math.pow(1 - progress, 4);
        window.scrollTo({ top: startTop + distance * eased, behavior: "auto" });
        if (progress < 1) {
          scrollAnimationRef.current = requestAnimationFrame(animate);
        } else {
          scrollAnimationRef.current = null;
        }
      };
      scrollAnimationRef.current = requestAnimationFrame(animate);
    },
    [chapters.length, playbackSpeed, reducedMotion],
  );

  const moveBy = useCallback(
    (delta: number) => {
      const now = performance.now();
      if (now - lastRelativeNavigationRef.current < 400) return;
      lastRelativeNavigationRef.current = now;
      goTo(chapterIndex + delta);
    },
    [chapterIndex, goTo],
  );

  useEffect(() => {
    if (!playing || reducedMotion) return;
    if (chapterIndex >= chapters.length - 1) {
      setPlaying(false);
      return;
    }
    const timer = window.setTimeout(
      () => goTo(chapterIndex + 1),
      (chapterIndex === 0 ? 4800 : 3600) / playbackSpeed,
    );
    return () => window.clearTimeout(timer);
  }, [chapterIndex, chapters.length, goTo, playbackSpeed, playing, reducedMotion]);

  useEffect(
    () => () => {
      if (scrollAnimationRef.current != null) {
        cancelAnimationFrame(scrollAnimationRef.current);
      }
    },
    [],
  );

  const dateRange = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: data.timeZone,
  });
  const journeyDates = `${dateRange.format(new Date(data.journey.startTime))} – ${dateRange.format(new Date(data.journey.endTime))}`;

  const renderChapterContent = (chapter: Chapter) => {
    if (chapter.kind === "intro") {
      return (
        <>
          <p className={styles.eyebrow}>
            <Sparkles aria-hidden size={15} />
            {t("eyebrow")}
          </p>
          <h1 className={styles.heroTitle}>{data.journey.name}</h1>
          <p className={styles.lead}>{journeyDates}</p>
          {data.journey.description && (
            <p className={styles.description}>{data.journey.description}</p>
          )}
          <div className={styles.routeLegend}>
            {hasActualRoute && <span><i className={styles.actualLine} />{t("actual")}</span>}
            {hasPlan && <span><i className={styles.plannedLine} />{t("planned")}</span>}
            {!hasActualRoute && !hasPlan && <span>{t("noRoute")}</span>}
          </div>
        </>
      );
    }

    if (chapter.kind === "finale") {
      return (
        <>
          <p className={styles.eyebrow}>
            <Sparkles aria-hidden size={15} />
            {t("finaleEyebrow")}
          </p>
          <h1 className={styles.chapterTitle}>{t("finaleTitle")}</h1>
          <p className={styles.lead}>{data.journey.name}</p>
          <div className={styles.metrics}>
            <Metric
              icon={<Route aria-hidden size={18} />}
              label={t("distance")}
              value={`${formatNumber(data.totals.distanceKm, locale)} km`}
            />
            <Metric
              icon={<Timer aria-hidden size={18} />}
              label={t("driveTime")}
              value={formatDuration(data.totals.driveTimeSeconds, locale)}
            />
            <Metric
              icon={<BatteryCharging aria-hidden size={18} />}
              label={t("chargeStops")}
              value={String(data.totals.chargeStops)}
            />
          </div>
        </>
      );
    }

    const { item } = chapter;
    if (item.kind === "drive") {
      const from = item.from ?? t("unknownPlace");
      const to = item.to ?? t("unknownPlace");
      return (
        <>
          <p className={styles.eyebrow}>
            <Route aria-hidden size={15} />
            {t("driveChapter", { number: driveOrdinalByItemIndex[chapter.itemIndex] })}
          </p>
          <h1 className={styles.chapterTitle}>
            <span>{from}</span>
            <em>→</em>
            <span>{to}</span>
          </h1>
          <div className={styles.metrics}>
            <Metric
              icon={<Route aria-hidden size={18} />}
              label={t("distance")}
              value={`${formatNumber(item.distanceKm, locale)} km`}
            />
            <Metric
              icon={<Timer aria-hidden size={18} />}
              label={t("duration")}
              value={formatDuration(item.durationSeconds, locale)}
            />
            <Metric
              icon={<Zap aria-hidden size={18} />}
              label={t("energyUsed")}
              value={`${formatNumber(item.energyKwh, locale)} kWh`}
            />
          </div>
          {(item.startSoc != null || item.endSoc != null) && (
            <p className={styles.socTrail}>
              {t("soc", {
                start: item.startSoc ?? "–",
                end: item.endSoc ?? "–",
              })}
            </p>
          )}
        </>
      );
    }

    return (
      <>
        <p className={styles.eyebrow}>
          <BatteryCharging aria-hidden size={15} />
          {t("chargeChapter")}
        </p>
        <h1 className={styles.chapterTitle}>
          {item.place ?? t("chargingStop")}
        </h1>
        <div className={styles.metrics}>
          <Metric
            icon={<BatteryCharging aria-hidden size={18} />}
            label={t("energyCharged")}
            value={`${formatNumber(item.energyKwh, locale)} kWh`}
          />
          <Metric
            icon={<Timer aria-hidden size={18} />}
            label={t("duration")}
            value={formatDuration(item.durationSeconds, locale)}
          />
          <Metric
            icon={<Zap aria-hidden size={18} />}
            label={t("peakPower")}
            value={`${formatNumber(item.maxPowerKw, locale, 0)} kW`}
          />
        </div>
        {(item.startSoc != null || item.endSoc != null) && (
          <p className={styles.socTrail}>
            {t("soc", {
              start: item.startSoc ?? "–",
              end: item.endSoc ?? "–",
            })}
          </p>
        )}
      </>
    );
  };

  return (
    <main
      ref={recapRef}
      className={styles.recap}
      style={{ "--journey-color": data.journey.color } as CSSProperties}
    >
      <div className={styles.viewport} data-playing={playing ? "true" : "false"}>
        <SceneCanvas
          tracks={data.tracks}
          plannedRoute={data.plannedRoute}
          color={data.journey.color}
          targetProgress={targetProgress}
          scrollProgress={scrollProgress}
          chapterCount={chapters.length}
          ambientMotion={playing && !reducedMotion}
          reducedMotion={reducedMotion}
        />
        <div className={styles.aurora} aria-hidden />
        <div className={styles.orbit} aria-hidden><i /><i /><i /></div>
        <div className={styles.compass} aria-hidden>
          <span>N</span>
          <i />
        </div>
        <div className={styles.scrim} aria-hidden />
      </div>

      <div className={styles.topProgress} aria-hidden>
        <i style={{ width: `${scrollProgress * 100}%` }} />
      </div>

      <header className={styles.header}>
        <Link href={`/journeys/${data.journey.id}`} className={styles.backLink}>
          <ArrowLeft aria-hidden size={17} />
          <span>{t("back")}</span>
        </Link>
        <div className={styles.wordmark}>
          <MapPin aria-hidden size={16} />
          Tripatlas
        </div>
        <div className={styles.controls}>
          {reducedMotion && <span className={styles.motionBadge}>{t("reducedMotion")}</span>}
          <label className={styles.speedControl}>
            <Zap aria-hidden size={13} />
            <input
              type="range"
              min="0.75"
              max="2"
              step="0.25"
              value={playbackSpeed}
              onChange={(event) => setPlaybackSpeed(Number(event.target.value))}
              aria-label={t("speed")}
            />
            <output>{playbackSpeed.toLocaleString(locale)}×</output>
          </label>
          <button
            type="button"
            onClick={() => {
              if (playing) {
                if (scrollAnimationRef.current != null) {
                  cancelAnimationFrame(scrollAnimationRef.current);
                  scrollAnimationRef.current = null;
                }
                setPlaying(false);
              } else {
                goTo(chapterIndex);
                setPlaying(true);
              }
            }}
            aria-label={playing ? t("pause") : t("play")}
            className={styles.iconButton}
          >
            {playing ? <Pause aria-hidden size={17} /> : <Play aria-hidden size={17} />}
          </button>
          <button
            type="button"
            onClick={() => {
              setPlaying(false);
              goTo(chapters.length - 1);
            }}
            className={styles.skipButton}
          >
            <FastForward aria-hidden size={15} />
            <span>{t("skip")}</span>
          </button>
        </div>
      </header>

      <div className={styles.chaptersFlow}>
        {chapters.map((chapter, index) => (
          <section
            key={chapter.key}
            ref={(section) => {
              chapterRefs.current[index] = section;
            }}
            id={`recap-chapter-${index}`}
            className={styles.chapterSection}
            data-active={index === chapterIndex ? "true" : undefined}
            aria-label={t("chapter", { current: index + 1, total: chapters.length })}
          >
            <div className={styles.story}>
              {renderChapterContent(chapter)}
            </div>
          </section>
        ))}
      </div>

      <nav
        className={styles.chapterNav}
        data-dense={chapters.length > 14 ? "true" : undefined}
        aria-label={t("chaptersLabel")}
      >
        <button
          type="button"
          className={styles.navArrow}
          onClick={() => moveBy(-1)}
          disabled={chapterIndex === 0}
          aria-label={t("previous")}
        >
          <ChevronLeft aria-hidden size={18} />
        </button>
        <ol className={styles.chapterList}>
          {chapters.map((chapter, index) => (
            <li key={chapter.key}>
              <button
                type="button"
                onClick={() => goTo(index)}
                className={index === chapterIndex ? styles.activeChapter : styles.chapterButton}
                aria-current={index === chapterIndex ? "step" : undefined}
                aria-label={t("chapter", { current: index + 1, total: chapters.length })}
              >
                <i />
                <span>
                  {chapter.kind === "intro"
                    ? t("start")
                    : chapter.kind === "finale"
                      ? t("finish")
                      : chapter.item.kind === "charge"
                        ? t("chargeShort")
                        : t("legShort", { number: driveOrdinalByItemIndex[chapter.itemIndex] })}
                </span>
              </button>
            </li>
          ))}
        </ol>
        <button
          type="button"
          className={styles.navArrow}
          onClick={() => moveBy(1)}
          disabled={chapterIndex === chapters.length - 1}
          aria-label={t("next")}
        >
          <ChevronRight aria-hidden size={18} />
        </button>
      </nav>

      <p className={styles.chapterCounter} aria-live="polite">
        {t("chapter", { current: chapterIndex + 1, total: chapters.length })}
      </p>
      <div
        className={styles.scrollHint}
        data-hidden={chapterIndex > 0 ? "true" : undefined}
      >
        <Mouse aria-hidden size={15} />
        <span>{t("scrollHint")}</span>
      </div>
    </main>
  );
}
