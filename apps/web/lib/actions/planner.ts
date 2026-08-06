"use server";
import { z } from "zod";
import { getTranslations } from "next-intl/server";
import {
  buildRoadtripLegs,
  downsample,
  summarizeElevation,
  type RoadtripPlanSnapshot,
  type RoadtripStop,
} from "@tripatlas/core";
import { validateSession } from "../auth/session";
import {
  resolveBaseConsumption,
} from "../planner";

/**
 * Server Action des Routenplaner-MVP („Reichweiten-Check"). Orchestriert
 * server-seitig (nie im Browser): OSRM-Routing → Höhenprofil via Open-Meteo →
 * reines Verbrauchsmodell (@tripatlas/core) → Ankunfts-SoC. Alle externen
 * Aufrufe mit Timeout und Failure-soft-Verhalten; das Höhenprofil ist optional
 * (fällt es aus, rechnet das Modell ohne Höhenterm und die UI weist es aus).
 */

// Basis-URL des OSRM-Routing-Servers. Default ist der öffentliche Demo-Server;
// eine eigene Instanz wird über OSRM_URL gesetzt (in der UI klein ausgewiesen).
const OSRM_DEFAULT_URL = "https://router.project-osrm.org";
const OSRM_URL = process.env.OSRM_URL ?? OSRM_DEFAULT_URL;
const OSRM_IS_DEFAULT = process.env.OSRM_URL == null;

const OPEN_METEO_ELEVATION_URL = "https://api.open-meteo.com/v1/elevation";

// Timeouts: der Demo-OSRM kann träge sein, Open-Meteo ist meist flott.
const OSRM_TIMEOUT_MS = 15000;
const ELEVATION_TIMEOUT_MS = 10000;

// Open-Meteo erlaubt bis zu 100 Koordinaten je Elevation-Request → Route auf
// höchstens so viele Stützpunkte downsampeln (ein Batch-Request).
const ELEVATION_MAX_POINTS = 100;
// Karten-Polyline: server-seitig ausdünnen, damit der Client-Payload/DOM leicht
// bleibt (lange Routen haben leicht mehrere tausend OSRM-Koordinaten).
const MAP_MAX_POINTS = 400;

const roadtripStopSchema = z.object({
  id: z.string().trim().min(1).max(100),
  label: z.string().trim().min(1).max(500),
  lat: z.number().gte(-90).lte(90),
  lon: z.number().gte(-180).lte(180),
  kind: z.enum(["start", "waypoint", "charge", "destination"]),
  targetSoc: z.number().min(0).max(100).nullable().optional(),
});

const planRoadtripInputSchema = z.object({
  vehicleId: z.number().int().positive(),
  departureAt: z.string().datetime(),
  stops: z.array(roadtripStopSchema).min(2).max(12),
  startSoc: z.number().min(0).max(100),
  reserveSoc: z.number().min(0).max(50),
  tempC: z.number().min(-40).max(55),
  capacityKwh: z.number().min(5).max(250),
}).superRefine((value, ctx) => {
  if (value.stops[0]?.kind !== "start") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["stops", 0, "kind"],
      message: "First stop must be the start",
    });
  }
  if (value.stops.at(-1)?.kind !== "destination") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["stops", value.stops.length - 1, "kind"],
      message: "Last stop must be the destination",
    });
  }
});

export type PlanRoadtripInput = z.infer<typeof planRoadtripInputSchema>;
export type PlanResult = RoadtripPlanSnapshot;

export type PlanRouteResponse =
  | { ok: true; plan: PlanResult }
  | { ok: false; error: string };

interface OsrmRoute {
  distanceM: number;
  durationS: number;
  legs: Array<{ distanceM: number; durationS: number }>;
  /** OSRM liefert [lon, lat] — hier bereits so belassen. */
  coordinates: [number, number][];
}

/**
 * Plant eine Route und prognostiziert Verbrauch + Ankunfts-SoC. Reihenfolge:
 * OSRM-Route holen → Höhenprofil batchen → Basisverbrauch aus Historie →
 * core-Modell → SoC-Rechnung.
 */
export async function planRoadtrip(
  input: PlanRoadtripInput,
): Promise<PlanRouteResponse> {
  const t = await getTranslations("planner");
  const user = await validateSession();
  if (!user) return { ok: false, error: t("errors.notAuthenticated") };

  const parsed = planRoadtripInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? t("errors.invalidInput"),
    };
  }
  const {
    vehicleId,
    departureAt,
    stops,
    startSoc,
    reserveSoc,
    tempC,
    capacityKwh,
  } = parsed.data;

  // 1) Routing (OSRM) — server-seitig, mit Timeout und freundlicher Fehlermeldung.
  const routeResult = await fetchOsrmRoute(stops, t);
  if (!routeResult.ok) return { ok: false, error: routeResult.error };
  const route = routeResult.route;

  // 2) Höhenprofil (Open-Meteo, ein Batch-Request) — optional/failure-soft.
  const elevationSample = downsample(
    route.coordinates,
    Math.min(ELEVATION_MAX_POINTS, route.coordinates.length),
  );
  const elevations = await fetchElevations(elevationSample);
  const elevationOk = elevations != null;
  const { ascentM, descentM } = elevationOk
    ? summarizeElevation(elevations)
    : { ascentM: 0, descentM: 0 };

  // 3) Persönlicher Basisverbrauch aus der Historie (Fallback-Kette in lib/planner).
  const base = await resolveBaseConsumption(vehicleId, tempC);

  // 4) Deterministische Verbrauchs- und SoC-Prognose je OSRM-Etappe.
  const prediction = buildRoadtripLegs({
    stops,
    routeLegs: route.legs.map((leg) => ({
      distanceKm: leg.distanceM / 1000,
      durationSeconds: leg.durationS,
    })),
    startSoc,
    capacityKwh,
    tempC,
    baseWhPerKm: base.baseWhPerKm,
    referenceSpeedKmh: base.referenceSpeedKmh,
    totalAscentM: ascentM,
    totalDescentM: descentM,
  });

  // Karten-Geometrie ausdünnen und auf [lat, lon] drehen.
  const geometry: [number, number][] = downsample(
    route.coordinates,
    Math.min(MAP_MAX_POINTS, route.coordinates.length),
  ).map(([lon, lat]) => [lat, lon]);

  return {
    ok: true,
    plan: {
      schemaVersion: 1,
      vehicleId,
      departureAt,
      startSoc,
      reserveSoc,
      tempC,
      capacityKwh,
      stops,
      legs: prediction.legs,
      totals: prediction.totals,
      geometry,
      assumptions: {
        baseWhPerKm: base.baseWhPerKm,
        baseSource: base.source,
        referenceSpeedKmh: base.referenceSpeedKmh,
        tempBinCenterC: base.tempBinCenterC,
        historyDriveCount: base.historyDriveCount,
        elevationOk,
        ascentM,
        descentM,
        elevationAllocation: "distance-proportional",
        routeProvider: "osrm",
        routeProviderIsDefault: OSRM_IS_DEFAULT,
      },
    },
  };
}

