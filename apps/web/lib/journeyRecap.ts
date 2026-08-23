export interface RecapTimelineRef {
  kind: "drive" | "charge";
  id: number;
}

export interface RecapRouteTrack {
  driveId: number;
  points: [number, number][];
}

/**
 * Maps chronological journey items to progress along the combined driven route.
 * Charging chapters stay at the last reached position; drives without GPS data
 * still receive a small virtual segment so the story can continue.
 */
export function buildChapterRouteProgress(
  items: RecapTimelineRef[],
  tracks: RecapRouteTrack[],
): number[] {
  const lengthByDriveId = new Map(
    tracks.map((track) => [track.driveId, Math.max(1, track.points.length - 1)]),
  );
  const driveItems = items.filter((item) => item.kind === "drive");
  const total = driveItems.reduce(
    (sum, item) => sum + (lengthByDriveId.get(item.id) ?? 1),
    0,
  );

  if (total === 0) return items.map(() => 0);

  let travelled = 0;
  return items.map((item) => {
    if (item.kind === "drive") {
      travelled += lengthByDriveId.get(item.id) ?? 1;
    }
    return Math.min(1, travelled / total);
  });
}
