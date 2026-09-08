"use client";
import { useActionState, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  updateChargeAnnotations,
  type UpdateChargeAnnotationsResult,
} from "../../../../lib/actions/charges";
import { buttonClasses } from "../../../../components/ui/Button";

const initialState: UpdateChargeAnnotationsResult = { ok: false };

const fieldClasses =
  "rounded-lg border border-neutral-300 bg-white px-3 py-2 text-base text-neutral-900 outline-none focus:border-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:focus:border-neutral-100";

/** Formats a numeric-string cost (e.g. "12.50") for a comma-accepting text input. */
function formatCostForInput(cost: string | null): string {
  if (cost == null) return "";
  return Number(cost).toFixed(2).replace(".", ",");
}

/** Formats a price-per-kWh (de-DE, currency symbol) for the "automatisch (…)" subtext. */
function formatPricePerKwh(price: string, currency: string): string {
  try {
    const fmt = new Intl.NumberFormat("de-DE", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    });
    return `${fmt.format(Number(price))}/kWh`;
  } catch {
    return `${Number(price).toFixed(2)} ${currency}/kWh`;
  }
}

export function AnnotationForm({
  chargeSessionId,
  cost,
  currency,
  notes,
  costSource,
  autoPricePerKwh,
  autoPriceCurrency,
  placeName,
}: {
  chargeSessionId: number;
  cost: string | null;
  currency: string | null;
  notes: string | null;
  /** Herkunft des Kostenwerts — 'synced' | 'manual' | 'auto' | null (siehe schema.ts). */
  costSource?: string | null;
  /** Ortspreis für die "automatisch (…)"-Subtext-Anzeige bei costSource='auto'. */
  autoPricePerKwh?: string | null;
  autoPriceCurrency?: string | null;
  placeName?: string | null;
}) {
  const t = useTranslations("charges");
  const tCommon = useTranslations("common");
  const [state, formAction, pending] = useActionState(
    updateChargeAnnotations,
    initialState,
  );
  const [savedPulse, setSavedPulse] = useState(false);

  // Controlled fields: React 19 auto-resets uncontrolled inputs to their
  // defaultValue when a form action completes, which would silently revert
  // edits. Controlled state is immune to that reset.
  const [fields, setFields] = useState({
    cost: formatCostForInput(cost),
    currency: currency ?? "CHF",
    notes: notes ?? "",
  });

  function setField(name: keyof typeof fields, value: string) {
    setFields((prev) => ({ ...prev, [name]: value }));
  }

  useEffect(() => {
    if (state.ok && !pending) {
      if (state.annotations) {
        setFields({
          cost: formatCostForInput(state.annotations.cost),
          currency: state.annotations.currency ?? "CHF",
          notes: state.annotations.notes ?? "",
        });
      }
      setSavedPulse(true);
      const t = setTimeout(() => setSavedPulse(false), 2500);
      return () => clearTimeout(t);
    }
  }, [state, pending]);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="chargeSessionId" value={chargeSessionId} />

      <div className="grid grid-cols-2 gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            {t("annotationForm.cost")}
          </span>
          <input
            type="text"
            inputMode="decimal"
            name="cost"
            value={fields.cost}
            onChange={(e) => setField("cost", e.target.value)}
            placeholder={t("annotationForm.costPlaceholder")}
            className={fieldClasses}
          />
          {costSource === "auto" && autoPricePerKwh != null && autoPriceCurrency != null && (
            <span className="text-xs text-neutral-400 dark:text-neutral-500">
              {t("annotationForm.autoCost", {
                price: formatPricePerKwh(autoPricePerKwh, autoPriceCurrency),
                place: placeName ?? t("annotationForm.autoCostDefaultPlace"),
              })}
            </span>
          )}
          {costSource === "manual" && (
            <span className="text-xs text-neutral-400 dark:text-neutral-500">
              {t("annotationForm.manualCost")}
            </span>
          )}
          <span className="text-xs text-neutral-400 dark:text-neutral-500">
            {t("annotationForm.costHint")}
          </span>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            {t("annotationForm.currency")}
          </span>
          <select
            value={["CHF", "EUR"].includes(fields.currency) ? fields.currency : "other"}
            onChange={(e) => {
              setField("currency", e.target.value === "other" ? "" : e.target.value);
            }}
            className={fieldClasses}
          >
            <option value="CHF">CHF</option>
            <option value="EUR">EUR</option>
            <option value="other">{t("annotationForm.currencyOther")}</option>
          </select>
        </label>
      </div>

      {!["CHF", "EUR"].includes(fields.currency) && (
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            {t("annotationForm.currencyCode")}
          </span>
          <input
            type="text"
            value={fields.currency}
            onChange={(e) => setField("currency", e.target.value.toUpperCase())}
            maxLength={3}
            placeholder="USD"
            className={`${fieldClasses} uppercase`}
          />
        </label>
      )}
      <input type="hidden" name="currency" value={fields.currency} />

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
          {t("annotationForm.notes")}
        </span>
        <textarea
          name="notes"
          value={fields.notes}
          onChange={(e) => setField("notes", e.target.value)}
          rows={4}
          maxLength={5000}
          className={fieldClasses}
        />
      </label>

      {state.error && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300"
        >
          {state.error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={buttonClasses("primary", "md")}>
          {pending ? t("annotationForm.saving") : tCommon("actions.save")}
        </button>
        {savedPulse && (
          <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
            {t("annotationForm.saved")}
          </span>
        )}
      </div>
    </form>
  );
}
