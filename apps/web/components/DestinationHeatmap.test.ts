import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DestinationHeatmapPoint } from "./DestinationHeatmapLoader";

const mocks = vi.hoisted(() => {
  const map = {
    fitBounds: vi.fn(), setView: vi.fn(), getBounds: vi.fn(() => ({ bounds: "viewport" })),
    getSize: vi.fn(() => ({ x: 640, y: 360 })),
    latLngToContainerPoint: vi.fn(([lat, lon]: number[]) => ({ x: lon! * 10, y: lat! * 10 })),
    on: vi.fn<(events: string, callback: () => void) => void>(), off: vi.fn(),
    invalidateSize: vi.fn(), remove: vi.fn(),
  };
  const heat = { addTo: vi.fn().mockReturnThis(), setBounds: vi.fn() };
  const tiles = { on: vi.fn<(events: string, callback: () => void) => void>(), off: vi.fn() };
  return {
    map, heat, tiles,
    createMap: vi.fn(() => map), addTiles: vi.fn(() => tiles),
    svgOverlay: vi.fn<(element: unknown, bounds: unknown, options: unknown) => typeof heat>(() => heat),
    marker: vi.fn(), divIcon: vi.fn((options: unknown) => options),
    observe: vi.fn(), disconnect: vi.fn(),
    resizeCallback: null as (() => void) | null,
  };
});

vi.mock("leaflet", () => ({
  default: {
    latLngBounds: (points: number[][]) => ({ isValid: () => points.length > 0, points }),
    svgOverlay: mocks.svgOverlay,
    marker: mocks.marker,
    divIcon: mocks.divIcon,
  },
}));
vi.mock("../lib/locationProviders/mapTiles.client", () => ({
  createConfiguredMap: mocks.createMap, addConfiguredMapTiles: mocks.addTiles,
}));

import { mountDestinationHeatmap } from "./DestinationHeatmap";

class ElementFixture {
  attributes = new Map<string, string>();
  children: ElementFixture[] = [];
  style: { pointerEvents?: string; cssText?: string } = {};
  textContent = "";
  id = "";
  clientWidth = 640;
  clientHeight = 360;
  clientLeft = 0;
  clientTop = 0;
  complete = true;
  naturalWidth = 256;
  src = "/api/location-providers/map-tiles/8/133/91";
  currentSrc = "";
  tiles: ElementFixture[] = [];
  box = { left: 20, top: 30, right: 660, bottom: 390, width: 640, height: 360 };
  constructor(readonly tag: string) {}
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  append(...children: ElementFixture[]) { this.children.push(...children); }
  replaceChildren(...children: ElementFixture[]) { this.children = children; }
  getBoundingClientRect() { return this.box; }
  querySelectorAll() { return this.tiles; }
  cloneNode(deep: boolean) {
    const copy = new ElementFixture(this.tag);
    copy.attributes = new Map(this.attributes);
    copy.id = this.id;
    if (deep) copy.children = this.children.map((child) => child.cloneNode(true));
    return copy;
  }
  set innerHTML(_value: string) { throw new Error("Destination data must never be assigned as HTML"); }
}

