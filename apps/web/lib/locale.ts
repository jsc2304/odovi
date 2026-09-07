export const LOCALES = ["en", "de"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "odovi_locale";
export const LEGACY_LOCALE_COOKIE = "tripatlas_locale";

export const MESSAGE_NAMESPACES = [
  "common",
  "nav",
  "auth",
  "ui",
  "dashboard",
  "weather",
  "day",
  "calendar",
  "bulk",
  "drives",
  "charges",
  "journeys",
  "places",
  "tags",
  "search",
  "reports",
  "insights",
  "yearly",
  "settings",
  "rules",
  "planner",
  "exports",
] as const;

export function isLocale(value: string | null | undefined): value is Locale {
  return value === "en" || value === "de";
}

interface LanguagePreference {
  language: string;
  quality: number;
  position: number;
}

/**
 * Resolves the first supported language in an Accept-Language header. Invalid,
 * absent, wildcard-only, and unsupported preferences use the English launch
 * fallback.
 */
export function localeFromAcceptLanguage(
  acceptLanguage: string | null | undefined,
): Locale {
  if (!acceptLanguage?.trim()) return DEFAULT_LOCALE;

  const preferences: LanguagePreference[] = acceptLanguage
    .split(",")
    .map((part, position) => {
      const [rawLanguage, ...parameters] = part.trim().split(";");
      const qualityParameter = parameters.find((parameter) =>
        parameter.trim().toLowerCase().startsWith("q="),
      );
      const parsedQuality = qualityParameter
        ? Number.parseFloat(qualityParameter.trim().slice(2))
        : 1;

      return {
        language: rawLanguage?.trim().toLowerCase() ?? "",
        quality:
          Number.isFinite(parsedQuality) && parsedQuality >= 0 && parsedQuality <= 1
            ? parsedQuality
            : 0,
        position,
      };
    })
    .filter(({ language, quality }) => language !== "" && quality > 0)
    .sort((a, b) => b.quality - a.quality || a.position - b.position);

  for (const { language } of preferences) {
    const baseLanguage = language.split("-")[0];
    if (baseLanguage === "en" || baseLanguage === "de") return baseLanguage;
  }

  return DEFAULT_LOCALE;
}

export function resolveLocale({
  localeCookie,
  legacyLocaleCookie,
  acceptLanguage,
}: {
  localeCookie?: string | null;
  legacyLocaleCookie?: string | null;
  acceptLanguage?: string | null;
}): Locale {
  if (isLocale(localeCookie)) return localeCookie;
  if (isLocale(legacyLocaleCookie)) return legacyLocaleCookie;
  return localeFromAcceptLanguage(acceptLanguage);
}
