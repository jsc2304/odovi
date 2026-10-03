import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import en from "../../../messages/en/calendar.json";
import de from "../../../messages/de/calendar.json";
import { buildCalendarGrid, type CalendarDayStats } from "../../../lib/calendarGrid";
import { MonthGrid } from "./MonthGrid";

const stats: CalendarDayStats = {
  date: "2025-06-01", driveCount: 1234, totalKm: 12345.6, chargeCount: 2,
  totalEnergyKwh: 2000, usableDistanceKm: 12000, avgConsumptionWhKm: 166.7,
  anyEstimated: true, hasIncompleteEnergy: true, drives: [],
};

function render(locale: "en" | "de", withStats = true) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} timeZone="Europe/Berlin" messages={{ calendar: locale === "en" ? en : de }}>
      <MonthGrid cells={buildCalendarGrid("2025-06", new Map(withStats ? [[stats.date, stats]] : []), "2025-06-01")}
        month="2025-06" vehicleQuery="?vehicle=7" timeZone="Europe/Berlin" />
    </NextIntlClientProvider>,
  );
}

describe("calendar day controls", () => {
  it.each(["en", "de"] as const)("exposes full values and one named day trigger in %s", (locale) => {
    const html = render(locale);
    expect(html.match(/aria-haspopup="dialog"/g)).toHaveLength(30);
    expect(html.match(/data-date="2025-06-01"/g)).toHaveLength(1);
    expect(html).toContain('aria-current="date"');
    expect(html).toContain(locale === "en" ? "12,345.6 km" : "12.345,6 km");
    expect(html).toContain(locale === "en" ? "2 charging sessions" : "2 Ladevorgänge");
    expect(html).not.toContain("truncate");
    expect(html).not.toContain("h-5 w-5");
    expect(html).not.toContain("MISSING_MESSAGE");
    expect(html).toContain('href="/day/2025-05-31?vehicle=7&amp;month=2025-06"');
  });

  it.each(["en", "de"] as const)("names empty-day previews in %s without implying unavailable consumption is zero", (locale) => {
    const html = render(locale, false);
    expect(html).toContain(locale === "en" ? "No recorded drives on this day." : "Keine aufgezeichneten Fahrten an diesem Tag.");
    expect(html).not.toContain("0 Wh/km");
    expect(html.match(/aria-haspopup="dialog"/g)).toHaveLength(30);
  });
});
