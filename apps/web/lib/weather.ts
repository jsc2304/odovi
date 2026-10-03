import "server-only";
import type {
  ActiveProviderResolution,
  LocationProviderAdapter,
} from "@odovi/core";
import { getLocationProviderPolicy } from "./locationProviders/policy";

const CACHE_TTL_MS = 10 * 60 * 1000;

export interface WeatherResult {
  temperature: number;
  apparentTemperature: number;
  weatherCode: number;
  windSpeedKmh: number;
  todayMin: number;
  todayMax: number;
}

interface CacheEntry {
  fetchedAt: number;
  result: WeatherResult;
}

export type WeatherLoadResult =
  | { status: "ok"; weather: WeatherResult }
  | { status: "disabled" }
  | { status: "unavailable" };

interface WeatherRequest {
  lat: number;
  lon: number;
}

// Module-level cache, keyed by coordinates rounded to ~1km — survives across
// requests within the same server process (dev server / long-lived Node
// process), not across separate lambda invocations. Good enough for the MVP;
// avoids hammering Open-Meteo on every dashboard load.
const cache = new Map<string, CacheEntry>();

function cacheKey(provider: ActiveProviderResolution, lat: number, lon: number): string {
  const endpoint = provider.endpoints.forecast ?? provider.endpoints.default ?? "missing";
  return `${provider.provider}:${endpoint}:${lat.toFixed(2)},${lon.toFixed(2)}`;
}

interface OpenMeteoResponse {
  current?: {
    temperature_2m?: number;
    apparent_temperature?: number;
    weather_code?: number;
    wind_speed_10m?: number;
  };
  daily?: {
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
    weather_code?: number[];
  };
}

/**
 * Fetches current weather + today's min/max through an active provider.
 * The caller resolves disabled and failure-soft states separately so the
 * dashboard never needs a provider to serve the Core Archive.
 * In-memory cached for 10 minutes per rounded coordinate.
 */
type FetchLike = typeof fetch;

function weatherAdapter(
  providerName: string,
  fetcher: FetchLike = fetch,
): LocationProviderAdapter<WeatherRequest, WeatherResult> {
  return {
    capability: "weather",
    provider: providerName,
    request: (input, provider) => fetchCurrentWeather(provider, input.lat, input.lon, fetcher),
  };
}

export async function fetchCurrentWeather(
  provider: ActiveProviderResolution,
  lat: number,
  lon: number,
  fetcher: FetchLike = fetch,
): Promise<WeatherResult> {
  const key = cacheKey(provider, lat, lon);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.result;
  }

  const endpoint = provider.endpoints.forecast ?? provider.endpoints.default;
  if (!endpoint) throw new Error(`${provider.provider} has no weather endpoint`);
  const url = new URL(endpoint);
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lon));
  url.searchParams.set(
    "current",
    "temperature_2m,apparent_temperature,weather_code,wind_speed_10m",
  );
  url.searchParams.set(
    "daily",
    "temperature_2m_max,temperature_2m_min,weather_code",
  );
  url.searchParams.set("timezone", "auto");
  url.searchParams.set("forecast_days", "1");

  const headers = new Headers();
  if (provider.credentialHeader && provider.credential) {
    headers.set(provider.credentialHeader, provider.credential);
  }
  const res = await fetcher(url, { cache: "no-store", headers, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`${provider.provider} weather: HTTP ${res.status}`);

  const body = (await res.json()) as OpenMeteoResponse;
  const c = body.current;
  const daily = body.daily;
  if (
    c?.temperature_2m == null ||
    c.apparent_temperature == null ||
    c.weather_code == null ||
    c.wind_speed_10m == null ||
    daily?.temperature_2m_max?.[0] == null ||
    daily?.temperature_2m_min?.[0] == null
  ) {
    throw new Error(`${provider.provider} returned incomplete weather data`);
  }

  const result: WeatherResult = {
    temperature: c.temperature_2m,
    apparentTemperature: c.apparent_temperature,
    weatherCode: c.weather_code,
    windSpeedKmh: c.wind_speed_10m,
    todayMax: daily.temperature_2m_max[0],
    todayMin: daily.temperature_2m_min[0],
  };
  cache.set(key, { fetchedAt: Date.now(), result });
  return result;
}

export async function getCurrentWeather(
  lat: number,
  lon: number,
): Promise<WeatherLoadResult> {
  const policy = await getLocationProviderPolicy();
  try {
    const result = await policy.request(
      "weather",
      { lat, lon },
      {
        public: weatherAdapter("open-meteo"),
        custom: (provider) => weatherAdapter(provider.provider),
      },
    );
    if (result.status === "disabled") return { status: "disabled" };
    return { status: "ok", weather: result.value };
  } catch {
    return { status: "unavailable" };
  }
}
