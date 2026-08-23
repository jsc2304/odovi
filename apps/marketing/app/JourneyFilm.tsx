"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";

const TRANSITION_DURATION = 5.04;
const FILM_DURATION = 8.25;

const stations = [
  { label: "Zürich", detail: "08:42" },
  { label: "Andermatt", detail: "11:18" },
  { label: "Lago Maggiore", detail: "15:06" },
];

function clamp(value: number) {
  return Math.min(1, Math.max(0, value));
}

export function JourneyFilm() {
  const rootRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!rootRef.current || !videoRef.current) return;

    const root: HTMLElement = rootRef.current;
    const video: HTMLVideoElement = videoRef.current;

    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const mobileFallback = window.matchMedia(
      "(max-width: 767px), (pointer: coarse)",
    ).matches;

    if (reducedMotion || mobileFallback) {
      root.dataset.mode = reducedMotion ? "reduced" : "mobile";
      root.dataset.phase = "arrived";
      root.dataset.active = "2";
      root.style.setProperty("--journey-progress", "1");
      return;
    }

    let cancelled = false;
    let hasEnded = false;
    let hasStarted = false;
    let isInView = false;
    let frame = 0;
    let scrollTrigger: import("gsap/ScrollTrigger").ScrollTrigger | undefined;
    let previousActive = "-1";
    let previousPhase = "transition";

    const paint = (time: number) => {
      const progress = clamp(
        (time - TRANSITION_DURATION) / (FILM_DURATION - TRANSITION_DURATION),
      );
      const phase =
        time < TRANSITION_DURATION
          ? "transition"
          : time > FILM_DURATION - 0.6
            ? "arrived"
            : "progress";
      const active =
        progress < 0.12 ? -1 : progress < 0.42 ? 0 : progress < 0.72 ? 1 : 2;

      root.style.setProperty("--journey-progress", progress.toFixed(4));

      if (String(active) !== previousActive) {
        previousActive = String(active);
        root.dataset.active = previousActive;
      }
      if (phase !== previousPhase) {
        previousPhase = phase;
        root.dataset.phase = phase;
      }
    };

    const stopFrame = () => {
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
    };

    const showStaticFallback = () => {
      stopFrame();
      video.pause();
      root.dataset.mode = "static";
      root.dataset.phase = "arrived";
      root.dataset.active = "2";
      root.style.setProperty("--journey-progress", "1");
    };

    const followPlayback = () => {
      stopFrame();
      const tick = () => {
        paint(video.currentTime);
        if (!video.paused && !video.ended) {
          frame = window.requestAnimationFrame(tick);
        }
      };
      frame = window.requestAnimationFrame(tick);
    };

    const playFilm = () => {
      if (!isInView || hasEnded || video.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) {
        return;
      }

      hasStarted = true;
      root.dataset.mode = "video";
      void video
        .play()
        .then(followPlayback)
        .catch(showStaticFallback);
    };

    const pauseFilm = () => {
      video.pause();
      stopFrame();
    };

    const handleCanPlay = () => playFilm();
    const handleEnded = () => {
      hasEnded = true;
      stopFrame();
      paint(FILM_DURATION);
    };
    const handleError = () => showStaticFallback();

    async function setupPlaybackStory() {
      const [{ gsap }, { ScrollTrigger }] = await Promise.all([
        import("gsap"),
        import("gsap/ScrollTrigger"),
      ]);

      if (cancelled) return;

      gsap.registerPlugin(ScrollTrigger);
      video.pause();
      video.load();

      scrollTrigger = ScrollTrigger.create({
        trigger: root,
        start: "top 72%",
        end: "bottom 28%",
        onToggle: ({ isActive }) => {
          isInView = isActive;
          if (isActive) playFilm();
          else if (hasStarted && !hasEnded) pauseFilm();
        },
      });

      ScrollTrigger.refresh();
    }

    video.addEventListener("canplay", handleCanPlay);
    video.addEventListener("ended", handleEnded);
    video.addEventListener("error", handleError);
    void setupPlaybackStory().catch(showStaticFallback);

    return () => {
      cancelled = true;
      scrollTrigger?.kill();
      stopFrame();
      video.pause();
      video.removeEventListener("canplay", handleCanPlay);
      video.removeEventListener("ended", handleEnded);
      video.removeEventListener("error", handleError);
    };
  }, []);

  return (
    <section
      aria-labelledby="journey-film-title"
      className="journey-film"
      data-active="-1"
      data-mode="poster"
      data-phase="transition"
      id="journey-film"
      ref={rootRef}
    >
      <div className="journey-film-sticky">
        <Image
          alt=""
          aria-hidden="true"
          className="journey-film-poster"
          fill
          sizes="100vw"
          src="/brand/memory-ribbon.webp"
          unoptimized
        />
        <Image
          alt=""
          aria-hidden="true"
          className="journey-film-fallback"
          fill
          sizes="100vw"
          src="/brand/night-cartography.webp"
          unoptimized
        />
        <video
          aria-hidden="true"
          className="journey-film-video"
          muted
          playsInline
          poster="/brand/memory-ribbon.webp"
          preload="metadata"
          ref={videoRef}
        >
          <source src="/brand/journey-film.webm" type="video/webm" />
          <source src="/brand/journey-film.mp4" type="video/mp4" />
        </video>

        <div className="journey-film-shade" aria-hidden="true" />

        <div className="journey-film-content shell">
          <div className="journey-film-copy">
            <p className="section-kicker">Journey 01 · Über die Alpen</p>
            <h2
              aria-label="Aus Fahrten wird deine Geschichte. Etappe für Etappe wieder lebendig. Deine Reise bis ins Detail."
              id="journey-film-title"
            >
              <span aria-hidden="true" className="journey-title-transition">Aus Fahrten wird deine Geschichte.</span>
              <span aria-hidden="true" className="journey-title-progress">Etappe für Etappe. Wieder lebendig.</span>
              <span aria-hidden="true" className="journey-title-arrived">Deine Reise. Bis ins Detail.</span>
            </h2>
            <p className="journey-copy-transition">
              Tripatlas verwandelt Telemetrie in deinen visuellen Reiserückblick.
            </p>
            <p className="journey-copy-progress">
              Zürich. Andermatt. Lago Maggiore. Jede Station findet ihren Platz.
            </p>
            <p className="journey-copy-arrived">
              742 Kilometer, sieben Etappen – bereit zum Wiedererleben.
            </p>
          </div>

          <ol className="journey-stations" aria-label="Beispielroute von Zürich zum Lago Maggiore">
            {stations.map((station) => (
              <li key={station.label}>
                <span aria-hidden="true" />
                <strong>{station.label}</strong>
                <small>{station.detail}</small>
              </li>
            ))}
          </ol>

          <div className="journey-film-meter" aria-hidden="true">
            <span />
          </div>
          <p className="sr-only">
            Beispielreise von Zürich über Andermatt zum Lago Maggiore. 742 Kilometer,
            sieben Etappen, Ankunft um 15:06 Uhr.
          </p>
        </div>
      </div>
    </section>
  );
}
