"use client";
import { useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import type { listArchive } from "../../../lib/invoices/archive";

type Archive = Awaited<ReturnType<typeof listArchive>>;
const control = "w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-2 dark:border-neutral-700";
const button = "rounded-lg border border-neutral-300 px-3 py-2 text-sm disabled:opacity-50 dark:border-neutral-700";

export function InvoiceArchive({ initial }: { initial: Archive }) {
  const t = useTranslations("invoices");
  const [archive, setArchive] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const refresh = async () => { const response = await fetch("/api/invoices", { cache: "no-store" }); if (!response.ok) throw new Error("archive-unavailable"); setArchive(await response.json()); };
  async function mutate(url: string, method: string, body?: BodyInit, headers?: HeadersInit) {
    if (url !== "/api/invoices" && !url.startsWith("/api/invoices/")) throw new Error("archive-unavailable");
    setBusy(true); setMessage("");
    try {
      const response = await fetch(url, { method, headers: { "x-odovi-invoice": "1", ...headers }, body });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      await refresh();
      setMessage(method === "DELETE" ? t("deleted", { restored: result.restored, preserved: result.preserved }) : t("saved"));
    } catch (error) {
      const code = error instanceof Error ? error.message : "archive-unavailable";
      setMessage(t.has(`errors.${code}`) ? t(`errors.${code}`) : t("errors.archive-unavailable"));
    } finally { setBusy(false); }
  }
  return <div className="space-y-5">
    <section className="space-y-4 rounded-2xl border border-neutral-200 p-4 dark:border-neutral-800">
      <label className="flex items-center gap-2"><input type="checkbox" checked={archive.enabled} disabled={busy} onChange={(e) => void mutate("/api/invoices/settings", "PATCH", JSON.stringify({ enabled: e.target.checked }), { "Content-Type": "application/json" })} />{t("enable")}</label>
      <p className="text-sm text-neutral-500">{t("limits")}</p>
      <label className="block text-sm">{t("upload")}<input className={`${control} mt-2`} type="file" accept=".pdf,.zip" disabled={!archive.enabled || busy} onChange={(event) => {
        const file = event.target.files?.[0];
        if (file) void mutate("/api/invoices", "POST", file, { "x-invoice-filename": encodeURIComponent(file.name), "Content-Type": "application/octet-stream" });
        event.target.value = "";
      }} /></label>
      <div className="flex flex-wrap items-end gap-3"><label className="text-sm">{t("month")}<input className={`${control} mt-1`} type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></label><a className={button} href={`/api/invoices/export?month=${encodeURIComponent(month)}`}>{t("export")}</a></div>
    </section>
    <p role="status" className="text-sm">{busy ? t("working") : message}</p>
    <p className="text-sm text-neutral-500">{t("recent")}</p>
    {!archive.uploads.length && <p>{t("empty")}</p>}
    {archive.uploads.map((upload) => <section key={upload.id} className="space-y-4 rounded-2xl border border-neutral-200 p-4 dark:border-neutral-800">
      <div className="flex flex-wrap items-center justify-between gap-3"><a className="break-all font-semibold underline" href={`/api/invoices/upload/${upload.id}`}>{upload.filename}</a><button className={button} disabled={busy} onClick={() => {
        if (window.confirm(t("confirmDelete", { filename: upload.filename }))) void mutate(`/api/invoices/upload/${upload.id}`, "DELETE");
      }}>{t("deleteUpload")}</button></div>
      <p className="break-all font-mono text-xs text-neutral-500">SHA-256: {upload.sha256}</p>
      {archive.invoices.filter((r) => r.uploadId === upload.id).map((record) => {
        const metadata = record.reviewedMetadata ?? record.parsedMetadata;
        return <details key={record.id} className="rounded-xl border border-neutral-200 p-3 dark:border-neutral-800">
          <summary className="cursor-pointer break-all font-medium">{record.filename} · {t(`status.${record.match.status}`)}{record.match.confirmed ? ` · ${t("confirmed")}` : ""}</summary>
          <div className="mt-3 space-y-3">
            <a className="text-sm underline" href={`/api/invoices/invoice/${record.id}`}>{t("downloadPdf")}</a>
            {record.chargeSessionId && <Link className="ml-4 text-sm underline" href={`/charges/${record.chargeSessionId}`}>{t("openCharge")}</Link>}
            <p className="break-all font-mono text-xs text-neutral-500">SHA-256: {record.sha256}</p>
            <p className="text-sm text-neutral-500">{t("reviewHint")}</p>
            {record.enrichment ? <p className="text-sm">{t("enriched")}</p> : <form className="space-y-3" onSubmit={(e) => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              const field = (name: string) => String(data.get(name) ?? "").trim() || null;
              const energy = field("energyKwh"), charge = field("chargeSessionId"), total = field("total");
              void mutate(`/api/invoices/invoice/${record.id}`, "PATCH", JSON.stringify({ metadata: {
                invoiceNumber: field("invoiceNumber"), invoiceDate: field("invoiceDate"), vin: field("vin")?.toUpperCase() ?? null,
                chargingStart: field("chargingStart"), energyKwh: energy ? Number(energy.replace(",", ".")) : null,
                total: total ? Number(total.replace(",", ".")).toFixed(2) : null, currency: field("currency")?.toUpperCase() ?? null,
              }, chargeSessionId: charge ? Number(charge) : null, enrich: data.get("enrich") === "on" }), { "Content-Type": "application/json" });
            }}>
              <div className="grid gap-3 sm:grid-cols-2">
                {(["invoiceNumber", "invoiceDate", "vin", "chargingStart", "energyKwh", "total", "currency"] as const).map((field) => <label key={field} className="text-sm">{t(`fields.${field}`)}<input className={`${control} mt-1`} name={field} defaultValue={metadata[field] ?? ""} type={field === "invoiceDate" ? "date" : "text"} maxLength={field === "vin" ? 17 : 100} /></label>)}
                <label className="text-sm">{t("fields.chargeSessionId")}<input className={`${control} mt-1`} name="chargeSessionId" type="number" min="1" step="1" defaultValue={record.chargeSessionId ?? (record.match.status === "matched" ? record.match.candidates[0]?.id ?? "" : "")} /></label>
              </div>
              {!!record.match.candidates.length && <div className="text-sm"><p>{t("candidates")}</p><ul className="list-inside list-disc">{record.match.candidates.map((candidate) => <li key={candidate.id}><Link className="underline" href={`/charges/${candidate.id}`}>#{candidate.id} · {new Date(candidate.startTime).toLocaleString()} · {candidate.energyAddedKwh ?? "—"} kWh</Link></li>)}</ul></div>}
              <label className="flex items-start gap-2 text-sm"><input name="enrich" type="checkbox" />{t("enrich")}</label>
              <button className={button} disabled={busy}>{t("save")}</button>
            </form>}
          </div>
        </details>;
      })}
    </section>)}
  </div>;
}