const mapTiles = {
  status: "active", mode: "custom", provider: "Controlled map",
  urlTemplate: "/api/location-providers/map-tiles/{z}/{x}/{y}",
  attribution: { label: "Controlled tiles", href: "https://tiles.test/policy" },
} as const;
const point = (overrides: Partial<DestinationHeatmapPoint> = {}): DestinationHeatmapPoint => ({
  key: "office", label: "Office", lat: 47, lon: 8, visits: 1, ...overrides,
});
const cleanups: Array<() => void> = [];
let printMedia: EventTarget & { matches: boolean };
let mapContainer: ElementFixture;
let printContainer: ElementFixture;
function mount(points: DestinationHeatmapPoint[], locale = "en") {
  mapContainer = new ElementFixture("div");
  printContainer = new ElementFixture("div");
  const cleanup = mountDestinationHeatmap(mapContainer as unknown as HTMLDivElement, {
    points, mapTiles, visitLabels: { one: "visit", other: "visits" }, locale,
  }, "controlled-heat-gradient", printContainer as unknown as HTMLDivElement);
  cleanups.push(cleanup);
  return cleanup;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("document", {
    createElementNS: (_namespace: string, tag: string) => new ElementFixture(tag),
    createElement: (tag: string) => new ElementFixture(tag),
  });
  printMedia = Object.assign(new EventTarget(), { matches: false });
  vi.stubGlobal("window", Object.assign(new EventTarget(), { matchMedia: () => printMedia }));
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback: () => void) { mocks.resizeCallback = callback; }
    observe = mocks.observe;
    disconnect = mocks.disconnect;
  });
  mocks.marker.mockImplementation(() => {
    const icon = new ElementFixture("div");
    return { addTo: vi.fn().mockReturnThis(), bindTooltip: vi.fn().mockReturnThis(), getElement: () => icon };
  });
});
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
  vi.unstubAllGlobals();
});

