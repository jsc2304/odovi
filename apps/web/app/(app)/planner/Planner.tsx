"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  ArrowDown,
  ArrowUp,
  BatteryCharging,
  ChevronDown,
  MapPin,
  Navigation,
  Plus,
  Save,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import {
  formatDuration,
  type RoadtripPlanSnapshot,
  type RoadtripStop,
  type RoadtripStopKind,
} from "@tripatlas/core";
import type { PlannerPlace, PlannerStatus } from "../../../lib/planner";
import { planRoadtrip } from "../../../lib/actions/planner";
import { saveRoadtripPlan } from "../../../lib/actions/roadtripPlans";
import type { AddressSearchResult } from "../../../lib/actions/places";
import { buttonClasses } from "../../../components/ui/Button";
import { DestinationSearch } from "./DestinationSearch";
import { PlannerMapLoader } from "./PlannerMapLoader";

export interface PlannerInitialPlan {
  journeyId: number;
  name: string;
  version: number;
  snapshot: RoadtripPlanSnapshot;
}

export interface PlannerProps {
  vehicleId: number;
  places: PlannerPlace[];
  status: PlannerStatus | null;
  defaultSoc: number;
  defaultTempC: number;
  defaultCapacityKwh: number;
  capacityIsDerived: boolean;
  historyDriveCount: number;
  osrmIsDefault: boolean;
  initialPlan?: PlannerInitialPlan | null;
}

const CURRENT_VALUE = "current";
const inputClasses =
  "w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-base text-neutral-900 outline-none focus:border-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:focus:border-neutral-100";
const labelClasses =
  "block text-xs font-medium text-neutral-600 dark:text-neutral-400";

interface SelectedPoint {
  label: string;
  lat: number;
  lon: number;
}

interface EditableCheckpoint {
  id: string;
  kind: Exclude<RoadtripStopKind, "start">;
  query: string;
  point: SelectedPoint | null;
}

const BASE_SOURCE_KEYS: Record<
  RoadtripPlanSnapshot["assumptions"]["baseSource"],
  string
> = {
  "temp-bin": "tempBin",
  "history-avg": "historyAvg",
  "vehicle-efficiency": "vehicleEfficiency",
  default: "default",
};

function localDateTimeValue(date: Date): string {
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function makeCheckpoint(
  kind: EditableCheckpoint["kind"],
  point: SelectedPoint | null = null,
): EditableCheckpoint {
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
    kind,
    query: point?.label ?? "",
    point,
  };
}

function initialCheckpoints(
  plan: PlannerInitialPlan | null | undefined,
  places: PlannerPlace[],
): EditableCheckpoint[] {
  if (plan) {
    return plan.snapshot.stops.slice(1).map((stop) => ({
      id: stop.id,
      kind: stop.kind === "start" ? "waypoint" : stop.kind,
      query: stop.label,
      point: { label: stop.label, lat: stop.lat, lon: stop.lon },
    }));
  }
  const first = places[0];
  return [
    {
      id: "destination",
      kind: "destination",
      query: first?.name ?? "",
      point: first
        ? { label: first.name, lat: first.lat, lon: first.lon }
        : null,
    },
  ];
}

function formatKm(km: number): string {
  return `${km.toFixed(km < 100 ? 1 : 0)} km`;
}

