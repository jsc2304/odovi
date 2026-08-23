"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";

const TEXTURE_WIDTH = 2048;
const TEXTURE_HEIGHT = 1144;

const vertexShader = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  precision highp float;

  uniform sampler2D uMemory;
  uniform sampler2D uCartography;
  uniform vec2 uResolution;
  uniform vec2 uTextureResolution;
  uniform vec2 uParallax;
  uniform float uBlend;
  uniform float uChoiceProgress;
  uniform float uRouteProgress;
  uniform float uTime;
  uniform float uZoom;

  varying vec2 vUv;

  vec2 coverUv(vec2 uv) {
    float viewportRatio = uResolution.x / uResolution.y;
    float textureRatio = uTextureResolution.x / uTextureResolution.y;
    vec2 crop = vec2(1.0);

    if (viewportRatio > textureRatio) {
      crop.y = textureRatio / viewportRatio;
    } else {
      crop.x = viewportRatio / textureRatio;
    }

    vec2 centered = (uv - 0.5) * crop / uZoom;
    return centered + 0.5 + uParallax;
  }

  float segmentDistance(vec2 point, vec2 start, vec2 end) {
    vec2 toPoint = point - start;
    vec2 segment = end - start;
    float position = clamp(dot(toPoint, segment) / dot(segment, segment), 0.0, 1.0);
    return length(toPoint - segment * position);
  }

  float progressiveSegment(
    vec2 point,
    vec2 start,
    vec2 end,
    float progressStart,
    float progressEnd,
    float progress
  ) {
    float reveal = clamp(
      (progress - progressStart) / (progressEnd - progressStart),
      0.0,
      1.0
    );
    vec2 visibleEnd = mix(start, end, reveal);
    float distanceToVisibleSegment = segmentDistance(point, start, visibleEnd);
    return mix(10.0, distanceToVisibleSegment, step(0.001, reveal));
  }

  float waypoint(vec2 point, vec2 center, float threshold, float progress) {
    float reveal = clamp((progress - threshold) / 0.09, 0.0, 1.0);
    float radius = length(point - center) * uResolution.y;
    float core = smoothstep(5.0, 1.2, radius) * step(0.001, reveal);
    float ringRadius = mix(4.0, 14.0, reveal);
    float ring = smoothstep(1.6, 0.0, abs(radius - ringRadius)) * (1.0 - reveal);
    return max(core, ring * 0.82);
  }

  void main() {
    vec2 imageUv = coverUv(vUv);
    float drift = sin((imageUv.y + uTime * 0.004) * 9.0) * 0.00045;
    vec4 memory = texture2D(uMemory, imageUv + vec2(drift, drift * 0.3));
    vec4 cartography = texture2D(uCartography, imageUv);

    float blend = smoothstep(0.04, 0.96, uBlend);
    vec3 color = mix(memory.rgb, cartography.rgb, blend);

    float aspect = uResolution.x / uResolution.y;
    vec2 point = vec2(vUv.x * aspect, vUv.y);
    vec2 p0 = vec2(0.43 * aspect, 0.18);
    vec2 p1 = vec2(0.53 * aspect, 0.28);
    vec2 p2 = vec2(0.64 * aspect, 0.36);
    vec2 p3 = vec2(0.60 * aspect, 0.50);
    vec2 p4 = vec2(0.72 * aspect, 0.61);
    vec2 p5 = vec2(0.82 * aspect, 0.57);
    vec2 p6 = vec2(0.91 * aspect, 0.76);

    float routeDistance = 10.0;
    routeDistance = min(routeDistance, progressiveSegment(point, p0, p1, 0.00, 0.15, uRouteProgress));
    routeDistance = min(routeDistance, progressiveSegment(point, p1, p2, 0.15, 0.31, uRouteProgress));
    routeDistance = min(routeDistance, progressiveSegment(point, p2, p3, 0.31, 0.47, uRouteProgress));
    routeDistance = min(routeDistance, progressiveSegment(point, p3, p4, 0.47, 0.64, uRouteProgress));
    routeDistance = min(routeDistance, progressiveSegment(point, p4, p5, 0.64, 0.81, uRouteProgress));
    routeDistance = min(routeDistance, progressiveSegment(point, p5, p6, 0.81, 1.00, uRouteProgress));

    float routePixels = routeDistance * uResolution.y;
    float routeCore = smoothstep(2.4, 0.25, routePixels);
    float routeGlow = smoothstep(15.0, 0.4, routePixels) * 0.38;
    vec3 routeColor = mix(vec3(0.486, 0.231, 0.929), vec3(0.404, 0.910, 0.976), vUv.x);
    color = mix(color, routeColor, max(routeCore * 0.92, routeGlow));

    float amber = 0.0;
    amber = max(amber, waypoint(point, p1, 0.15, uRouteProgress));
    amber = max(amber, waypoint(point, p3, 0.47, uRouteProgress));
    amber = max(amber, waypoint(point, p4, 0.64, uRouteProgress));
    amber = max(amber, waypoint(point, p6, 0.96, uRouteProgress));
    color = mix(color, vec3(0.957, 0.722, 0.376), amber);

    vec2 fork = vec2(0.62 * aspect, 0.48);
    vec2 hosted = vec2(0.77 * aspect, 0.61);
    vec2 selfHosted = vec2(0.77 * aspect, 0.37);
    vec2 reunion = vec2(0.91 * aspect, 0.49);
    float branchDistance = 10.0;
    branchDistance = min(branchDistance, progressiveSegment(point, fork, hosted, 0.00, 0.34, uChoiceProgress));
    branchDistance = min(branchDistance, progressiveSegment(point, fork, selfHosted, 0.00, 0.34, uChoiceProgress));
    branchDistance = min(branchDistance, progressiveSegment(point, hosted, reunion, 0.34, 1.00, uChoiceProgress));
    branchDistance = min(branchDistance, progressiveSegment(point, selfHosted, reunion, 0.34, 1.00, uChoiceProgress));
    float branchPixels = branchDistance * uResolution.y;
    float branch = max(
      smoothstep(2.0, 0.2, branchPixels) * 0.82,
      smoothstep(13.0, 0.4, branchPixels) * 0.24
    );
    color = mix(color, vec3(0.655, 0.545, 0.980), branch);

    float leftScrim = smoothstep(0.72, 0.06, vUv.x);
    color *= 1.0 - leftScrim * mix(0.38, 0.24, blend);
    color *= 0.95;

    gl_FragColor = vec4(color, 1.0);
  }
