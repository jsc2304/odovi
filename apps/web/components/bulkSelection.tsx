"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslations } from "next-intl";
import { Check, CheckSquare, Square } from "lucide-react";
import type { TagLite } from "../lib/queries";
import { BulkActionBar } from "./BulkActionBar";

interface BulkSelectionValue {
  selectionMode: boolean;
  selected: ReadonlySet<number>;
  isSelected: (id: number) => boolean;
  toggle: (id: number) => void;
  toggleMode: () => void;
  selectAll: () => void;
  clear: () => void;
  allCount: number;
  allSelected: boolean;
}

const BulkSelectionCtx = createContext<BulkSelectionValue | null>(null);

/**
 * Shared client-side selection state for the day-view and search drive lists.
 * Owns the selection mode flag, the selected-id set, keyboard handling
 * (Escape leaves the mode), the sticky bulk-action bar and the success toast.
 * Wrap the region containing the drive rows in it; rows read state via
 * useBulkSelection(). Selection is purely client-side — no URL param.
 */
export function BulkSelectionProvider({
  allIds,
  tags,
  children,
}: {
  allIds: number[];
  tags: TagLite[];
  children: React.ReactNode;
}) {
  const t = useTranslations("bulk");
  const [selectionMode, setSelectionMode] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const currentIds = new Set(allIds);
    setSelected((prev) => {
      let changed = false;
      const next = new Set<number>();
      for (const id of prev) {
        if (currentIds.has(id)) {
          next.add(id);
        } else {
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [allIds]);

  const exit = useCallback(() => {
    setSelectionMode(false);
    setSelected(new Set());
  }, []);

  const toggleMode = useCallback(() => {
    setSelectionMode((on) => {
      if (on) setSelected(new Set());
      return !on;
    });
  }, []);

  const toggle = useCallback((id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelected(new Set(allIds));
  }, [allIds]);

  const clear = useCallback(() => setSelected(new Set()), []);

  const isSelected = useCallback((id: number) => selected.has(id), [selected]);

  // Escape leaves selection mode.
  useEffect(() => {
    if (!selectionMode) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") exit();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectionMode, exit]);

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  }, []);

  const allSelected =
    allIds.length > 0 && allIds.every((id) => selected.has(id));

  const value = useMemo<BulkSelectionValue>(
    () => ({
      selectionMode,
      selected,
      isSelected,
      toggle,
      toggleMode,
      selectAll,
      clear,
      allCount: allIds.length,
      allSelected,
    }),
    [
      selectionMode,
      selected,
      isSelected,
      toggle,
      toggleMode,
      selectAll,
      clear,
      allIds.length,
      allSelected,
    ],
  );

  const selectedIds = useMemo(() => [...selected], [selected]);

  return (
    <BulkSelectionCtx.Provider value={value}>
      {children}

      {selectionMode && selectedIds.length > 0 && (
        <BulkActionBar
          selectedIds={selectedIds}
          tags={tags}
          onCancel={exit}
          onApplied={(n) => {
            setSelected(new Set());
            showToast(t("updated", { count: n }));
          }}
        />
      )}

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed inset-x-0 bottom-16 z-30 flex justify-center px-4 md:bottom-4 md:left-56"
        >
          <div className="flex items-center gap-2 rounded-full bg-neutral-900 px-4 py-2 text-sm font-medium text-white shadow-lg dark:bg-white dark:text-neutral-900">
            <Check aria-hidden size={16} />
            {toast}
          </div>
        </div>
      )}
    </BulkSelectionCtx.Provider>
  );
}

export function useBulkSelection(): BulkSelectionValue {
  const ctx = useContext(BulkSelectionCtx);
  if (!ctx) {
    throw new Error(
      "useBulkSelection must be used within a BulkSelectionProvider",
    );
  }
  return ctx;
}

/**
 * Header control for the drive list: an "Auswählen" toggle, and — while in
 * selection mode — an "Alle auswählen"/"Keine" shortcut plus a "Fertig" exit.
 */
export function SelectionToggle() {
  const { selectionMode, toggleMode, selectAll, clear, allSelected, allCount } =
    useBulkSelection();
  const t = useTranslations("bulk");

  if (allCount === 0) return null;

  const btn =
    "inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-neutral-600 transition hover:bg-neutral-100 hover:text-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800 dark:hover:text-white dark:focus-visible:ring-white";

  if (!selectionMode) {
    return (
      <button type="button" onClick={toggleMode} className={btn}>
        <CheckSquare aria-hidden size={16} />
        {t("select")}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={allSelected ? clear : selectAll}
        className={btn}
      >
        {allSelected ? (
          <Square aria-hidden size={16} />
        ) : (
          <CheckSquare aria-hidden size={16} />
        )}
        {allSelected ? t("selectNone") : t("selectAll")}
      </button>
      <button type="button" onClick={toggleMode} className={btn}>
        {t("done")}
      </button>
    </div>
  );
}

/** Shared visual checkbox for selectable rows (min 44px handled by the row). */
export function SelectionCheckbox({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden
      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border transition ${
        checked
          ? "border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-neutral-900"
          : "border-neutral-300 bg-white dark:border-neutral-600 dark:bg-neutral-800"
      }`}
    >
      {checked && <Check size={16} strokeWidth={3} />}
    </span>
  );
}
