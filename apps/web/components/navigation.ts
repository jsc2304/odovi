import {
  CalendarDays,
  CalendarRange,
  Ellipsis,
  FileBarChart,
  House,
  Lightbulb,
  MapPin,
  Navigation,
  Route,
  Search,
  Settings2,
  Tags,
  Wand2,
  Zap,
  type LucideIcon,
} from "lucide-react";

export type DestinationId =
  | "start"
  | "day"
  | "calendar"
  | "search"
  | "journeys"
  | "charges"
  | "places"
  | "reports"
  | "insights"
  | "planner"
  | "tags"
  | "rules"
  | "settings";

export type MoreGroup = "plan" | "review" | "configure";

export interface AppDestination {
  id: DestinationId;
  href: string;
  labelKey: string;
  icon: LucideIcon;
  match: (path: string) => boolean;
  mobilePrimary?: boolean;
  sidebar?: boolean;
  moreGroup?: MoreGroup;
}

/** One registry keeps desktop navigation, mobile navigation, and More in sync. */
export const APP_DESTINATIONS: AppDestination[] = [
  {
    id: "start",
    href: "/",
    labelKey: "start",
    icon: House,
    match: (path) => path === "/",
    mobilePrimary: true,
    sidebar: true,
  },
  {
    id: "day",
    href: "/day",
    labelKey: "day",
    icon: CalendarDays,
    match: (path) => path.startsWith("/day") || path.startsWith("/drives"),
    mobilePrimary: true,
    sidebar: true,
  },
  {
    id: "calendar",
    href: "/calendar",
    labelKey: "calendar",
    icon: CalendarRange,
    match: (path) => path.startsWith("/calendar"),
    sidebar: true,
    moreGroup: "plan",
  },
  {
    id: "search",
    href: "/search",
    labelKey: "search",
    icon: Search,
    match: (path) => path.startsWith("/search"),
    mobilePrimary: true,
    sidebar: true,
  },
  {
    id: "journeys",
    href: "/journeys",
    labelKey: "journeys",
    icon: Route,
    match: (path) => path.startsWith("/journeys"),
    mobilePrimary: true,
    sidebar: true,
    moreGroup: "plan",
  },
  {
    id: "charges",
    href: "/charges",
    labelKey: "charges",
    icon: Zap,
    match: (path) => path.startsWith("/charges"),
    sidebar: true,
    moreGroup: "review",
  },
  {
    id: "places",
    href: "/places",
    labelKey: "places",
    icon: MapPin,
    match: (path) => path.startsWith("/places"),
    sidebar: true,
    moreGroup: "review",
  },
  {
    id: "reports",
    href: "/reports",
    labelKey: "reports",
    icon: FileBarChart,
    match: (path) => path.startsWith("/reports"),
    sidebar: true,
    moreGroup: "review",
  },
  {
    id: "insights",
    href: "/insights",
    labelKey: "insights",
    icon: Lightbulb,
    match: (path) => path.startsWith("/insights"),
    sidebar: true,
    moreGroup: "review",
  },
  {
    id: "planner",
    href: "/planner",
    labelKey: "planner",
    icon: Navigation,
    match: (path) => path.startsWith("/planner"),
    sidebar: true,
    moreGroup: "plan",
  },
  {
    id: "tags",
    href: "/tags",
    labelKey: "tags",
    icon: Tags,
    match: (path) => path.startsWith("/tags"),
    moreGroup: "configure",
  },
  {
    id: "rules",
    href: "/rules",
    labelKey: "rules",
    icon: Wand2,
    match: (path) => path.startsWith("/rules"),
    moreGroup: "configure",
  },
  {
    id: "settings",
    href: "/settings#diagnose",
    labelKey: "settings",
    icon: Settings2,
    match: (path) => path.startsWith("/settings"),
    moreGroup: "configure",
  },
];

export const MORE_DESTINATION: AppDestination = {
  id: "settings",
  href: "/settings",
  labelKey: "more",
  icon: Ellipsis,
  match: (path) =>
    path.startsWith("/settings") ||
    path.startsWith("/tags") ||
    path.startsWith("/rules"),
  mobilePrimary: true,
  sidebar: true,
};
