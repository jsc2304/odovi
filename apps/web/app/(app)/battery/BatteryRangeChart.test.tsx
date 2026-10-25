import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BatteryRangeChart } from "./BatteryRangeChart";

const render = (months: Parameters<typeof BatteryRangeChart>[0]["months"]) => renderToStaticMarkup(
  <BatteryRangeChart months={months} title="Rated range" description="Monthly observations" locale="en-GB" />);

describe("battery range chart", () => {
  it("shows a single point without fabricating a trend line", () => {
    const html = render([{ month: "2025-01", medianFullRangeKm: 500, sampleCount: 1 }]);
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-describedby="battery-range-description"');
    expect(html.match(/<circle/g)).toHaveLength(1);
    expect(html).not.toContain("stroke-width");
    expect(html).not.toMatch(/NaN|Infinity/);
  });
  it("preserves calendar gaps and connects only consecutive observed months", () => {
    const html = render([
      { month: "2025-01", medianFullRangeKm: 500, sampleCount: 3 },
      { month: "2025-03", medianFullRangeKm: 490, sampleCount: 1 },
      { month: "2025-04", medianFullRangeKm: 480, sampleCount: 4 },
    ]);
    expect(html.match(/stroke-width="2"/g)).toHaveLength(1);
    expect(html.match(/<circle/g)).toHaveLength(3);
    expect(html).toContain("490 km (1)");
  });
  it("draws nothing for missing data", () => expect(render([])).toBe(""));
});
