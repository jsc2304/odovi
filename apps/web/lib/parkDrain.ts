import { computeVampireLoss } from "@tripatlas/core";

export interface ParkDrainSourceSession {
  id: number;
  startTime: Date;
  endTime: Date | null;
}

export interface ParkDrainLossSample {
  lossPct: number | null;
  hadCharge: boolean;
  nextStartSoc: number | null;
}

export interface LastChargeBoundary {
  endTime: Date;
  endSoc: number | null;
}

export interface DashboardParkDrainSession {
  id: number;
  ongoing: boolean;
  /** Start of the interval for which lossPct was measured. */
  drainSince: Date;
  durationSeconds: number;
  lossPct: number | null;
}

/**
 * Resolves the measurable drain interval for one park session. If the latest
 * charge ended inside the park, measurement starts at the charge end instead
 * of discarding the whole drive-to-drive park as "charged during park".
 */
export function resolveDashboardParkDrainSession(
  session: ParkDrainSourceSession,
  loss: ParkDrainLossSample,
  lastCharge: LastChargeBoundary | null,
  now = new Date(),
): DashboardParkDrainSession {
  const sessionEnd = session.endTime ?? now;
  const chargeEndedInsidePark =
    lastCharge != null &&
    lastCharge.endTime.getTime() >= session.startTime.getTime() &&
    lastCharge.endTime.getTime() <= sessionEnd.getTime();

  const drainSince = chargeEndedInsidePark ? lastCharge.endTime : session.startTime;
  const lossPct = chargeEndedInsidePark
    ? computeVampireLoss({
        prevEndSoc: lastCharge.endSoc,
        nextStartSoc: loss.nextStartSoc,
        hadCharge: false,
      })
    : loss.lossPct;

  return {
    id: session.id,
    ongoing: session.endTime == null,
    drainSince,
    durationSeconds: Math.max(
      0,
      Math.round((sessionEnd.getTime() - drainSince.getTime()) / 1000),
    ),
    lossPct,
  };
}

/** Null means at least one park interval could not be measured reliably. */
export function sumParkDrainSessions(
  sessions: DashboardParkDrainSession[],
): number | null {
  if (sessions.some((session) => session.lossPct == null)) return null;
  return sessions.reduce((total, session) => total + session.lossPct!, 0);
}
