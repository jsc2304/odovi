// Isolated parser: no credentials, disk writes, URL input, PDF rendering or scripts.
// PDF.js: https://mozilla.github.io/pdf.js/api/draft/api.js.html
// ZIP lazy entries/size validation: https://github.com/thejoshwolfe/yauzl#readme
import { crc32 } from "node:zlib";
import yauzl from "yauzl";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
const MAX_PDF = 5 * 1024 * 1024;
const MAX_TOTAL = 20 * 1024 * 1024;
globalThis.fetch = () => { throw new Error("External requests disabled"); };

async function pdfText(data) {
  if (!data.subarray(0, 5).equals(Buffer.from("%PDF-")) || !/%%EOF\s*$/.test(data.subarray(-1024).toString("latin1"))) {
    throw new Error("Invalid or incomplete PDF");
  }
  const task = getDocument({ data: new Uint8Array(data), isEvalSupported: false, stopAtErrors: true,
    disableFontFace: true, useSystemFonts: false, useWorkerFetch: false, useWasm: false,
    maxImageSize: 0, enableXfa: false, verbosity: 0 });
  try {
    const pdf = await task.promise;
    if (pdf.numPages > 20) throw new Error("PDF has more than 20 pages");
    let text = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      for (const item of content.items) {
        if ("str" in item) text += item.str + (item.hasEOL ? "\n" : " ");
        if (text.length > 200_000) throw new Error("PDF text limit exceeded");
      }
      text += "\n";
      page.cleanup();
    }
    return text;
  } finally { await task.destroy(); }
}

async function extract(data, filename) {
  if (data.length === 0 || data.length > MAX_TOTAL) throw new Error("Upload size limit exceeded");
  const files = [];
  const addPdf = async (name, original) => {
    if (!original.length || original.length > MAX_PDF) throw new Error("PDF size limit exceeded");
    files.push({ filename: name, original, text: await pdfText(original) });
  };
  if (/\.pdf$/i.test(filename)) { await addPdf(filename, data); return files; }
  if (!/\.zip$/i.test(filename)) throw new Error("Only PDF and ZIP uploads are supported");
  await new Promise((resolve, reject) => {
    yauzl.fromBuffer(data, { lazyEntries: true, validateEntrySizes: true, strictFileNames: true }, (err, zip) => {
      if (err) return reject(err);
      if (zip.entryCount > 50) { zip.close(); return reject(new Error("ZIP has more than 50 entries")); }
      let total = 0;
      const names = new Set();
      const fail = (error) => { zip.close(); reject(error); };
      zip.on("error", fail);
      zip.on("end", resolve);
      zip.on("entry", async (entry) => {
        try {
          const name = entry.fileName;
          const type = (entry.externalFileAttributes >>> 16) & 0xf000;
          if (entry.generalPurposeBitFlag & 1 || (type && type !== 0x8000 && type !== 0x4000)) throw new Error("Encrypted ZIPs and special files are unsupported");
          if (name.length > 240 || /[\x00-\x1f\x7f]/.test(name) || names.has(name)) throw new Error("Invalid or duplicate ZIP filename");
          names.add(name);
          if (name.endsWith("/")) { zip.readEntry(); return; }
          if (!/\.pdf$/i.test(name)) throw new Error("ZIP may contain only PDFs and directories");
          total += entry.uncompressedSize;
          if (!entry.uncompressedSize || entry.uncompressedSize > MAX_PDF || total > MAX_TOTAL || entry.uncompressedSize > Math.max(1, entry.compressedSize) * 100) throw new Error("ZIP expansion limit exceeded");
          const stream = await new Promise((ok, no) => zip.openReadStream(entry, (error, value) => error ? no(error) : ok(value)));
          let size = 0;
          const chunks = [];
          for await (const chunk of stream) {
            size += chunk.length;
            if (size > entry.uncompressedSize || size > MAX_PDF) { stream.destroy(); throw new Error("ZIP expansion limit exceeded"); }
            chunks.push(chunk);
          }
          const original = Buffer.concat(chunks);
          if (original.length !== entry.uncompressedSize || crc32(original) !== entry.crc32) throw new Error("ZIP integrity check failed");
          await addPdf(name, original);
          zip.readEntry();
        } catch (error) { fail(error); }
      });
      zip.readEntry();
    });
  });
  if (!files.length) throw new Error("ZIP contains no PDFs");
  return files;
}

process.once("message", async ({ data, filename }) => {
  try { process.send({ files: await extract(data, filename) }, () => process.exit(0)); }
  catch { process.send({ error: "invalid-upload" }, () => process.exit(1)); }
});
