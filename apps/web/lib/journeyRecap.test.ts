import { describe, expect, it } from "vitest";
import { buildChapterRouteProgress } from "./journeyRecap";

describe("buildChapterRouteProgress", () => {
  it("keeps charging stops at the previously reached route position", () => {
    const progress = buildChapterRouteProgress(
      [
        { kind: "drive", id: 1 },
        { kind: "charge", id: 9 },
        { kind: "drive", id: 2 },
      ],
      [
        { driveId: 1, points: [[0, 0], [1, 1], [2, 2]] },
        { driveId: 2, points: [[2, 2], [3, 3]] },
      ],
    );

    expect(progress).toEqual([2 / 3, 2 / 3, 1]);
  });

  it("keeps chapters moving when a drive has no recorded GPS track", () => {
    const progress = buildChapterRouteProgress(
      [
        { kind: "drive", id: 1 },
        { kind: "drive", id: 2 },
      ],
      [{ driveId: 1, points: [[0, 0], [1, 1], [2, 2]] }],
    );

    expect(progress).toEqual([2 / 3, 1]);
  });

  it("returns zero progress for journeys without drives", () => {
    expect(
      buildChapterRouteProgress([{ kind: "charge", id: 9 }], []),
    ).toEqual([0]);
  });
});