describe("destination heat layer", () => {
  it("uses the configured tile boundary and weights radial glows by destination visits", () => {
    const points = [point(), point({ key: "home", label: "Home", lat: 48, visits: 16 })];
    Object.freeze(points);
    mount(points);
    expect(mocks.addTiles).toHaveBeenCalledOnce();
    expect(mocks.addTiles).toHaveBeenCalledWith(mocks.map, mapTiles);
    expect(mocks.map.fitBounds).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ maxZoom: 12 }));
    expect(mocks.marker).toHaveBeenCalledTimes(2);

    const svg = mocks.svgOverlay.mock.calls[0]?.[0] as unknown as ElementFixture;
    expect(svg.attributes.get("aria-hidden")).toBe("true");
    const gradient = svg.children[0]!.children[0]!;
    expect(gradient.tag).toBe("radialGradient");
    expect(gradient.children.at(-1)?.attributes.get("stop-opacity")).toBe("0");
    const [oneVisit, manyVisits] = svg.children[1]!.children;
    expect(Number(manyVisits!.attributes.get("r"))).toBeGreaterThan(Number(oneVisit!.attributes.get("r")));
    expect(Number(manyVisits!.attributes.get("opacity"))).toBeGreaterThan(Number(oneVisit!.attributes.get("opacity")));
  });

  it("keeps exact visit counts and hostile destination names as safe tooltip text", () => {
    const label = '<img src=x onerror="alert(1)">';
    mount([point({ label, visits: 1234 })], "de");
    const marker = mocks.marker.mock.results[0]!.value;
    const tooltip = marker.bindTooltip.mock.calls[0][0] as ElementFixture;
    expect(tooltip.textContent).toBe(`${label} · 1.234 visits`);
    expect(tooltip.children).toEqual([]);
    expect(marker.getElement().attributes.get("aria-label")).toBe(tooltip.textContent);
  });

  it("omits invalid coordinates or visit counts without fabricating destination positions", () => {
    mount([point(), point({ lat: NaN }), point({ lon: 181 }), point({ visits: 0 }), point({ visits: 1.5 })]);
    expect(mocks.marker).toHaveBeenCalledOnce();
    expect(mocks.marker.mock.calls[0]?.[0]).toEqual([47, 8]);
    expect(mocks.map.setView).not.toHaveBeenCalled();
  });

  it("uses a neutral world view with no destination markers when coordinates are absent", () => {
    mount([]);
    expect(mocks.map.setView).toHaveBeenCalledWith([0, 0], 2, { animate: false });
    expect(mocks.map.fitBounds).not.toHaveBeenCalled();
    expect(mocks.marker).not.toHaveBeenCalled();
    expect(mocks.addTiles).toHaveBeenCalledWith(mocks.map, mapTiles);
  });

  it("freezes the loaded snapshot for print and releases all listeners on teardown", () => {
    const cleanup = mount([point()]);
    const snapshot = printContainer.children[0];
    window.dispatchEvent(new Event("beforeprint"));
    mocks.resizeCallback!();
    expect(printContainer.children[0]).toBe(snapshot);
    expect(mocks.map.invalidateSize).not.toHaveBeenCalled();
    window.dispatchEvent(new Event("afterprint"));
    expect(mocks.map.invalidateSize).toHaveBeenCalledOnce();
    expect(mocks.heat.setBounds).toHaveBeenCalledTimes(2);

    cleanup();
    cleanups.pop();
    expect(mocks.disconnect).toHaveBeenCalledOnce();
    expect(mocks.map.remove).toHaveBeenCalledOnce();
    expect(mocks.map.off).toHaveBeenCalledWith("moveend zoomend resize", expect.any(Function));
    expect(mocks.tiles.off).toHaveBeenCalledWith("tileload load tileunload", expect.any(Function));
    expect(printContainer.children).toEqual([]);
    window.dispatchEvent(new Event("beforeprint"));
    expect(mocks.map.invalidateSize).toHaveBeenCalledOnce();
  });

  it("preserves every selected point and screen geometry while print changes dimensions", () => {
    const cleanup = mount([point(), point({ key: "lake", lat: 50, lon: 11 })]);
    const snapshot = printContainer.children[0]!;
    expect(snapshot.attributes.get("viewBox")).toBe("0 0 640 360");
    expect(snapshot.attributes.get("preserveAspectRatio")).toBe("xMidYMid meet");
    expect(snapshot.children.filter((child) => child.attributes.has("data-destination-print-marker"))).toHaveLength(2);
    printMedia.matches = true;
    printMedia.dispatchEvent(new Event("change"));
    mocks.resizeCallback!();
    window.dispatchEvent(new Event("beforeprint"));
    expect(mocks.map.fitBounds).toHaveBeenCalledOnce();
    expect(mocks.map.invalidateSize).not.toHaveBeenCalled();
    expect(printContainer.children[0]).toBe(snapshot);
    printMedia.matches = false;
    printMedia.dispatchEvent(new Event("change"));
    expect(mocks.map.setView).not.toHaveBeenCalled();
    window.dispatchEvent(new Event("afterprint"));
    expect(mocks.map.invalidateSize).toHaveBeenCalledOnce();
    expect(mocks.map.fitBounds).toHaveBeenCalledOnce();
    cleanup();
    cleanups.pop();
    printMedia.matches = true;
    printMedia.dispatchEvent(new Event("change"));
    expect(mocks.map.fitBounds).toHaveBeenCalledOnce();
  });

  it("copies only already loaded visible tiles using their existing URLs and screen-relative positions", () => {
    mount([point({ label: "<script>literal destination</script>" })]);
    const loaded = new ElementFixture("img");
    loaded.box = { left: -100, top: -50, right: 156, bottom: 206, width: 256, height: 256 };
    const pending = new ElementFixture("img");
    pending.complete = false;
    const offscreen = new ElementFixture("img");
    offscreen.box = { left: 1000, top: 1000, right: 1256, bottom: 1256, width: 256, height: 256 };
    mapContainer.tiles = [loaded, pending, offscreen];
    mocks.tiles.on.mock.calls[0]![1]();
    const snapshot = printContainer.children[0]!;
    const images = snapshot.children.filter((child) => child.tag === "image");
    expect(images).toHaveLength(1);
    expect(images[0]!.attributes.get("href")).toBe(loaded.src);
    expect(images[0]!.attributes.get("x")).toBe("-120");
    expect(images[0]!.attributes.get("y")).toBe("-80");
    expect(snapshot.children.find((child) => child.attributes.has("data-destination-print-marker"))!.children[0]!.textContent)
      .toBe("<script>literal destination</script> · 1 visit");
    expect(mocks.addTiles).toHaveBeenCalledOnce();
  });
});
