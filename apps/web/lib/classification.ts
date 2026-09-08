export type Classification =
  | "unclassified"
  | "private"
  | "business"
  | "commute";

export const CLASSIFICATION_LABELS: Record<Classification, string> = {
  unclassified: "Unklassifiziert",
  private: "Privat",
  business: "Geschäftlich",
  commute: "Arbeitsweg",
};

/** Short labels used on the inline quick-classify buttons. */
export const CLASSIFICATION_SHORT: Record<Classification, string> = {
  unclassified: "Unklass.",
  private: "Privat",
  business: "Geschäftlich",
  commute: "Arbeitsweg",
};

/** Badge colour classes per classification (light + dark). */
export const CLASSIFICATION_BADGE: Record<Classification, string> = {
  unclassified:
    "bg-[#f6f0e6] text-[#746148] dark:bg-amber-950 dark:text-amber-300",
  private:
    "bg-[#eaf0e2] text-[#4c7054] dark:bg-emerald-950 dark:text-emerald-300",
  business:
    "bg-[#e9eff0] text-[#316d86] dark:bg-sky-950 dark:text-sky-300",
  commute:
    "bg-[#eaf0e2] text-[#4c7054] dark:bg-emerald-950 dark:text-emerald-300",
};

// Button order for the quick-classify row: Privat / Geschäftlich / Arbeitsweg / Unklass.
export const QUICK_ORDER: Classification[] = [
  "private",
  "business",
  "commute",
  "unclassified",
];

/** Solid dot colour per classification (dashboard recent-drives list, legends). */
export const CLASSIFICATION_DOT: Record<Classification, string> = {
  unclassified: "bg-neutral-400 dark:bg-neutral-500",
  private: "bg-sky-500 dark:bg-sky-400",
  business: "bg-violet-500 dark:bg-violet-400",
  commute: "bg-amber-500 dark:bg-amber-400",
};
