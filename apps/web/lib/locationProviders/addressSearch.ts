import {
  ODOVI_VERSION,
  PUBLIC_LOCATION_PROVIDERS,
  type ActiveProviderResolution,
  type DisabledProviderResolution,
  type LocationProviderAdapter,
  type LocationProviderPolicy,
} from "@odovi/core";

const PUBLIC_MIN_INTERVAL_MS = 1_000;
const DEFAULT_CACHE_TTL_MS = 24 * 60 * 60 * 1_000;
const DEFAULT_MAX_CACHE_ENTRIES = 128;
const REQUEST_TIMEOUT_MS = 5_000;
const MAX_QUERY_LENGTH = 200;
const RESULT_LIMIT = 5;

// Public Nominatim requires an application-identifying User-Agent and permits
// no more than one request per second for the whole application.
// Source: https://operations.osmfoundation.org/policies/nominatim/
export const NOMINATIM_USER_AGENT =
  `Odovi/${ODOVI_VERSION} (+https://github.com/jsc2304/odovi)`;

export interface AddressSearchInput {
  query: string;
  language: string;
}

export interface AddressSearchResult {
  label: string;
  lat: number;
  lon: number;
}

export interface AddressSearchAttribution {
  label: string;
  url: string;
}

type AddressSearchSource = "provider" | "cache";

export type AddressSearchResponse =
  | { status: "disabled"; results: []; reason: DisabledProviderResolution["reason"] }
  | { status: "invalid"; results: [] }
  | {
      status: "rate-limited";
      results: [];
      retryAfterMs: number;
      attribution: AddressSearchAttribution;
    }
  | {
      status: "upstream-failure";
      results: [];
      attribution: AddressSearchAttribution;
    }
  | {
      status: "empty";
      results: [];
      source: AddressSearchSource;
      attribution: AddressSearchAttribution;
    }
  | {
      status: "ok";
      results: AddressSearchResult[];
      source: AddressSearchSource;
      attribution: AddressSearchAttribution;
    };

interface CacheEntry {
  expiresAt: number;
  results: AddressSearchResult[];
}

export interface AddressSearchServiceOptions {
  fetch?: typeof fetch;
  now?: () => number;
  maxCacheEntries?: number;
  cacheTtlMs?: number;
  timeoutSignal?: (milliseconds: number) => AbortSignal | undefined;
}

function normalizeQuery(query: string): string {
  return query.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en");
}

function normalizeLanguage(language: string): string {
  const normalized = language.trim().toLowerCase();
  return /^[a-z]{2}(?:-[a-z0-9]{2,8})?$/.test(normalized) ? normalized : "en";
}

function shortLabel(item: {
  display_name: string;
  address?: Record<string, string | undefined>;
}): string {
  const address = item.address;
  if (!address) return item.display_name;

  const street = [address.road, address.house_number].filter(Boolean).join(" ");
  const city =
    address.city ?? address.town ?? address.village ?? address.municipality ?? "";
  const label = [street, city].filter(Boolean).join(", ");
  return label || item.display_name;
}

function parseResults(value: unknown): AddressSearchResult[] | null {
  if (!Array.isArray(value)) return null;

  return value
    .slice(0, RESULT_LIMIT)
    .map((item): AddressSearchResult | null => {
      if (
        typeof item !== "object" ||
        item === null ||
        typeof (item as { display_name?: unknown }).display_name !== "string" ||
        typeof (item as { lat?: unknown }).lat !== "string" ||
        typeof (item as { lon?: unknown }).lon !== "string"
      ) {
        return null;
      }
      const record = item as {
        display_name: string;
        lat: string;
        lon: string;
        address?: Record<string, string | undefined>;
      };
      const lat = Number(record.lat);
      const lon = Number(record.lon);
      if (
        !Number.isFinite(lat) ||
        !Number.isFinite(lon) ||
        lat < -90 ||
        lat > 90 ||
        lon < -180 ||
        lon > 180
      ) {
        return null;
      }
      const label = shortLabel(record).trim();
      if (!label || label.length > 500) return null;
      return { label, lat, lon };
    })
    .filter((result): result is AddressSearchResult => result !== null);
}

function attributionFor(provider: ActiveProviderResolution): AddressSearchAttribution {
  return provider.mode === "public"
    ? {
        label: "© OpenStreetMap contributors",
        url: provider.endpoints.attribution ?? provider.contactUrl,
      }
    : { label: provider.provider, url: provider.contactUrl };
}

function retryAfterMilliseconds(response: Response, now: number): number {
  const raw = response.headers.get("retry-after")?.trim();
  if (!raw) return PUBLIC_MIN_INTERVAL_MS;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.max(1, seconds * 1_000);
  const date = Date.parse(raw);
  return Number.isFinite(date) ? Math.max(1, date - now) : PUBLIC_MIN_INTERVAL_MS;
}

/**
 * One installation-wide address-search gate. A single shared instance owns
 * the public-provider clock and bounded LRU cache for every UI caller.
 */
export class AddressSearchService {
  private readonly fetcher: typeof fetch;
  private readonly now: () => number;
  private readonly maxCacheEntries: number;
  private readonly cacheTtlMs: number;
  private readonly timeoutSignal: (milliseconds: number) => AbortSignal | undefined;
  private readonly cache = new Map<string, CacheEntry>();
  private lastPublicRequestAt = Number.NEGATIVE_INFINITY;

