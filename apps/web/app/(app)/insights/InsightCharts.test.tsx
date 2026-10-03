import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import en from "../../../messages/en/insights.json";
import de from "../../../messages/de/insights.json";
import { MonthChart, ScatterBinnedChart, WeekdayChart } from "./InsightCharts";

function render(children: React.ReactNode, locale: "en" | "de" = "en") {
  return renderToStaticMarkup(<NextIntlClientProvider locale={locale} timeZone="Europe/Berlin" messages={{ insights: locale === "en" ? en : de }}>{children}</NextIntlClientProvider>);
}

describe("accessible analytics data", () => {
  it.each(["en", "de"] as const)("retains every plotted point and mean-range value in %s", (locale) => {
    const html = render(<ScatterBinnedChart points={[{ x: 1.2, y: 180.3 }, { x: 2.8, y: 170.4 }]}
      bins={[{ xStart: 0, xCenter: 2.5, meanY: 175.4, count: 3 }]} xLabel="Temperature" xUnit="°C" yUnit="Wh/km" ariaLabel="Consumption over temperature" />, locale);
    expect(html.match(/data-chart-data="true"/g)).toHaveLength(2);
    expect(html).toContain(locale === "en" ? "1.2" : "1,2");
    expect(html).toContain(locale === "en" ? "175.4" : "175,4");
    expect(html).toContain("0 ≤ x &lt; 5");
    expect(html).toContain("Wh/km");
    expect(html).toContain('role="region"');
    expect(html).toContain('tabindex="0"');
    expect(html).not.toContain("MISSING_MESSAGE");
  });

  it("shows a single observation without creating an average or trend line", () => {
    const html = render(<ScatterBinnedChart points={[{ x: -2, y: 240 }]} bins={[]} xLabel="Temperature" xUnit="°C" yUnit="Wh/km" ariaLabel="Consumption over temperature" />);
    expect(html.match(/data-chart-data="true"/g)).toHaveLength(1);
    expect(html).toContain("240");
    expect(html).not.toContain("<path");
  });

  it("keeps month and weekday tables aligned with the supplied selection", () => {
    const html = render(<><MonthChart months={[{ label: "Jun 25", km: 123.4, meanConsumption: 178.9, driveCount: 7 }]} />
      <WeekdayChart days={[{ label: "Monday", km: 21.5, count: 2 }, { label: "Tuesday", km: 0, count: 0 }]} /></>);
    expect(html).toContain("Jun 25");
    expect(html).toContain("123.4");
    expect(html).toContain("178.9");
    expect(html).toContain("21.5");
    expect(html).toContain("Tuesday");
    expect(html).toContain("Bars: distance (km)");
    expect(html).toContain("Line: mean consumption (Wh/km)");
  });

  it("keeps empty input free from fabricated axes or values", () => {
    const html = render(<><ScatterBinnedChart points={[]} bins={[]} xLabel="Temperature" xUnit="°C" yUnit="Wh/km" ariaLabel="Consumption" />
      <MonthChart months={[]} /><WeekdayChart days={[]} /></>);
    expect(html.match(/No values for this selection/g)).toHaveLength(3);
    expect(html).not.toContain("<svg");
    expect(html).not.toMatch(/NaN|Infinity/);
  });
});