export function Planner({
  vehicleId,
  places,
  status,
  defaultSoc,
  defaultTempC,
  defaultCapacityKwh,
  capacityIsDerived,
  historyDriveCount,
  osrmIsDefault,
  initialPlan,
}: PlannerProps) {
  const t = useTranslations("planner");
  const router = useRouter();
  const hasCurrentPosition = status?.hasPosition ?? false;
  const [name, setName] = useState(initialPlan?.name ?? "");
  const [departureAt, setDepartureAt] = useState(
    initialPlan
      ? localDateTimeValue(new Date(initialPlan.snapshot.departureAt))
      : localDateTimeValue(new Date(Date.now() + 60 * 60 * 1000)),
  );
  const [startValue, setStartValue] = useState<string>(() => {
    if (initialPlan) {
      const start = initialPlan.snapshot.stops[0];
      const matchingPlace = places.find(
        (place) => place.lat === start?.lat && place.lon === start?.lon,
      );
      if (matchingPlace) return `place:${matchingPlace.id}`;
    }
    return hasCurrentPosition
      ? CURRENT_VALUE
      : places[0]
        ? `place:${places[0].id}`
        : "";
  });
  const [checkpoints, setCheckpoints] = useState<EditableCheckpoint[]>(() =>
    initialCheckpoints(initialPlan, places),
  );
  const [soc, setSoc] = useState(
    String(initialPlan?.snapshot.startSoc ?? defaultSoc),
  );
  const [reserveSoc, setReserveSoc] = useState(
    String(initialPlan?.snapshot.reserveSoc ?? 15),
  );
  const [tempC, setTempC] = useState(
    String(initialPlan?.snapshot.tempC ?? defaultTempC),
  );
  const [capacityKwh, setCapacityKwh] = useState(
    String(initialPlan?.snapshot.capacityKwh ?? defaultCapacityKwh),
  );
  const [advancedOpen, setAdvancedOpen] = useState(Boolean(initialPlan));
  const [pending, setPending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<RoadtripPlanSnapshot | null>(
    initialPlan?.snapshot ?? null,
  );

  const destinationLabel = checkpoints.at(-1)?.point?.label;
  const suggestedName = useMemo(
    () => (destinationLabel ? t("save.defaultName", { destination: destinationLabel }) : ""),
    [destinationLabel, t],
  );

  function resolveStart(): SelectedPoint | null {
    if (startValue === CURRENT_VALUE) {
      if (status?.lat == null || status.lon == null) return null;
      return {
        label: t("form.currentPosition"),
        lat: status.lat,
        lon: status.lon,
      };
    }
    const id = Number(startValue.replace("place:", ""));
    const place = places.find((candidate) => candidate.id === id);
    return place
      ? { label: place.name, lat: place.lat, lon: place.lon }
      : null;
  }

  function updateCheckpoint(
    id: string,
    update: Partial<EditableCheckpoint>,
  ) {
    setCheckpoints((current) =>
      current.map((checkpoint) =>
        checkpoint.id === id ? { ...checkpoint, ...update } : checkpoint,
      ),
    );
    setPlan(null);
  }

  function addCheckpoint() {
    setCheckpoints((current) => [
      ...current.slice(0, -1),
      makeCheckpoint("waypoint"),
      current.at(-1) ?? makeCheckpoint("destination"),
    ]);
    setPlan(null);
  }

  function removeCheckpoint(index: number) {
    setCheckpoints((current) => current.filter((_, i) => i !== index));
    setPlan(null);
  }

  function moveCheckpoint(index: number, delta: -1 | 1) {
    setCheckpoints((current) => {
      const next = [...current];
      const target = index + delta;
      if (target < 0 || target >= next.length - 1) return current;
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
    setPlan(null);
  }

  function buildStops(): RoadtripStop[] | null {
    const start = resolveStart();
    if (!start) return null;
    if (checkpoints.some((checkpoint) => checkpoint.point == null)) return null;
    return [
      { id: "start", ...start, kind: "start" },
      ...checkpoints.map((checkpoint, index) => ({
        id: checkpoint.id,
        label: checkpoint.point!.label,
        lat: checkpoint.point!.lat,
        lon: checkpoint.point!.lon,
        kind:
          index === checkpoints.length - 1
            ? ("destination" as const)
            : checkpoint.kind,
      })),
    ];
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const stops = buildStops();
    if (!stops) {
      setError(t("errors.missingCheckpoints"));
      return;
    }
    const startSoc = Number(soc);
    const reserve = Number(reserveSoc);
    const temperature = Number(tempC);
    const capacity = Number(capacityKwh);
    const departure = new Date(departureAt);
    if (!Number.isFinite(startSoc) || startSoc < 0 || startSoc > 100) {
      setError(t("errors.socRange"));
      return;
    }
    if (!Number.isFinite(reserve) || reserve < 0 || reserve > 50) {
      setAdvancedOpen(true);
      setError(t("errors.reserveRange"));
      return;
    }
    if (!Number.isFinite(temperature)) {
      setAdvancedOpen(true);
      setError(t("errors.tempInvalid"));
      return;
    }
    if (!Number.isFinite(capacity) || capacity < 5 || capacity > 250) {
      setAdvancedOpen(true);
      setError(t("errors.capacityRange"));
      return;
    }
    if (Number.isNaN(departure.getTime())) {
      setError(t("errors.departureInvalid"));
      return;
    }

    setPending(true);
    setError(null);
    const response = await planRoadtrip({
      vehicleId,
      departureAt: departure.toISOString(),
      stops,
      startSoc,
      reserveSoc: reserve,
      tempC: temperature,
      capacityKwh: capacity,
    });
    setPending(false);
    if (!response.ok) {
      setError(response.error);
      setPlan(null);
      return;
    }
    setPlan(response.plan);
  }

  async function handleSave() {
    if (!plan) return;
    setSaving(true);
    setError(null);
    const response = await saveRoadtripPlan({
      journeyId: initialPlan?.journeyId,
      name: name.trim() || suggestedName,
      snapshot: plan,
    });
    setSaving(false);
    if (!response.ok) {
      setError(response.error);
      return;
    }
    router.push(`/journeys/${response.journeyId}`);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <form
        onSubmit={handleSubmit}
        className="rounded-2xl border border-neutral-200 bg-white p-4 sm:p-5 dark:border-neutral-800 dark:bg-neutral-900"
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label>
            <span className={labelClasses}>{t("form.tripName")}</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={suggestedName || t("form.tripNamePlaceholder")}
              maxLength={200}
              className={`mt-1 ${inputClasses}`}
            />
          </label>
          <label>
            <span className={labelClasses}>{t("form.departure")}</span>
            <input
              type="datetime-local"
              value={departureAt}
              onChange={(event) => {
                setDepartureAt(event.target.value);
                setPlan(null);
              }}
              className={`mt-1 ${inputClasses}`}
            />
          </label>
          <label>
            <span className={labelClasses}>{t("form.start")}</span>
            <select
              value={startValue}
              onChange={(event) => {
                setStartValue(event.target.value);
                setPlan(null);
              }}
              className={`mt-1 ${inputClasses}`}
            >
              {hasCurrentPosition && (
                <option value={CURRENT_VALUE}>{t("form.currentPosition")}</option>
              )}
              {places.map((place) => (
                <option key={place.id} value={`place:${place.id}`}>
                  {place.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className={labelClasses}>{t("form.startSoc")}</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={100}
              value={soc}
              onChange={(event) => {
                setSoc(event.target.value);
                setPlan(null);
              }}
              className={`mt-1 ${inputClasses}`}
            />
          </label>
          <details
            open={advancedOpen}
            onToggle={(event) => setAdvancedOpen(event.currentTarget.open)}
            className="group rounded-xl border border-neutral-200 sm:col-span-2 dark:border-neutral-800"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-neutral-900 dark:hover:bg-neutral-800/60 dark:focus-visible:ring-white [&::-webkit-details-marker]:hidden">
              <span>
                {t("form.forecastSettings")}
                <span className="ml-2 text-xs font-normal text-neutral-500 dark:text-neutral-400">
                  {t("form.forecastSummary", {
                    reserve: reserveSoc,
                    temp: tempC,
                    capacity: capacityKwh,
                  })}
                </span>
              </span>
              <ChevronDown
                aria-hidden
                size={16}
                className="shrink-0 text-neutral-400 transition-transform group-open:rotate-180"
              />
            </summary>
            <div className="grid grid-cols-1 gap-4 border-t border-neutral-200 p-3 sm:grid-cols-2 dark:border-neutral-800">
              <label>
                <span className={labelClasses}>{t("form.reserveSoc")}</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={50}
                  value={reserveSoc}
                  onChange={(event) => {
                    setReserveSoc(event.target.value);
                    setPlan(null);
                  }}
                  className={`mt-1 ${inputClasses}`}
                />
              </label>
              <label>
                <span className={labelClasses}>{t("form.expectedTemp")}</span>
                <input
                  type="number"
                  inputMode="numeric"
                  value={tempC}
                  onChange={(event) => {
                    setTempC(event.target.value);
                    setPlan(null);
                  }}
                  className={`mt-1 ${inputClasses}`}
                />
              </label>
              <label className="sm:col-span-2">
                <span className={labelClasses}>{t("form.batteryCapacity")}</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={5}
                  max={250}
                  value={capacityKwh}
                  onChange={(event) => {
                    setCapacityKwh(event.target.value);
                    setPlan(null);
                  }}
                  className={`mt-1 ${inputClasses}`}
                />
                <span className="mt-1 block text-xs text-neutral-400 dark:text-neutral-500">
                  {capacityIsDerived
                    ? t("form.capacityHintDerived")
                    : t("form.capacityHintDefault")}
                </span>
              </label>
            </div>
          </details>
        </div>

        <div className="mt-5 border-t border-neutral-200 pt-5 dark:border-neutral-800">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">{t("checkpoints.title")}</h2>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                {t("checkpoints.hint")}
              </p>
            </div>
            <button
              type="button"
              onClick={addCheckpoint}
              className={buttonClasses("secondary", "sm")}
            >
              <Plus aria-hidden size={15} />
              {t("checkpoints.add")}
            </button>
          </div>

          <ol className="mt-3 flex flex-col gap-3">
            {checkpoints.map((checkpoint, index) => {
              const isDestination = index === checkpoints.length - 1;
              return (
                <li
                  key={checkpoint.id}
                  className="rounded-xl border border-neutral-200 p-3 dark:border-neutral-800"
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {checkpoint.kind === "charge" ? (
                        <BatteryCharging aria-hidden size={16} />
                      ) : (
                        <MapPin aria-hidden size={16} />
                      )}
                      <span className="text-sm font-medium">
                        {isDestination
                          ? t("checkpoints.destination")
                          : t("checkpoints.stop", { number: index + 1 })}
                      </span>
                    </div>
                    {!isDestination && (
                      <div className="flex items-center gap-1">
                        <select
                          aria-label={t("checkpoints.kindLabel")}
                          value={checkpoint.kind}
                          onChange={(event) =>
                            updateCheckpoint(checkpoint.id, {
                              kind: event.target.value as "waypoint" | "charge",
                            })
                          }
                          className="rounded border border-neutral-300 bg-white px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-900"
                        >
                          <option value="waypoint">{t("checkpoints.kindWaypoint")}</option>
                          <option value="charge">{t("checkpoints.kindCharge")}</option>
                        </select>
                        <button
                          type="button"
                          aria-label={t("checkpoints.moveUp")}
                          disabled={index === 0}
                          onClick={() => moveCheckpoint(index, -1)}
                          className="rounded p-2 disabled:opacity-30"
                        >
                          <ArrowUp aria-hidden size={16} />
                        </button>
                        <button
                          type="button"
                          aria-label={t("checkpoints.moveDown")}
                          disabled={index >= checkpoints.length - 2}
                          onClick={() => moveCheckpoint(index, 1)}
                          className="rounded p-2 disabled:opacity-30"
                        >
                          <ArrowDown aria-hidden size={16} />
                        </button>
                        <button
                          type="button"
                          aria-label={t("checkpoints.remove")}
                          onClick={() => removeCheckpoint(index)}
                          className="rounded p-2 text-red-600 dark:text-red-400"
                        >
                          <Trash2 aria-hidden size={16} />
                        </button>
                      </div>
                    )}
                  </div>
                  {places.length > 0 && (
                    <select
                      aria-label={t("checkpoints.savedPlace")}
                      value=""
                      onChange={(event) => {
                        const place = places.find(
                          (candidate) => candidate.id === Number(event.target.value),
                        );
                        if (place) {
                          updateCheckpoint(checkpoint.id, {
                            query: place.name,
                            point: {
                              label: place.name,
                              lat: place.lat,
                              lon: place.lon,
                            },
                          });
                        }
                      }}
                      className="mb-2 rounded border border-neutral-300 bg-white px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-900"
                    >
                      <option value="">{t("checkpoints.chooseSavedPlace")}</option>
                      {places.map((place) => (
                        <option key={place.id} value={place.id}>
                          {place.name}
                        </option>
                      ))}
                    </select>
                  )}
                  <DestinationSearch
                    value={checkpoint.query}
                    selected={checkpoint.point != null}
                    onValueChange={(query) =>
                      updateCheckpoint(checkpoint.id, { query, point: null })
                    }
                    onSelect={(result: AddressSearchResult) =>
                      updateCheckpoint(checkpoint.id, {
                        query: result.label,
                        point: {
                          label: result.label,
                          lat: result.lat,
                          lon: result.lon,
                        },
                      })
                    }
                  />
                </li>
              );
            })}
          </ol>
        </div>

        {error && (
          <p className="mt-4 flex items-start gap-2 text-sm text-red-600 dark:text-red-400" role="alert">
            <TriangleAlert aria-hidden size={16} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="submit" disabled={pending} className={buttonClasses("primary", "md")}>
            <Navigation aria-hidden size={16} />
            {pending ? t("form.submitPending") : t("form.submitRoadtrip")}
          </button>
          {initialPlan && (
            <span className="text-xs text-neutral-500 dark:text-neutral-400">
              {t("save.editingVersion", { version: initialPlan.version })}
            </span>
          )}
          {historyDriveCount < 30 && (
            <span className="text-xs text-neutral-400 dark:text-neutral-500">
              {t("form.historyHint", { count: historyDriveCount })}
            </span>
          )}
        </div>
        <p className="mt-3 text-xs text-neutral-400 dark:text-neutral-500">
          {t("form.routingPrefix")} {osrmIsDefault ? t("form.routingDefaultHint") : t("form.routingCustomHint")}
        </p>
      </form>

      {plan && (
        <Result
          plan={plan}
          onSave={handleSave}
          saving={saving}
          updating={initialPlan != null}
        />
      )}
    </div>
  );
}

function Result({
  plan,
  onSave,
  saving,
  updating,
}: {
  plan: RoadtripPlanSnapshot;
  onSave: () => void;
  saving: boolean;
  updating: boolean;
}) {
  const t = useTranslations("planner");
  const stopById = new Map(plan.stops.map((stop) => [stop.id, stop]));
  return (
    <div className="flex flex-col gap-4">
      <PlannerMapLoader geometry={plan.geometry} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label={t("result.distance")} value={formatKm(plan.totals.distanceKm)} />
        <Metric label={t("result.duration")} value={formatDuration(plan.totals.durationSeconds)} />
        <Metric
          label={t("result.consumption")}
          value={`${plan.totals.energyKwh.toFixed(1)} kWh`}
          sub={`${Math.round(plan.totals.whPerKm)} Wh/km`}
        />
        <Metric
          label={t("result.arrivalSoc")}
          value={`${Math.max(0, Math.round(plan.totals.arrivalSoc))} %`}
          sub={
            plan.totals.arrivalSoc >= plan.reserveSoc
              ? t("result.reserveMet")
              : t("result.reserveMissed", { reserve: plan.reserveSoc })
          }
          warning={plan.totals.arrivalSoc < plan.reserveSoc}
        />
      </div>

      <div className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="text-sm font-semibold">{t("result.itinerary")}</h2>
        <ol className="mt-3 flex flex-col gap-3">
          {plan.legs.map((leg) => {
            const from = stopById.get(leg.fromStopId);
            const to = stopById.get(leg.toStopId);
            const warning = leg.arrivalSoc < plan.reserveSoc;
            return (
              <li key={leg.index} className="rounded-xl bg-neutral-50 p-3 dark:bg-neutral-950">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {from?.label} <span className="text-neutral-400">→</span> {to?.label}
                    </p>
                    <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                      {formatKm(leg.distanceKm)} · {formatDuration(leg.durationSeconds)} · {leg.energyKwh.toFixed(1)} kWh
                    </p>
                  </div>
                  <div className={`shrink-0 text-right ${warning ? "text-red-600 dark:text-red-400" : "text-neutral-700 dark:text-neutral-300"}`}>
                    <p className="text-sm font-semibold tabular-nums">{Math.round(leg.arrivalSoc)} %</p>
                    <p className="text-[10px] uppercase tracking-wide">{t("result.arrival")}</p>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      <button
        type="button"
        onClick={onSave}
        disabled={saving}
        className={buttonClasses("primary", "md")}
      >
        <Save aria-hidden size={16} />
        {saving
          ? t("save.pending")
          : updating
            ? t("save.newVersion")
            : t("save.createJourney")}
      </button>

      <Assumptions plan={plan} />
    </div>
  );
}

function Metric({
  label,
  value,
  sub,
  warning = false,
}: {
  label: string;
  value: string;
  sub?: string;
  warning?: boolean;
}) {
  return (
    <div className={`rounded-xl border p-3 ${warning ? "border-red-300 bg-red-50 dark:border-red-900/60 dark:bg-red-950/30" : "border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900"}`}>
      <p className="text-xs text-neutral-500 dark:text-neutral-400">{label}</p>
      <p className={`mt-0.5 text-xl font-semibold tabular-nums ${warning ? "text-red-700 dark:text-red-400" : "text-neutral-900 dark:text-neutral-100"}`}>
        {value}
      </p>
      {sub && <p className="text-xs text-neutral-400 dark:text-neutral-500">{sub}</p>}
    </div>
  );
}

function Assumptions({ plan }: { plan: RoadtripPlanSnapshot }) {
  const t = useTranslations("planner");
  const assumptions = plan.assumptions;
  const baseLabel = t(`baseSource.${BASE_SOURCE_KEYS[assumptions.baseSource]}`);
  return (
    <details className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <summary className="cursor-pointer text-sm font-medium">{t("assumptions.summary")}</summary>
      <dl className="mt-3 flex flex-col gap-2 text-sm">
        <Row term={t("assumptions.baseConsumption")} desc={`${Math.round(assumptions.baseWhPerKm)} Wh/km · ${baseLabel}`} />
        <Row term={t("assumptions.temperature")} desc={`${Math.round(plan.tempC)} °C`} />
        <Row
          term={t("assumptions.elevation")}
          desc={assumptions.elevationOk ? `↑ ${Math.round(assumptions.ascentM)} m · ↓ ${Math.round(assumptions.descentM)} m` : t("assumptions.elevationUnavailable")}
        />
        <Row term={t("assumptions.capacity")} desc={`${Math.round(plan.capacityKwh)} kWh`} />
        <Row term={t("assumptions.routing")} desc={assumptions.routeProviderIsDefault ? t("assumptions.routingPublic") : t("assumptions.routingCustom")} />
      </dl>
      <p className="mt-3 flex items-start gap-2 text-xs text-neutral-400 dark:text-neutral-500">
        <MapPin aria-hidden size={14} className="mt-0.5 shrink-0" />
        <span>{t("assumptions.waypointFooter")}</span>
      </p>
    </details>
  );
}

function Row({ term, desc }: { term: string; desc: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-neutral-500 dark:text-neutral-400">{term}</dt>
      <dd className="text-right tabular-nums text-neutral-700 dark:text-neutral-300">{desc}</dd>
    </div>
  );
}
