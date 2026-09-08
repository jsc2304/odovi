export const DRIVING_USAGES = ["private", "business", "balanced"] as const;
export type DrivingUsage = (typeof DRIVING_USAGES)[number];

export interface DrivingProfile {
  usage: DrivingUsage;
  /** Only drives starting after this choice are eligible, including delayed syncs. */
  effectiveFrom: string;
}

export function drivingProfileKey(vehicleId: number): string {
  return `driving-profile:${vehicleId}`;
}

export function parseDrivingProfile(value: unknown): DrivingProfile | null {
  if (value == null || typeof value !== "object") return null;
  const profile = value as Partial<DrivingProfile>;
  if (!DRIVING_USAGES.includes(profile.usage as DrivingUsage) ||
    typeof profile.effectiveFrom !== "string" || !Number.isFinite(Date.parse(profile.effectiveFrom))) return null;
  return { usage: profile.usage!, effectiveFrom: profile.effectiveFrom };
}
