import { describe, expect, it } from "vitest";
import { fixturePdf, fixtureZip } from "./fixtures.test-support";
import { INVOICE_LIMITS, matchCandidates, metadataSchema, parseMetadata, parseUpload } from "./processing";

describe("bounded original invoice processing", () => {
  it("extracts text from a real PDF and preserves its exact bytes", async () => {
    const original = fixturePdf();
    const [pdf] = await parseUpload(original, "invoice.pdf");
    expect(pdf!.original.equals(original)).toBe(true);
    expect(parseMetadata(pdf!.text)).toEqual({ invoiceNumber: "TEST-1", invoiceDate: "2026-09-01", vin: "5YJ3E7EA1MF000001", chargingStart: "2026-09-01T10:00:00.000Z", energyKwh: 40, total: "12.34", currency: "EUR" });
  });
  it("reads compressed ZIP PDFs serially and preserves each original", async () => {
    const original = fixturePdf();
    const records = await parseUpload(await fixtureZip([["folder/one.pdf", original], ["two.pdf", fixturePdf("Tesla Invoice number: TEST-2")]]), "bundle.zip");
    expect(records.map((r) => r.filename)).toEqual(["folder/one.pdf", "two.pdf"]);
    expect(records[0]!.original.equals(original)).toBe(true);
  });
  it("rejects malformed, partial, oversized and excessively paginated PDFs", async () => {
    for (const original of [Buffer.from("%PDF-1.4 invalid %%EOF"), fixturePdf().subarray(0, -10), fixturePdf("Tesla", 21), Buffer.concat([fixturePdf(), Buffer.alloc(5 * 1024 * 1024)])]) {
      await expect(parseUpload(original, "bad.pdf")).rejects.toThrow("invalid-upload");
    }
    await expect(parseUpload(Buffer.alloc(INVOICE_LIMITS.uploadBytes + 1), "bad.zip")).rejects.toThrow("invalid-upload");
  });
  it("rejects ZIP bombs, too many entries, unsafe names and partially invalid bundles", async () => {
    const bomb = await fixtureZip([["huge.pdf", Buffer.alloc(1024 * 1024, 65)]]);
    const tooMany = await fixtureZip(Array.from({ length: 51 }, (_, i) => [`${i}.pdf`, fixturePdf()] as [string, Buffer]));
    const partial = await fixtureZip([["valid.pdf", fixturePdf()], ["broken.pdf", Buffer.from("bad")]]);
    const traversal = await fixtureZip([["safe.pdf", fixturePdf()]]);
    // Rewrite both local and central filenames to a same-length traversal path.
    let at = traversal.indexOf("safe.pdf");
    while (at >= 0) { traversal.write("../a.pdf", at); at = traversal.indexOf("safe.pdf", at + 8); }
    for (const original of [bomb, tooMany, partial, traversal, partial.subarray(0, -20)]) await expect(parseUpload(original, "bad.zip")).rejects.toThrow("invalid-upload");
  });
  it("rejects encrypted ZIP entries and CRC corruption", async () => {
    const encrypted = await fixtureZip([["one.pdf", fixturePdf()]], false);
    const central = encrypted.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    encrypted.writeUInt16LE(encrypted.readUInt16LE(central + 8) | 1, central + 8);
    await expect(parseUpload(encrypted, "encrypted.zip")).rejects.toThrow("invalid-upload");
    const corrupt = await fixtureZip([["one.pdf", fixturePdf()]], false);
    corrupt[corrupt.indexOf("Tesla")] = 88;
    await expect(parseUpload(corrupt, "corrupt.zip")).rejects.toThrow("invalid-upload");
  });
  it("leaves unsupported formats and unknown metadata explicit", () => {
    expect(parseMetadata("Other vendor Invoice date: 2026-09-01 Total: 10.00 EUR").total).toBeNull();
    expect(parseMetadata("Tesla Invoice date: 2026-02-30 Total: 10.00").invoiceDate).toBeNull();
    expect(parseMetadata("Tesla Invoice date: 9999-99-99").invoiceDate).toBeNull();
    expect(parseMetadata("Tesla Subtotal: 10.00 EUR").total).toBeNull();
    expect(parseMetadata("Tesla Total: 10.00 EUR Total: 12.00 EUR").total).toBeNull();
    expect(parseMetadata("Tesla Total: 0010.00 EUR").total).toBe("10.00");
    expect(metadataSchema.safeParse({ ...parseMetadata("Tesla"), invoiceDate: "9999-99-99" }).success).toBe(false);
  });
  it("requires unique VIN/time/energy agreement for a matched suggestion", () => {
    const metadata = parseMetadata("Tesla VIN: 5YJ3E7EA1MF000001 Charging start: 2026-09-01T10:00:00Z Energy delivered: 40 kWh");
    const charge = { id: 1, vin: metadata.vin, startTime: new Date(metadata.chargingStart!), energyAddedKwh: 40 };
    expect(matchCandidates(metadata, [charge]).status).toBe("matched");
    expect(matchCandidates(metadata, [charge, { ...charge, id: 2 }]).status).toBe("probable");
    expect(matchCandidates({ ...metadata, vin: null }, [charge]).status).toBe("probable");
    expect(matchCandidates(metadata, [{ ...charge, vin: "5YJ3E7EA1MF000002" }]).status).toBe("unmatched");
  });
});
