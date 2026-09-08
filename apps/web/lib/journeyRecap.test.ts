import { describe, expect, it } from "vitest";
import { buildChapterRouteProgress, buildRecapRoute, buildRecapTimeline, recapPosition } from "./journeyRecap";

describe("recap route", () => {
  it("uses distance rather than GPS sampling density and holds charging stops", () => {
    const items = [{ kind: "drive" as const, id: 1 }, { kind: "charge" as const, id: 9 }, { kind: "drive" as const, id: 2 }];
    const tracks = [
      { driveId: 1, points: [[0, 0], [0, 0.01], [0, 0.02], [0, 1]] as [number, number][] },
      { driveId: 2, points: [[0, 1], [0, 2]] as [number, number][] },
    ];
    const progress = buildChapterRouteProgress(items, tracks);
    expect(progress[0]).toBeCloseTo(0.5);
    expect(progress[1]).toBe(progress[0]);
    expect(progress[2]).toBe(1);
  });

  it("follows timeline order even when IDs and returned tracks are out of order", () => {
    const route = buildRecapRoute([{ kind: "drive", id: 9 }, { kind: "drive", id: 1 }], [
      { driveId: 1, points: [[0, 1], [0, 3]] },
      { driveId: 9, points: [[0, 0], [0, 1]] },
    ]);
    expect(route.points[0].coordinates).toEqual([0, 0]);
    expect(route.chapterProgress[0]).toBeCloseTo(1 / 3);
  });

  it("preserves gaps as unrecorded camera transitions and never invents missing GPS", () => {
    const route = buildRecapRoute([
      { kind: "drive", id: 1 }, { kind: "drive", id: 2 }, { kind: "drive", id: 3 },
    ], [
      { driveId: 1, points: [[0, 0], [0, 1]] },
      { driveId: 3, points: [[0, 2], [0, 3]] },
    ]);
    expect(route.chapterProgress[0]).toBeCloseTo(1 / 3);
    expect(route.chapterProgress[1]).toBe(route.chapterProgress[0]);
    expect(route.points.map((point) => point.breakBefore)).toEqual([true, false, true, false]);
    expect(route.chapterProgress[2]).toBe(1);
  });

  it("handles no GPS, a single point, repeated points, and invalid coordinates", () => {
    expect(buildChapterRouteProgress([{ kind: "charge", id: 9 }], [])).toEqual([0]);
    const route = buildRecapRoute([{ kind: "drive", id: 1 }], [
      { driveId: 1, points: [[NaN, 0], [95, 0], [1, 1], [1, 1]] },
    ]);
    expect(route.totalDistance).toBe(0);
    expect(route.chapterProgress).toEqual([0]);
    expect(route.points).toHaveLength(2);
  });

  it("bounds long-journey geometry while retaining trip endpoints and distances", () => {
    const points = Array.from({ length: 60000 }, (_, i): [number, number] => [0, i / 60000]);
    const route = buildRecapRoute([{ kind: "drive", id: 1 }], [{ driveId: 1, points }]);
    expect(route.points.length).toBeLessThanOrEqual(6002);
    expect(route.points[0].coordinates).toEqual(points[0]);
    expect(route.points.at(-1)?.coordinates).toEqual(points.at(-1));
    expect(route.totalDistance).toBeCloseTo(111.193, 2);
  });
});

describe("continuous recap timeline", () => {
  const timeline = buildRecapTimeline([
    { kind: "drive", id: 1, distanceKm: 0.1 },
    { kind: "drive", id: 2, distanceKm: 250 },
    { kind: "charge", id: 8 },
    { kind: "drive", id: 3, distanceKm: 20 },
  ], [0.001, 0.8, 0.8, 1]);

  it("keeps every short trip navigable with less scroll time than a long leg", () => {
    expect(timeline).toHaveLength(6);
    expect(timeline[1].end - timeline[1].start).toBeLessThan((timeline[2].end - timeline[2].start) / 2);
    timeline.forEach((segment, index) => {
      expect(recapPosition(timeline, (segment.start + segment.end) / 2).index).toBe(index);
    });
  });

  it("is monotonic, stays inside each recorded segment, and holds charging", () => {
    let previous = 0;
    for (let position = 0; position <= timeline.at(-1)!.end; position += 0.001) {
      const current = recapPosition(timeline, position);
      const segment = timeline[current.index];
      expect(current.routeProgress).toBeGreaterThanOrEqual(previous - 1e-10);
      expect(current.routeProgress).toBeGreaterThanOrEqual(segment.from - 1e-10);
      expect(current.routeProgress).toBeLessThanOrEqual(segment.to + 1e-10);
      previous = current.routeProgress;
    }
    expect(recapPosition(timeline, (timeline[3].start + timeline[3].end) / 2).routeProgress).toBeCloseTo(0.8);
    expect(recapPosition(timeline, -100).routeProgress).toBe(0);
    expect(recapPosition(timeline, 100).routeProgress).toBe(1);
  });

  it("matches position and velocity on both sides of every chapter seam", () => {
    const epsilon = 0.000001;
    for (const segment of timeline.slice(1)) {
      const at = recapPosition(timeline, segment.start).routeProgress;
      const before = recapPosition(timeline, segment.start - epsilon).routeProgress;
      const after = recapPosition(timeline, segment.start + epsilon).routeProgress;
      expect(after - before).toBeLessThan(0.00001);
      expect((at - before) / epsilon).toBeCloseTo((after - at) / epsilon, 4);
    }
  });
});
