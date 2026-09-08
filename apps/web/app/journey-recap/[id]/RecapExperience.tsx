"use client";

import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  BatteryCharging,
  ChevronLeft,
  ChevronRight,
  FastForward,
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
  buildRecapRoute,
  buildRecapTimeline,
  recapPosition,
  type RecapRouteTrack,
} from "../../../lib/journeyRecap";
import { BrandWordmark } from "../../../components/BrandWordmark";
import styles from "./RecapExperience.module.css";
import { SceneCanvas, type RecapMotion } from "./SceneCanvas";

interface RecapJourney {
  id: number | null;
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
  presentation?: {
    backHref: string;
    backLabel: string;
    eyebrow: string;
    dateLabel?: string;
    finaleEyebrow: string;
    finaleTitle: string;
    scrollHint?: string;
    chaptersLabel?: string;
  };
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

function formatDuration(seconds: number | null, locale: string): string {
  if (seconds == null) return "–";
  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
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
  const [playing, setPlaying] = useState(true);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.25);
  const [reducedMotion, setReducedMotion] = useState(false);
  const recapRef = useRef<HTMLElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLElement>(null);
  const layoutRef = useRef({ top: 0, unit: 1 });
  const motion = useRef<RecapMotion>({ route: 0, overview: 1, reduced: false });
  const scrollAnimationRef = useRef<number | null>(null);
  const chapters = useMemo<Chapter[]>(
    () => [
      { kind: "intro", key: "intro" },
      ...data.items.map((item, itemIndex) => ({
        kind: "item" as const, key: `${item.kind}-${item.id}`, item, itemIndex,
      })),
      { kind: "finale", key: "finale" },
    ], [data.items],
  );
  const route = useMemo(() => buildRecapRoute(data.items, data.tracks), [data.items, data.tracks]);
  const timeline = useMemo(() => buildRecapTimeline(data.items, route.chapterProgress), [data.items, route]);
  const driveOrdinalByItemIndex = useMemo(() => {
    let ordinal = 0;
    return data.items.map((item) => {
      if (item.kind === "drive") ordinal += 1;
      return ordinal;
    });
  }, [data.items]);
  const chargeOrdinalByItemIndex = useMemo(() => {
    let ordinal = 0;
    return data.items.map((item) => {
      if (item.kind === "charge") ordinal += 1;
      return ordinal;
    });
  }, [data.items]);
  const hasActualRoute = route.points.length >= 2;
  const hasPlan = data.plannedRoute.length >= 2;
  const activeChapter = chapters[chapterIndex] ?? chapters[0];

