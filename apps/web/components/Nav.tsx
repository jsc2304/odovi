"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  House,
  CalendarDays,
  CalendarRange,
  Search,
  Route,
  Zap,
  MapPin,
  FileBarChart,
  Lightbulb,
  Navigation,
  Ellipsis,
  type LucideIcon,
} from "lucide-react";

interface NavItem {
  href: string;
  labelKey: string;
  icon: LucideIcon;
  match: (path: string) => boolean;
  /** Nur in der Desktop-Sidebar. */
  sideOnly?: boolean;
}

const items: NavItem[] = [
  { href: "/", labelKey: "start", icon: House, match: (p) => p === "/" },
  { href: "/day", labelKey: "day", icon: CalendarDays, match: (p) => p.startsWith("/day") || p.startsWith("/drives") },
  { href: "/calendar", labelKey: "calendar", icon: CalendarRange, match: (p) => p.startsWith("/calendar"), sideOnly: true },
  { href: "/search", labelKey: "search", icon: Search, match: (p) => p.startsWith("/search") },
  { href: "/journeys", labelKey: "journeys", icon: Route, match: (p) => p.startsWith("/journeys") },
  { href: "/charges", labelKey: "charges", icon: Zap, match: (p) => p.startsWith("/charges") },
  { href: "/places", labelKey: "places", icon: MapPin, match: (p) => p.startsWith("/places"), sideOnly: true },
  { href: "/reports", labelKey: "reports", icon: FileBarChart, match: (p) => p.startsWith("/reports"), sideOnly: true },
  { href: "/insights", labelKey: "insights", icon: Lightbulb, match: (p) => p.startsWith("/insights"), sideOnly: true },
  { href: "/planner", labelKey: "planner", icon: Navigation, match: (p) => p.startsWith("/planner"), sideOnly: true },
  { href: "/settings", labelKey: "more", icon: Ellipsis, match: (p) => p.startsWith("/settings") || p.startsWith("/tags") || p.startsWith("/rules") },
];

function itemClasses(active: boolean, layout: "bottom" | "side"): string {
  const base =
    layout === "bottom"
      ? "flex flex-1 flex-col items-center gap-0.5 py-2 text-xs"
      : "flex items-center gap-3 rounded-lg px-3 py-2 text-sm";
  const state = active
    ? "text-neutral-900 dark:text-white font-medium"
    : "text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white";
  const motion = "transition-colors";
  const sideActiveBg =
    layout === "side" && active ? "bg-neutral-100 dark:bg-neutral-800" : "";
  const focus =
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-white dark:focus-visible:ring-offset-neutral-950";
  return `${base} ${state} ${sideActiveBg} ${motion} ${focus}`.trim();
}

export function BottomNav() {
  const pathname = usePathname();
  const t = useTranslations("nav");
  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 flex border-t border-neutral-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden dark:border-neutral-800 dark:bg-neutral-950/95">
      {items.filter((item) => !item.sideOnly).map((item) => {
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
      {items.map((item) => {
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