`;

type GsapRuntime = typeof import("gsap")["gsap"];
type ScrollTriggerRuntime = typeof import("gsap/ScrollTrigger")["ScrollTrigger"];

function setScene(root: HTMLDivElement, scene: "memory" | "night") {
  root.dataset.scene = scene;
}

function setStageState(root: HTMLDivElement, state: "active" | "ended") {
  root.dataset.state = state;
}

function createStaticStory(
  root: HTMLDivElement,
  ScrollTrigger: ScrollTriggerRuntime,
) {
  const journeyFilm = document.querySelector<HTMLElement>("#journey-film");

  if (!journeyFilm) return () => undefined;

  const endTrigger = ScrollTrigger.create({
    trigger: journeyFilm,
    start: "top 76%",
    onEnter: () => setStageState(root, "ended"),
    onEnterBack: () => setStageState(root, "ended"),
    onLeaveBack: () => setStageState(root, "active"),
  });

  return () => {
    endTrigger.kill();
  };
}

export function MotionStage() {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!rootRef.current || !canvasRef.current) return;

    const root: HTMLDivElement = rootRef.current;
    const canvas: HTMLCanvasElement = canvasRef.current;

    let cancelled = false;
    let idleHandle = 0;
    let cleanup: () => void = () => undefined;

    async function setup() {
      const [{ gsap }, { ScrollTrigger }] = await Promise.all([
        import("gsap"),
        import("gsap/ScrollTrigger"),
      ]);

      if (cancelled) return;
      gsap.registerPlugin(ScrollTrigger);

      const reducedMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      const mobileFallback = window.matchMedia(
        "(max-width: 767px), (pointer: coarse)",
      ).matches;

      if (reducedMotion || mobileFallback) {
        root.dataset.mode = reducedMotion ? "reduced" : "mobile";
        cleanup = createStaticStory(root, ScrollTrigger);
        ScrollTrigger.refresh();
        return;
      }

      let THREE: typeof import("three");
      try {
        THREE = await import("three");
      } catch {
        root.dataset.mode = "static";
        cleanup = createStaticStory(root, ScrollTrigger);
        return;
      }

      if (cancelled) return;

      let renderer: import("three").WebGLRenderer;
      try {
        renderer = new THREE.WebGLRenderer({
          alpha: true,
          antialias: false,
          canvas,
          powerPreference: "high-performance",
        });
      } catch {
        root.dataset.mode = "static";
        cleanup = createStaticStory(root, ScrollTrigger);
        return;
      }

      const textureLoader = new THREE.TextureLoader();
      let memoryTexture: import("three").Texture;
      let cartographyTexture: import("three").Texture;

      try {
        [memoryTexture, cartographyTexture] = await Promise.all([
          textureLoader.loadAsync("/brand/memory-ribbon.webp"),
          textureLoader.loadAsync("/brand/night-cartography.webp"),
        ]);
      } catch {
        renderer.dispose();
        root.dataset.mode = "static";
        cleanup = createStaticStory(root, ScrollTrigger);
        return;
      }

      if (cancelled) {
        memoryTexture.dispose();
        cartographyTexture.dispose();
        renderer.dispose();
        return;
      }

      memoryTexture.colorSpace = THREE.SRGBColorSpace;
      cartographyTexture.colorSpace = THREE.SRGBColorSpace;
      memoryTexture.minFilter = THREE.LinearFilter;
      cartographyTexture.minFilter = THREE.LinearFilter;

      const scene = new THREE.Scene();
      const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
      camera.position.z = 1;

      const uniforms = {
        uMemory: { value: memoryTexture },
        uCartography: { value: cartographyTexture },
        uResolution: { value: new THREE.Vector2(1, 1) },
        uTextureResolution: {
          value: new THREE.Vector2(TEXTURE_WIDTH, TEXTURE_HEIGHT),
        },
        uParallax: { value: new THREE.Vector2(0, 0) },
        uBlend: { value: 0 },
        uChoiceProgress: { value: 0 },
        uRouteProgress: { value: 0 },
        uTime: { value: 0 },
        uZoom: { value: 1 },
      };

      const geometry = new THREE.PlaneGeometry(2, 2);
      const material = new THREE.ShaderMaterial({
        depthTest: false,
        depthWrite: false,
        fragmentShader,
        uniforms,
        vertexShader,
      });
      const plane = new THREE.Mesh(geometry, material);
      scene.add(plane);

      const resize = () => {
        const width = window.innerWidth;
        const height = window.innerHeight;
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
        renderer.setSize(width, height, false);
        uniforms.uResolution.value.set(width, height);
        renderer.render(scene, camera);
      };

      resize();
      root.dataset.mode = "webgl";
      root.dataset.canvas = "ready";

      const timelines: Array<ReturnType<GsapRuntime["timeline"]>> = [];
      const triggers: Array<ReturnType<ScrollTriggerRuntime["create"]>> = [];
      const scrub = 0.58;
      const hero = document.querySelector<HTMLElement>("#start");
      const journeyFilm = document.querySelector<HTMLElement>("#journey-film");

      if (hero) {
        timelines.push(
          gsap
            .timeline({
              defaults: { ease: "none" },
              scrollTrigger: {
                trigger: hero,
                start: "top top",
                end: "bottom top",
                scrub,
              },
            })
            .to(uniforms.uZoom, { value: 1.08 }, 0)
            .to(uniforms.uParallax.value, { x: 0.012, y: 0.026 }, 0)
            .to(uniforms.uRouteProgress, { value: 0.34 }, 0),
        );
      }

      let renderFrame = 0;
      let stageVisible = true;
      let sampleStartedAt = performance.now();
      let sampledFrames = 0;
      let slowSamples = 0;
      let fallbackCleanup: () => void = () => undefined;

      const stopRendering = () => {
        if (renderFrame) cancelAnimationFrame(renderFrame);
        renderFrame = 0;
      };

      const switchToStatic = () => {
        stopRendering();
        root.dataset.canvas = "off";
        root.dataset.mode = "static";
        setScene(root, uniforms.uBlend.value > 0.5 ? "night" : "memory");
        fallbackCleanup();
        fallbackCleanup = createStaticStory(root, ScrollTrigger);
      };

      const render = (time: number) => {
        if (!stageVisible || document.hidden || root.dataset.mode !== "webgl") {
          renderFrame = 0;
          return;
        }

        uniforms.uTime.value = time / 1000;
        renderer.render(scene, camera);
        sampledFrames += 1;

        const sampleDuration = time - sampleStartedAt;
        if (sampleDuration >= 1800) {
          const fps = (sampledFrames * 1000) / sampleDuration;
          slowSamples = fps < 45 ? slowSamples + 1 : 0;
          sampleStartedAt = time;
          sampledFrames = 0;
          if (slowSamples >= 2) {
            switchToStatic();
            return;
          }
        }

        renderFrame = requestAnimationFrame(render);
      };

      const startRendering = () => {
        if (!renderFrame && stageVisible && !document.hidden) {
          sampleStartedAt = performance.now();
          sampledFrames = 0;
          renderFrame = requestAnimationFrame(render);
        }
      };

      if (hero && journeyFilm) {
        triggers.push(
          ScrollTrigger.create({
            trigger: hero,
            start: "top bottom",
            endTrigger: journeyFilm,
            end: "top 76%",
            onEnter: () => {
              stageVisible = true;
              setStageState(root, "active");
              startRendering();
            },
            onEnterBack: () => {
              stageVisible = true;
              setStageState(root, "active");
              startRendering();
            },
            onLeave: () => {
              stageVisible = false;
              setStageState(root, "ended");
              stopRendering();
            },
            onLeaveBack: () => {
              stageVisible = false;
              stopRendering();
            },
          }),
        );
      }

      const handleVisibility = () => {
        if (document.hidden) stopRendering();
        else startRendering();
      };

      window.addEventListener("resize", resize, { passive: true });
      document.addEventListener("visibilitychange", handleVisibility);
      startRendering();
      ScrollTrigger.refresh();

      cleanup = () => {
        fallbackCleanup();
        stopRendering();
        timelines.forEach((timeline) => {
          timeline.scrollTrigger?.kill();
          timeline.kill();
        });
        triggers.forEach((trigger) => trigger.kill());
        window.removeEventListener("resize", resize);
        document.removeEventListener("visibilitychange", handleVisibility);
        geometry.dispose();
        material.dispose();
        memoryTexture.dispose();
        cartographyTexture.dispose();
        renderer.dispose();
      };
    }

    if (typeof window.requestIdleCallback === "function") {
      idleHandle = window.requestIdleCallback(() => void setup(), { timeout: 900 });
    } else {
      idleHandle = globalThis.setTimeout(
        () => void setup(),
        1,
      ) as unknown as number;
    }

    return () => {
      cancelled = true;
      if (typeof window.cancelIdleCallback === "function") {
        window.cancelIdleCallback(idleHandle);
      } else {
        globalThis.clearTimeout(idleHandle);
      }
      cleanup();
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      className="motion-stage"
      data-canvas="off"
      data-mode="static"
      data-scene="memory"
      data-state="active"
      ref={rootRef}
    >
      <Image
        alt=""
        className="motion-plate motion-plate-memory"
        fill
        preload
        sizes="100vw"
        src="/brand/memory-ribbon.webp"
        unoptimized
      />
      <Image
        alt=""
        className="motion-plate motion-plate-cartography"
        fill
        sizes="100vw"
        src="/brand/night-cartography.webp"
        unoptimized
      />
      <canvas aria-hidden="true" className="motion-canvas" ref={canvasRef} />
      <div className="motion-stage-scrim" />
      <div className="motion-stage-grain" />
    </div>
  );
}