  const stopPlayback = useCallback(() => {
    if (scrollAnimationRef.current != null) {
      cancelAnimationFrame(scrollAnimationRef.current);
      scrollAnimationRef.current = null;
    }
    setPlaying(false);
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => {
      motion.current.reduced = media.matches;
      setReducedMotion(media.matches);
      if (media.matches) stopPlayback();
    };
    apply(); media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [stopPlayback]);

  useEffect(() => {
    let frame = 0;
    let width = window.innerWidth;
    const sync = () => {
      const { top, unit } = layoutRef.current;
      const position = Math.max(0, (window.scrollY - top) / unit);
      const current = recapPosition(timeline, position);
      const last = timeline.length - 1;
      motion.current.route = reducedMotion ? 1 : current.routeProgress;
      motion.current.overview = reducedMotion ? 1 : current.index === 0 ?
        1 - current.fraction : current.index === last ? current.fraction : 0;
      setChapterIndex((index) => index === current.index ? index : current.index);
      if (progressRef.current) progressRef.current.style.transform =
        `scaleX(${Math.min(1, position / timeline[last].start)})`;
    };
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => { frame = 0; sync(); });
    };
    const measure = () => {
      layoutRef.current = {
        top: window.scrollY + (recapRef.current?.getBoundingClientRect().top ?? 0),
        unit: viewportRef.current?.clientHeight || window.innerHeight,
      };
      sync();
    };
    const resize = () => {
      if (window.matchMedia("(pointer: coarse)").matches && width === window.innerWidth) return;
      width = window.innerWidth; measure();
    };
    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", resize);
    };
  }, [timeline, reducedMotion]);

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (["ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End", " "].includes(event.key)) stopPlayback();
    };
    window.addEventListener("wheel", stopPlayback, { passive: true });
    window.addEventListener("touchstart", stopPlayback, { passive: true });
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("wheel", stopPlayback);
      window.removeEventListener("touchstart", stopPlayback);
      window.removeEventListener("keydown", key);
    };
  }, [stopPlayback]);

  const goTo = useCallback((index: number, behavior?: ScrollBehavior) => {
    const next = Math.max(0, Math.min(timeline.length - 1, index));
    const segment = timeline[next];
    const { top, unit } = layoutRef.current;
    const position = next === timeline.length - 1 ? segment.end :
      segment.start + (next === 0 ? 0 : (segment.end - segment.start) * 0.12);
    const target = top + position * unit;
    stopPlayback();
    if (reducedMotion || behavior === "auto") {
      setChapterIndex(next);
      window.scrollTo({ top: target, behavior: "auto" });
      return;
    }
    const start = window.scrollY;
    const began = performance.now();
    const animate = (time: number) => {
      const fraction = Math.min(1, (time - began) / 650);
      const eased = fraction * fraction * (3 - 2 * fraction);
      window.scrollTo({ top: start + (target - start) * eased, behavior: "auto" });
      scrollAnimationRef.current = fraction < 1 ? requestAnimationFrame(animate) : null;
    };
    scrollAnimationRef.current = requestAnimationFrame(animate);
  }, [timeline, reducedMotion, stopPlayback]);

  useEffect(() => {
    if (!playing || reducedMotion) return;
    let frame = 0, previous = 0;
    let position = Math.max(0, (window.scrollY - layoutRef.current.top) / layoutRef.current.unit);
    const end = timeline[timeline.length - 1].end;
    const advance = (time: number) => {
      if (document.hidden) previous = 0;
      else {
        const elapsed = previous ? Math.min(80, time - previous) : 0;
        previous = time;
        position = Math.min(end, position + elapsed * playbackSpeed / 4500);
        const { top, unit } = layoutRef.current;
        window.scrollTo({ top: top + position * unit, behavior: "auto" });
      }
      if (position < end) frame = requestAnimationFrame(advance);
      else setPlaying(false);
    };
    frame = requestAnimationFrame(advance);
    return () => cancelAnimationFrame(frame);
  }, [playing, playbackSpeed, reducedMotion, timeline]);

  useEffect(() => () => {
    if (scrollAnimationRef.current != null) cancelAnimationFrame(scrollAnimationRef.current);
  }, []);

  const dateRange = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: data.timeZone,
  });
  const journeyDates =
    data.presentation?.dateLabel ??
    `${dateRange.format(new Date(data.journey.startTime))} – ${dateRange.format(new Date(data.journey.endTime))}`;
  const backHref =
    data.presentation?.backHref ??
    (data.journey.id != null ? `/journeys/${data.journey.id}` : "/journeys");

  const renderChapterContent = (chapter: Chapter) => {
    if (chapter.kind === "intro") {
      return (
        <>
          <p className={styles.eyebrow}>
            <Sparkles aria-hidden size={15} />
            {data.presentation?.eyebrow ?? t("eyebrow")}
          </p>
          <h2 className={styles.heroTitle}>{data.journey.name}</h2>
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
            {data.presentation?.finaleEyebrow ?? t("finaleEyebrow")}
          </p>
          <h2 className={styles.chapterTitle}>
            {data.presentation?.finaleTitle ?? t("finaleTitle")}
          </h2>
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
            <span>·</span>
            {new Intl.DateTimeFormat(locale, {
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
              timeZone: data.timeZone,
            }).format(new Date(item.startTime))}
          </p>
          <p className={styles.routeOrigin}>
            <span>{from}</span>
            <ArrowRight aria-hidden size={16} />
          </p>
          <h2 className={styles.chapterTitle}>{to}</h2>
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
          <span>·</span>
          {chargeOrdinalByItemIndex[chapter.itemIndex]} / {data.totals.chargeStops}
        </p>
        <h2 className={styles.chapterTitle}>
          {item.place ?? t("chargingStop")}
        </h2>
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
    >
      <h1 className={styles.srOnly}>{data.journey.name}</h1>
      <div ref={viewportRef} className={styles.viewport}>
        <SceneCanvas route={route} plannedRoute={data.plannedRoute} motion={motion} />
        <div className={styles.compass} aria-hidden><span>N</span><i /></div>
        <div className={styles.scrim} aria-hidden />
        <section className={styles.storyPanel} aria-label={t("chapter", { current: chapterIndex + 1, total: chapters.length })}>
          <div key={activeChapter.key} className={styles.story}>
            {renderChapterContent(activeChapter)}
          </div>
        </section>
      </div>
      <div className={styles.topProgress} aria-hidden><i ref={progressRef} /></div>

      <header className={styles.header}>
        <Link href={backHref} className={styles.backLink}>
          <ArrowLeft aria-hidden size={17} />
          <span>{data.presentation?.backLabel ?? t("back")}</span>
        </Link>
        <BrandWordmark size="sm" className={styles.wordmark} />
        <div className={styles.controls}>
          {reducedMotion && <span className={styles.motionBadge}>{t("reducedMotion")}</span>}
          {!reducedMotion && <label className={styles.speedControl}>
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
          </label>}
          {!reducedMotion && <button
            type="button"
            onClick={() => {
              if (playing) stopPlayback();
              else {
                if (chapterIndex === chapters.length - 1) goTo(0, "auto");
                setPlaying(true);
              }
            }}
            aria-label={playing ? t("pause") : t("play")}
            className={styles.iconButton}
          >
            {playing ? <Pause aria-hidden size={17} /> : <Play aria-hidden size={17} />}
          </button>}
          <button
            type="button"
            onClick={() => {
              setPlaying(false);
              goTo(chapters.length - 1);
            }}
            className={styles.skipButton}
            aria-label={t("skip")}
          >
            <FastForward aria-hidden size={15} />
            <span>{t("skip")}</span>
          </button>
        </div>
      </header>

      <div className={styles.chaptersFlow} aria-hidden>
        {timeline.map((segment, index) => (
          <div key={chapters[index].key} id={`recap-chapter-${index}`}
            style={{ height: `${(segment.end - segment.start) * 100}svh` }} />
        ))}
      </div>

      <nav
        className={styles.chapterNav}
        aria-label={data.presentation?.chaptersLabel ?? t("chaptersLabel")}
      >
        <button
          type="button"
          className={styles.navArrow}
          onClick={() => goTo(chapterIndex - 1)}
          disabled={chapterIndex === 0}
          aria-label={t("previous")}
        >
          <ChevronLeft aria-hidden size={18} />
        </button>
        <div className={styles.routeRail}>
          <div className={styles.railMeta} aria-hidden>
            <span>{String(chapterIndex + 1).padStart(2, "0")}</span>
            <strong>
              {activeChapter.kind === "intro"
                ? t("start")
                : activeChapter.kind === "finale"
                  ? t("finish")
                  : activeChapter.item.kind === "charge"
                    ? t("chargeShort")
                    : t("legShort", {
                        number: driveOrdinalByItemIndex[activeChapter.itemIndex],
                      })}
            </strong>
            <span>{String(chapters.length).padStart(2, "0")}</span>
          </div>
          <div className={styles.railControl}>
            <input
              type="range"
              min="0"
              max={chapters.length - 1}
              step="1"
              value={chapterIndex}
              onChange={(event) => {
                setPlaying(false);
                goTo(Number(event.target.value), "auto");
              }}
              style={{ "--rail-progress": `${chapterIndex / Math.max(1, chapters.length - 1) * 100}%` } as CSSProperties}
              aria-label={data.presentation?.chaptersLabel ?? t("chaptersLabel")}
              aria-valuetext={t("chapter", {
                current: chapterIndex + 1,
                total: chapters.length,
              })}
            />
            <span className={styles.railStart} aria-hidden />
            {chapters.map((chapter, index) =>
              chapter.kind === "item" && chapter.item.kind === "charge" ? (
                <i
                  key={chapter.key}
                  className={styles.chargeMarker}
                  style={{ left: `${(index / Math.max(1, chapters.length - 1)) * 100}%` }}
                  aria-hidden
                />
              ) : null,
            )}
            <span className={styles.railFinish} aria-hidden />
          </div>
        </div>
        <button
          type="button"
          className={styles.navArrow}
          onClick={() => goTo(chapterIndex + 1)}
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
        <span>{data.presentation?.scrollHint ?? t("scrollHint")}</span>
      </div>
    </main>
  );
}
