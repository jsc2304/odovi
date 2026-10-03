import { expect, it } from "vitest";
import { normalizeInvoiceAmount } from "./amount";

it("pads valid decimal text and never rounds invalid precision or accepts exponents", () => {
  for (const [input, expected] of [["12", "12.00"], ["12,3", "12.30"], ["12.34", "12.34"], ["1.005", "1.005"], ["1,005", "1.005"], ["1e3", "1e3"], ["123456789", "123456789"]]) {
    expect(normalizeInvoiceAmount(input!)).toBe(expected);
  }
  expect(normalizeInvoiceAmount(null)).toBeNull();
});