  constructor(options: AddressSearchServiceOptions = {}) {
    this.fetcher = options.fetch ?? fetch;
    this.now = options.now ?? Date.now;
    this.maxCacheEntries = Math.max(1, options.maxCacheEntries ?? DEFAULT_MAX_CACHE_ENTRIES);
    this.cacheTtlMs = Math.max(1, options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS);
    this.timeoutSignal =
      options.timeoutSignal ??
      ((milliseconds) =>
        typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(milliseconds) : undefined);
  }

  async search(
    input: AddressSearchInput,
    provider: ActiveProviderResolution,
  ): Promise<AddressSearchResponse> {
    const normalizedQuery = normalizeQuery(input.query);
    if (normalizedQuery.length < 3 || normalizedQuery.length > MAX_QUERY_LENGTH) {
      return { status: "invalid", results: [] };
    }

    const language = normalizeLanguage(input.language);
    const endpoint =
      provider.mode === "public" ? provider.endpoints.search : provider.endpoints.default;
    if (!endpoint) {
      return {
        status: "upstream-failure",
        results: [],
        attribution: attributionFor(provider),
      };
    }

    const cacheKey = `${provider.mode}\n${provider.provider}\n${endpoint}\n${language}\n${normalizedQuery}`;
    const now = this.now();
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      this.cache.delete(cacheKey);
      this.cache.set(cacheKey, cached);
      return cached.results.length > 0
        ? {
            status: "ok",
            results: cached.results,
            source: "cache",
            attribution: attributionFor(provider),
          }
        : {
            status: "empty",
            results: [],
            source: "cache",
            attribution: attributionFor(provider),
          };
    }
    if (cached) this.cache.delete(cacheKey);

    if (provider.mode === "public") {
      const elapsed = now - this.lastPublicRequestAt;
      if (elapsed < PUBLIC_MIN_INTERVAL_MS) {
        return {
          status: "rate-limited",
          results: [],
          retryAfterMs: PUBLIC_MIN_INTERVAL_MS - elapsed,
          attribution: attributionFor(provider),
        };
      }
      // The check and assignment are synchronous, so concurrent requests in
      // the single Odovi web process cannot both pass this gate.
      this.lastPublicRequestAt = now;
    }

    try {
      // Nominatim documents free-form `q`, explicit JSON output, result limits,
      // address details, and language preference for the /search endpoint.
      // Source: https://nominatim.org/release-docs/latest/api/Search/
      const url = new URL(endpoint);
      url.searchParams.set("format", "jsonv2");
      url.searchParams.set("limit", String(RESULT_LIMIT));
      url.searchParams.set("addressdetails", "1");
      url.searchParams.set("accept-language", language);
      url.searchParams.set("q", input.query.trim());

      const headers = new Headers({ Accept: "application/json" });
      if (provider.mode === "public") headers.set("User-Agent", NOMINATIM_USER_AGENT);
      if (provider.credentialHeader && provider.credential) {
        headers.set(provider.credentialHeader, provider.credential);
      }

      const response = await this.fetcher(url, {
        headers,
        cache: "no-store",
        signal: this.timeoutSignal(REQUEST_TIMEOUT_MS),
      });
      if (response.status === 429) {
        return {
          status: "rate-limited",
          results: [],
          retryAfterMs: retryAfterMilliseconds(response, now),
          attribution: attributionFor(provider),
        };
      }
      if (!response.ok) {
        return {
          status: "upstream-failure",
          results: [],
          attribution: attributionFor(provider),
        };
      }

      const results = parseResults(await response.json());
      if (results === null) {
        return {
          status: "upstream-failure",
          results: [],
          attribution: attributionFor(provider),
        };
      }

      this.cache.set(cacheKey, { results, expiresAt: now + this.cacheTtlMs });
      while (this.cache.size > this.maxCacheEntries) {
        const oldest = this.cache.keys().next().value as string | undefined;
        if (oldest == null) break;
        this.cache.delete(oldest);
      }

      return results.length > 0
        ? {
            status: "ok",
            results,
            source: "provider",
            attribution: attributionFor(provider),
          }
        : {
            status: "empty",
            results: [],
            source: "provider",
            attribution: attributionFor(provider),
          };
    } catch {
      return {
        status: "upstream-failure",
        results: [],
        attribution: attributionFor(provider),
      };
    }
  }
}

class ControlledAddressSearchAdapter
  implements LocationProviderAdapter<AddressSearchInput, AddressSearchResponse>
{
  readonly capability = "addressSearch" as const;

  constructor(
    readonly provider: string,
    private readonly service: AddressSearchService,
  ) {}

  request(
    input: AddressSearchInput,
    provider: ActiveProviderResolution,
  ): Promise<AddressSearchResponse> {
    return this.service.search(input, provider);
  }
}

export async function searchAddressWithPolicy(
  policy: LocationProviderPolicy,
  input: AddressSearchInput,
  service: AddressSearchService,
): Promise<AddressSearchResponse> {
  const result = await policy.request("addressSearch", input, {
    public: new ControlledAddressSearchAdapter(
      PUBLIC_LOCATION_PROVIDERS.addressSearch.id,
      service,
    ),
    custom: (provider) => new ControlledAddressSearchAdapter(provider.provider, service),
  });
  return result.status === "disabled"
    ? { status: "disabled", results: [], reason: result.resolution.reason }
    : result.value;
}

const globalAddressSearch = globalThis as typeof globalThis & {
  __odoviAddressSearchService?: AddressSearchService;
};

export function getAddressSearchService(): AddressSearchService {
  globalAddressSearch.__odoviAddressSearchService ??= new AddressSearchService();
  return globalAddressSearch.__odoviAddressSearchService;
}
