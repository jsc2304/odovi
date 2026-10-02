"use client";

import { createContext, useContext, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { undoDriveClassification, type ClassificationChange } from "../lib/actions/drives";
import { buttonClasses } from "./ui/Button";

const UndoContext = createContext<{ operation: ClassificationChange | null; error: string | null;
  recordOperation: (operation: ClassificationChange | null) => void; reportError: (error: string) => void } | null>(null);

export function ClassificationUndoProvider({ initial, children }: { initial: ClassificationChange | null; children: React.ReactNode }) {
  const [operation, setOperation] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setOperation(initial); }, [initial]);
  useEffect(() => {
    if (operation?.status !== "available") return;
    const timer = setTimeout(() => setOperation(current => current?.operationId === operation.operationId ? { ...current, status: "expired" } : current), Math.max(0, Date.parse(operation.expiresAt) - Date.now()));
    return () => clearTimeout(timer);
  }, [operation]);
  return <UndoContext.Provider value={{ operation, error, recordOperation: next => { if (next) setOperation(next); setError(null); }, reportError: setError }}>{children}</UndoContext.Provider>;
}

export function useClassificationUndo() {
  const context = useContext(UndoContext);
  if (!context) throw new Error("ClassificationUndoProvider is required");
  return context;
}

/** Persistent session receipt; deliberately separate from dismissible toast feedback. */
export function ClassificationUndoNotice() {
  const { operation, error, recordOperation, reportError } = useClassificationUndo();
  const t = useTranslations("drives.undo");
  const common = useTranslations("common");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  if (!operation && !error) return null;
  function undo() {
    if (!operation) return;
    startTransition(async () => {
      try {
        const result = await undoDriveClassification(operation.operationId);
        if (result.ok) { recordOperation(result.operation); router.refresh(); }
        else reportError(result.error);
      } catch { reportError(t("failed")); }
    });
  }
  return <section aria-label={t("title")} className="mb-5 rounded-xl border border-neutral-300 bg-white p-4 text-sm dark:border-neutral-700 dark:bg-neutral-900">
    {operation && <>
      <p role="status" aria-atomic="true" className="font-medium">{pending ? t("pending") : operation.status === "undone" ? t("undone") : t("saved", { count: operation.count, classification: common(`classification.${operation.classification}`) })}</p>
      <p className="mt-1 text-neutral-600 dark:text-neutral-400">{operation.status === "expired" ? t("expired") : operation.status === "available" ? t("lifetime") : null}</p>
      {operation.status === "available" && <button type="button" disabled={pending} onClick={undo} className={`${buttonClasses("secondary", "md")} mt-3`}>{t("action")}</button>}
    </>}
    {error && <p role="alert" className="mt-2 text-red-700 dark:text-red-300">{error}</p>}
  </section>;
}
