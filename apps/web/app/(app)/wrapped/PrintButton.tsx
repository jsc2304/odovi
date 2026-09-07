"use client";

import React from "react";
import { Printer } from "lucide-react";

export function PrintButton({ label }: { label: string }) {
  return <button type="button" onClick={() => window.print()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:bg-neutral-800" data-wrapped-print><Printer aria-hidden size={16} />{label}</button>;
}