type OsrmResult =
  | { ok: true; route: OsrmRoute }
  | { ok: false; error: string };

/** OSRM route API: profile driving, overview=full, geometries=geojson. */
async function fetchOsrmRoute(
  stops: RoadtripStop[],
  t: Awaited<ReturnType<typeof getTranslations>>,
): Promise<OsrmResult> {
  const base = OSRM_URL.replace(/\/+$/, "");
  const coords = stops.map((stop) => `${stop.lon},${stop.lat}`).join(";");
  const url = new URL(`${base}/route/v1/driving/${coords}`);
  url.searchParams.set("overview", "full");
  url.searchParams.set("geometries", "geojson");

  let res: Response;
  try {
    res = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(OSRM_TIMEOUT_MS),
    });
  } catch {
    return {
      ok: false,
      error: t("errors.routingUnreachable"),
    };
  }

  if (res.status === 429) {
    return {
      ok: false,
      error: t("errors.routingRateLimited"),
    };
  }
  if (!res.ok) {
    return {
      ok: false,
      error: t("errors.routingHttpError", { status: res.status }),
    };
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { ok: false, error: t("errors.routingBadResponse") };
  }

  const parsed = parseOsrmBody(body, stops.length - 1);
  if (!parsed) {
    return {
      ok: false,
      error: t("errors.routingNoRoute"),
    };
  }
  return { ok: true, route: parsed };
}

interface OsrmResponseShape {
  code?: string;
  routes?: Array<{
    distance?: number;
    duration?: number;
    geometry?: { coordinates?: unknown };
    legs?: Array<{ distance?: number; duration?: number }>;
  }>;
}

/** Validiert die OSRM-Antwort und extrahiert Distanz/Dauer/Koordinaten. */
function parseOsrmBody(body: unknown, expectedLegs: number): OsrmRoute | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as OsrmResponseShape;
  if (b.code !== "Ok") return null;
  const route = b.routes?.[0];
  if (
    !route ||
    typeof route.distance !== "number" ||
    typeof route.duration !== "number" ||
    !Array.isArray(route.geometry?.coordinates) ||
    !Array.isArray(route.legs) ||
    route.legs.length !== expectedLegs
  ) {
    return null;
  }

  const coordinates: [number, number][] = [];
  for (const c of route.geometry.coordinates as unknown[]) {
    if (
      Array.isArray(c) &&
      typeof c[0] === "number" &&
      typeof c[1] === "number"
    ) {
      coordinates.push([c[0], c[1]]); // [lon, lat]
    }
  }
  if (coordinates.length < 2) return null;

  const legs: Array<{ distanceM: number; durationS: number }> = [];
  for (const leg of route.legs) {
    if (
      typeof leg.distance !== "number" ||
      typeof leg.duration !== "number"
    ) {
      return null;
    }
    legs.push({ distanceM: leg.distance, durationS: leg.duration });
  }

  return {
    distanceM: route.distance,
    durationS: route.duration,
    legs,
    coordinates,
  };
}

/**
 * Ein Batch-Request an die Open-Meteo Elevation API für die ausgewählten
 * Stützpunkte ([lon, lat]-Tupel). Liefert die Höhen in Punkt-Reihenfolge oder
 * null bei Fehler (Aufrufer rechnet dann ohne Höhenterm). Höflichkeitsregeln
 * wie apps/worker/src/sync/elevation.ts (ein Request, kommaseparierte Koords).
 */
async function fetchElevations(
  points: [number, number][],
): Promise<number[] | null> {
  if (points.length === 0) return null;
  try {
    const url = new URL(OPEN_METEO_ELEVATION_URL);
    url.searchParams.set("latitude", points.map((p) => p[1]).join(","));
    url.searchParams.set("longitude", points.map((p) => p[0]).join(","));

    const res = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(ELEVATION_TIMEOUT_MS),
    });
    if (!res.ok) return null;

    const body = (await res.json()) as { elevation?: unknown };
    if (!Array.isArray(body.elevation)) return null;
    return body.elevation.map((e) => (typeof e === "number" ? e : NaN));
  } catch {
    return null;
  }
}
