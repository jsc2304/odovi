import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BottomNav, HeaderSearch, SideNav } from "../components/Nav";
import de from "../messages/de/nav.json";
import en from "../messages/en/nav.json";
import {
  APP_DESTINATIONS,
  MORE_DESTINATION,
  type MoreGroup,
} from "../components/navigation";

const state = vi.hoisted(() => ({ pathname: "/", locale: "de" }));
vi.mock("next/navigation", () => ({ usePathname: () => state.pathname }));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: keyof typeof de) =>
    (state.locale === "de" ? de : en)[key],
}));

beforeEach(() => {
  state.pathname = "/";
  state.locale = "de";
});

describe("navigation registry", () => {
  it("keeps Insights active for the annual Wrapped view", () => {
    expect(APP_DESTINATIONS.filter((destination) => destination.match("/wrapped")).map((destination) => destination.id)).toEqual(["insights"]);
    expect(APP_DESTINATIONS.find((destination) => destination.id === "insights")?.match("/insights")).toBe(true);
  });

  it("keeps the mobile bar at five stable destinations", () => {
    const mobile = [
      ...APP_DESTINATIONS.filter((destination) => destination.mobilePrimary),
      MORE_DESTINATION,
    ];

    expect(mobile.map((destination) => destination.id)).toEqual([
      "start",
      "day",
      "calendar",
      "journeys",
      "settings",
    ]);
  });

  it("exposes every More destination in exactly one intent group", () => {
    const expected: Record<MoreGroup, string[]> = {
      plan: ["calendar", "journeys", "planner"],
      review: ["charges", "insights", "places", "reports"],
      configure: ["rules", "settings", "tags"],
    };

    for (const group of Object.keys(expected) as MoreGroup[]) {
      const ids = APP_DESTINATIONS.filter(
        (destination) => destination.moreGroup === group,
      )
        .map((destination) => destination.id)
        .sort();
      expect(ids).toEqual(expected[group]);
    }
  });
});

describe("navigation links", () => {
  it("marks the calendar as the active bottom destination", () => {
    state.pathname = "/calendar";
    const html = renderToStaticMarkup(createElement(BottomNav));

    const calendarLink = html.match(/<a\b[^>]*href="\/calendar"[^>]*>/)?.[0];
    expect(calendarLink).toContain('aria-current="page"');
    expect(html).not.toContain('href="/search"');
  });

  it.each([
    ["de", "Suche"],
    ["en", "Search"],
  ])("labels the header search accessibly in %s and marks its active route", (locale, label) => {
    state.locale = locale;
    const inactive = renderToStaticMarkup(createElement(HeaderSearch));
    expect(inactive).toContain('href="/search"');
    expect(inactive).toContain(`aria-label="${label}"`);
    expect(inactive).not.toContain('aria-current="page"');

    state.pathname = "/search";
    const active = renderToStaticMarkup(createElement(HeaderSearch));
    expect(active).toContain('aria-current="page"');
  });

  it("keeps calendar and search accessible in the desktop sidebar", () => {
    const html = renderToStaticMarkup(createElement(SideNav));
    expect(html).toContain('href="/calendar"');
    expect(html).toContain('href="/search"');
  });
});
