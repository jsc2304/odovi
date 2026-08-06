"use client";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import { searchAddress, type AddressSearchResult } from "../../../lib/actions/places";

const DEBOUNCE_MS = 600;
const MIN_QUERY_LENGTH = 3;

export interface DestinationSearchProps {
  onSelect: (result: AddressSearchResult) => void;
  /** Anzeigetext des aktuell gewählten Ziels (gesteuert vom Formular). */
  value: string;
  onValueChange: (value: string) => void;
}

/**
 * Debounced Adresssuche für das Ziel, gestützt auf die `searchAddress`
 * Server Action (Nominatim/OSM, importiert aus lib/actions/places.ts). Muster
 * wie places/AddressSearch.tsx; Eingabe mit text-base (16px), damit iOS nicht
 * beim Fokus zoomt. Der Anzeigetext ist gesteuert, damit das Formular das Feld
 * beim Wechsel des Ziel-Modus zurücksetzen kann.
 */
export function DestinationSearch({
  onSelect,
  value,
  onValueChange,
}: DestinationSearchProps) {
  const t = useTranslations("planner");
  const [results, setResults] = useState<AddressSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  // Unterdrückt einen Suchlauf direkt nach dem Auswählen eines Ergebnisses.
  const justSelected = useRef(false);
  const requestId = useRef(0);

  useEffect(() => {
    if (justSelected.current) {
      justSelected.current = false;
      return;
    }
    const q = value.trim();
    if (q.length < MIN_QUERY_LENGTH) {
      setResults([]);
      setOpen(false);
      setLoading(false);
      return;
    }

    setLoading(true);
    const id = ++requestId.current;
    const timer = setTimeout(async () => {
      const found = await searchAddress(q);
      if (requestId.current !== id) return; // veraltete Antwort ignorieren
      setResults(found);
      setOpen(true);
      setLoading(false);
      setActiveIndex(-1);
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [value]);

  function handleSelect(result: AddressSearchResult) {
    justSelected.current = true;
    // Reihenfolge ist tragend: onValueChange invalidiert im Formular die
    // bisherige Auswahl (setDestAddress(null)) — onSelect muss danach kommen,
    // sonst wird das gerade gewählte Ziel sofort wieder verworfen.
    onValueChange(result.label);
    onSelect(result);
    setOpen(false);
    setResults([]);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      if (activeIndex >= 0) {
        e.preventDefault();
        handleSelect(results[activeIndex]!);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  function handleClear() {
    requestId.current += 1;
    onValueChange("");
    setResults([]);
    setOpen(false);
    setLoading(false);
    setActiveIndex(-1);
  }

  return (
    <div className="relative">
      <input
        type="text"
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => results.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={t("destinationSearch.placeholder")}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-controls="planner-destination-results"
        className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 pr-10 text-base text-neutral-900 outline-none focus:border-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:focus:border-neutral-100"
      />
      {loading && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-neutral-400">
          {t("destinationSearch.searching")}
        </span>
      )}
      {value && !loading && (
        <button
          type="button"
          aria-label={t("destinationSearch.clear")}
          title={t("destinationSearch.clear")}
          onMouseDown={(event) => event.preventDefault()}
          onClick={handleClear}
          className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 dark:hover:bg-neutral-800 dark:hover:text-neutral-200 dark:focus-visible:ring-white"
        >
          <X aria-hidden size={16} />
        </button>
      )}
      {open && results.length > 0 && (
        <ul
          id="planner-destination-results"
          role="listbox"
          className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-neutral-200 bg-white py-1 text-sm shadow-lg dark:border-neutral-700 dark:bg-neutral-900"
        >
          {results.map((r, i) => (
            <li key={`${r.lat},${r.lon}`}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => handleSelect(r)}
                className={`block w-full px-3 py-2 text-left ${
                  i === activeIndex
                    ? "bg-neutral-100 dark:bg-neutral-800"
                    : "hover:bg-neutral-50 dark:hover:bg-neutral-800/60"
                }`}
              >
                {r.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
