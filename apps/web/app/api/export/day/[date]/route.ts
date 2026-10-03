import { NextRequest, NextResponse } from "next/server";
import { getLocale, getTranslations } from "next-intl/server";
import { buildDayReport } from "@odovi/core";
import { validateSession } from "../../../../../lib/auth/session";
import { loadDayReportData } from "../../../../../lib/exports/data";
import { renderDayCsv, buildCsvLabels } from "../../../../../lib/exports/csv";
import { renderDayPdf, buildPdfLabels } from "../../../../../lib/exports/pdf";
import { dayFilename } from "../../../../../lib/exports/filenames";
import { isValidDateParam, isValidFormat } from "../../../../../lib/exports/params";
import { getVehicles } from "../../../../../lib/queries";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ date: string }> },
) {
  const t = await getTranslations("exports");

  const user = await validateSession();
  if (!user) {
    return NextResponse.json({ error: t("errors.notAuthenticated") }, { status: 401 });
  }

  const { date } = await params;
  if (!isValidDateParam(date)) {
    return NextResponse.json({ error: t("errors.invalidDate") }, { status: 400 });
  }

  const format = request.nextUrl.searchParams.get("format");
  if (!isValidFormat(format)) {
    return NextResponse.json(
      { error: t("errors.invalidFormat") },
      { status: 400 },
    );
  }

  const rawVehicle = request.nextUrl.searchParams.get("vehicle");
  const vehicleId = rawVehicle == null ? undefined : Number(rawVehicle);
  if (vehicleId !== undefined && (!Number.isSafeInteger(vehicleId) || vehicleId <= 0 || !(await getVehicles()).some((vehicle) => vehicle.id === vehicleId))) {
    return NextResponse.json({ error: t("errors.noVehicle") }, { status: 404 });
  }
  const data = await loadDayReportData(date, vehicleId);
  const report = buildDayReport(data.drives, date, data.meta);
  const filename = dayFilename(date, format);

  if (format === "csv") {
    const tCommon = await getTranslations("common");
    const csv = renderDayCsv(report, buildCsvLabels(t, tCommon));
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  }

  const [tCommon, locale] = await Promise.all([
    getTranslations("common"),
    getLocale(),
  ]);
  const pdf = await renderDayPdf(report, buildPdfLabels(t, tCommon, locale));
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
