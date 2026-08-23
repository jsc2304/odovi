"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { APP_DESTINATIONS, MORE_DESTINATION } from "./navigation";

const sidebarItems = [
  ...APP_DESTINATIONS.filter((item) => item.sidebar),
  MORE_DESTINATION,
];
const mobileItems = [
  ...APP_DESTINATIONS.filter((item) => item.mobilePrimary),
  MORE_DESTINATION,
];

function itemClasses(active: boolean, layout: "bottom" | "side"): string {
  const base =
    layout === "bottom"
      ? "flex flex-1 flex-col items-center gap-0.5 py-2 text-xs"
      : "flex items-center gap-3 rounded-lg px-3 py-2 text-sm";
  const state = active
    ? "font-medium text-violet-700 dark:text-violet-300"
    : "text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white";
  const motion = "transition-colors";
  const sideActiveBg =
    layout === "side" && active ? "bg-violet-100 dark:bg-violet-950" : "";
  const focus =
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-cyan-300 dark:focus-visible:ring-offset-neutral-950";
  return `${base} ${state} ${sideActiveBg} ${motion} ${focus}`.trim();
}

export function BottomNav() {
  const pathname = usePathname();
  const t = useTranslations("nav");
  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 flex border-t border-neutral-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden dark:border-neutral-800 dark:bg-neutral-950/95">
      {mobileItems.map((item) => {
        const active = item.match(pathname);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={itemClasses(active, "bottom")}
          >
            <Icon aria-hidden size={20} strokeWidth={active ? 2.25 : 2} />
            <span>{t(item.labelKey)}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function SideNav() {
  const pathname = usePathname();
  const t = useTranslations("nav");
  return (
    <nav className="min-h-0 flex-1 overflow-y-auto p-3">
      <div className="flex flex-col gap-1">
      {sidebarItems.map((item) => {
        const active = item.match(pathname);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={itemClasses(active, "side")}
          >
            <Icon aria-hidden size={20} strokeWidth={active ? 2.25 : 2} className="shrink-0" />
            <span>{t(item.labelKey)}</span>
          </Link>
        );
      })}
      </div>
    </nav>
  );
}
