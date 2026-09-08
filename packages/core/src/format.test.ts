import { describe, expect, it } from "vitest";
import {
  formatConsumption,
  formatDuration,
  formatKm,
  formatKw,
  formatKwh,
  formatOdometer,
  formatPlaceLabel,
  formatSoc,
  formatSpeed,
  formatTemp,
  formatTime,
  formatTimeRange,
} from "./format.js";

describe("formatKm", () => {
  it("formats with one decimal and de-DE comma separator", () => {
    expect(formatKm(27.3)).toBe("27,3 km");
  });

  it("rounds to one decimal", () => {
    expect(formatKm(10)).toBe("10,0 km");
  });

  it("handles zero", () => {
    expect(formatKm(0)).toBe("0,0 km");
  });
});

describe("formatDuration", () => {
  it("formats sub-hour durations as minutes", () => {
    expect(formatDuration(1980)).toBe("33 min");
  });

  it("formats durations over an hour as hours and minutes", () => {
    expect(formatDuration(5700)).toBe("1 h 35 min");
  });

  it("handles exact hours", () => {
    expect(formatDuration(7200)).toBe("2 h 0 min");
  });
});

describe("formatTemp", () => {
  it("formats with one decimal and de-DE comma separator", () => {
    expect(formatTemp(18.5)).toBe("18,5 °C");
  });

  it("adds a decimal for whole numbers", () => {
    expect(formatTemp(20)).toBe("20,0 °C");
  });

  it("handles negative temperatures", () => {
    expect(formatTemp(-3)).toBe("-3,0 °C");
  });
});

describe("formatKw", () => {
  it("formats a power without decimals", () => {
    expect(formatKw(245)).toBe("245 kW");
  });

  it("shows recuperation (negative) as a positive value", () => {
    expect(formatKw(-62)).toBe("62 kW");
  });

  it("rounds to whole kW", () => {
    expect(formatKw(44.6)).toBe("45 kW");
  });
});

describe("formatSpeed", () => {
  it("formats a speed without decimals", () => {
    expect(formatSpeed(132)).toBe("132 km/h");
  });

  it("rounds to whole km/h", () => {
    expect(formatSpeed(88.6)).toBe("89 km/h");
  });
});

const TZ = "Europe/Zurich";

describe("formatTime", () => {
  it("formats a UTC instant as 24h clock in the given timezone", () => {
    // 05:50 UTC in July (CEST, +02:00) -> 07:50 local
    expect(formatTime(new Date("2026-07-02T05:50:00Z"), TZ)).toBe("07:50");
  });

  it("respects winter offset (CET, +01:00)", () => {
    expect(formatTime(new Date("2026-01-15T07:00:00Z"), TZ)).toBe("08:00");
  });
});

describe("formatTimeRange", () => {
  it("formats a closed range with an en dash", () => {
    expect(
      formatTimeRange(
        new Date("2026-07-02T05:58:00Z"),
        new Date("2026-07-02T06:14:00Z"),
        TZ,
      ),
    ).toBe("07:58 – 08:14");
  });

  it("formats an open-ended range as 'seit HH:mm'", () => {
    expect(
      formatTimeRange(new Date("2026-07-02T15:36:00Z"), null, TZ),
    ).toBe("seit 17:36");
  });
});

describe("formatKwh", () => {
  it("formats with one decimal and de-DE comma", () => {
    expect(formatKwh(30.2)).toBe("30,2 kWh");
  });

  it("prepends a plus sign when requested for positive values", () => {
    expect(formatKwh(30.2, { sign: true })).toBe("+30,2 kWh");
  });

  it("omits the plus sign for zero", () => {
    expect(formatKwh(0, { sign: true })).toBe("0,0 kWh");
  });
});

describe("formatSoc", () => {
  it("formats an integer percentage", () => {
    expect(formatSoc(45)).toBe("45 %");
  });

  it("rounds fractional values", () => {
    expect(formatSoc(79.6)).toBe("80 %");
  });
});

describe("formatConsumption", () => {
  it("formats without estimate marker by default", () => {
    expect(formatConsumption(162)).toBe("162 Wh/km");
  });

  it("appends a tilde marker when estimated", () => {
    expect(formatConsumption(141.58, true)).toBe("142 Wh/km ~");
  });
});

describe("formatOdometer", () => {
  it("formats with one decimal and thousands grouping", () => {
    expect(formatOdometer(48213.7)).toBe("48.213,7 km");
  });

  it("handles small values without grouping", () => {
    expect(formatOdometer(213.7)).toBe("213,7 km");
  });
});

describe("formatPlaceLabel", () => {
  it("prefers a named place", () => {
    expect(formatPlaceLabel("Zuhause", "Bahnhofstr. 1", 47, 8)).toBe("Zuhause");
  });

  it("falls back to the address when no place name", () => {
    expect(formatPlaceLabel(null, "Bahnhofstr. 1", 47, 8)).toBe(
      "Bahnhofstr. 1",
    );
  });

  it("falls back to rounded coordinates when no name or address", () => {
    expect(formatPlaceLabel(null, null, 47.3769, 8.5417)).toBe(
      "47,3769, 8,5417",
    );
  });

  it("ignores blank strings", () => {
    expect(formatPlaceLabel("  ", "  ", 47.3769, 8.5417)).toBe(
      "47,3769, 8,5417",
    );
  });

  it("returns a generic fallback when nothing is known", () => {
    expect(formatPlaceLabel(null, null, null, null)).toBe("Unbekannter Ort");
  });
});

it("formats English UI values without changing the German defaults", () => {
  expect(formatKm(1234.5, "en")).toBe("1,234.5 km");
  expect(formatKwh(30.2, { sign: true }, "en")).toBe("+30.2 kWh");
  expect(formatOdometer(48213.7, "en")).toBe("48,213.7 km");
  expect(formatTemp(-3.5, "en")).toBe("-3.5 °C");
  expect(formatTimeRange(new Date("2026-07-02T15:36:00Z"), null, TZ, "en")).toBe("since 17:36");
  expect(formatPlaceLabel(null, null, 47.3769, 8.5417, "en")).toBe("47.3769, 8.5417");
  expect(formatPlaceLabel(null, null, null, null, "en")).toBe("Unknown place");
  expect(formatKm(1234.5)).toBe("1.234,5 km");
});
