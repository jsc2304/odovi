import { ZipFile } from "yazl";

/** Synthetic, complete text PDF; no customer documents are used in checks. */
export function fixturePdf(text = "Tesla Invoice number: TEST-1 Invoice date: 2026-09-01 VIN: 5YJ3E7EA1MF000001 Charging start: 2026-09-01T10:00:00Z Energy delivered: 40.0 kWh Total amount: 12.34 EUR", pages = 1) {
  const lines = text.split(/\n| (?=Invoice |VIN:|Charging |Energy |Total )/);
  const content = `BT /F1 10 Tf 50 750 Td ${lines.map((line) => `(${line.replace(/[()\\]/g, "\\$&")}) Tj`).join(" 0 -15 Td ")} ET`;
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${Array.from({ length: pages }, (_, i) => `${5 + i} 0 R`).join(" ")}] /Count ${pages} >>`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
    ...Array.from({ length: pages }, () => "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents 4 0 R >>")];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, i) => { offsets.push(Buffer.byteLength(pdf)); pdf += `${i + 1} 0 obj\n${object}\nendobj\n`; });
  const start = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => String(offset).padStart(10, "0") + " 00000 n \n").join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
  return Buffer.from(pdf);
}

export async function fixtureZip(files: [string, Buffer][], compress = true): Promise<Buffer> {
  const zip = new ZipFile();
  for (const [name, data] of files) zip.addBuffer(data, name, { compress });
  const result = new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    zip.outputStream.on("data", (chunk: Buffer) => chunks.push(chunk));
    zip.outputStream.once("error", reject);
    zip.outputStream.once("end", () => resolve(Buffer.concat(chunks)));
  });
  zip.end();
  return result;
}
