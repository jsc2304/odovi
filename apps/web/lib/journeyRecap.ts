export interface RecapTimelineRef {
  kind: "drive" | "charge";
  id: number;
  distanceKm?: number | null;
}

export interface RecapRouteTrack {
  driveId: number;
  points: [number, number][];
}

export interface RecapRoutePoint {
  coordinates: [number, number];
  distance: number;
  breakBefore: boolean;
}

function distanceBetween(a: [number, number], b: [number, number]): number {
  const radians = Math.PI / 180;
  const lat = Math.sin((b[0] - a[0]) * radians / 2);
  const lon = Math.sin((b[1] - a[1]) * radians / 2);
  const h = lat * lat + Math.cos(a[0] * radians) * Math.cos(b[0] * radians) * lon * lon;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}

/** A distance-based camera path in timeline order. Gaps move the camera but
 * are never painted as recorded driving. Missing GPS holds the last position. */
export function buildRecapRoute(items: RecapTimelineRef[], tracks: RecapRouteTrack[]) {
  const byId = new Map(tracks.map((track) => [track.driveId, track.points]));
  const points: RecapRoutePoint[] = [];
  const ends: number[] = [];
  let previous: [number, number] | undefined;
  let distance = 0;
  const pointCount = tracks.reduce((sum, track) => sum + track.points.length, 0);
  const stride = Math.max(1, Math.ceil(pointCount / 6000));
  for (const item of items) {
    if (item.kind === "drive") {
      const track = (byId.get(item.id) ?? []).filter(([lat, lon]) =>
        Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180,
      );
      track.forEach((coordinates, index) => {
        if (previous) distance += distanceBetween(previous, coordinates);
        if (index === 0 || index === track.length - 1 || index % stride === 0) {
          points.push({ coordinates, distance, breakBefore: index === 0 });
        }
        previous = coordinates;
      });
    }
    ends.push(distance);
  }
  return {
    points,
    totalDistance: distance,
    chapterProgress: ends.map((end) => distance > 0 ? end / distance : 0),
  };
}

export function buildChapterRouteProgress(items: RecapTimelineRef[], tracks: RecapRouteTrack[]): number[] {
  return buildRecapRoute(items, tracks).chapterProgress;
}

export interface RecapSegment {
  start: number;
  end: number;
  from: number;
  to: number;
}

/** Scroll distance also controls playback time. Every item stays navigable. */
export function buildRecapTimeline(items: RecapTimelineRef[], progress: number[]): RecapSegment[] {
  const weights = [1.15, ...items.map((item) => item.kind === "charge" ? 1 :
    0.64 + 1.05 * Math.sqrt(Math.min(300, Math.max(0, item.distanceKm ?? 12)) / 100)), 0.8];
  const targets = [0, 0, ...progress, progress.at(-1) ?? 0];
  let offset = 0;
  return weights.map((weight, index) => {
    const start = offset;
    offset += weight;
    return { start, end: offset, from: targets[index], to: targets[index + 1] };
  });
}

export function recapPosition(segments: RecapSegment[], position: number) {
  const index = Math.max(0, segments.findIndex((segment, i) => position < segment.end || i === segments.length - 1));
  const segment = segments[index];
  const width = segment.end - segment.start;
  const fraction = Math.max(0, Math.min(1, (position - segment.start) / width));
  const slope = (s: RecapSegment | undefined) => s ? (s.to - s.from) / (s.end - s.start) : 0;
  const current = slope(segment);
  // Shared, bounded tangents keep velocity continuous without overshooting a
  // short drive or drifting forward during charging. Also works in reverse.
  const tangent = (other: RecapSegment | undefined) => Math.min(current, slope(other));
  const a = tangent(segments[index - 1]) * width;
  const b = tangent(segments[index + 1]) * width;
  const t = fraction;
  const routeProgress = (2 * t ** 3 - 3 * t ** 2 + 1) * segment.from +
    (t ** 3 - 2 * t ** 2 + t) * a + (-2 * t ** 3 + 3 * t ** 2) * segment.to +
    (t ** 3 - t ** 2) * b;
  return { index, fraction, routeProgress };
}
