import { CarFront, Settings2 } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { EmptyState } from "./ui/EmptyState";

interface VehicleRequiredStateProps {
  title?: string;
  subtitle?: string;
  className?: string;
}

/**
 * Friendly first-sync state for product areas that require a vehicle.
 * A missing TeslaMate vehicle is setup state, not a missing route.
 */
export async function VehicleRequiredState({
  title,
  subtitle,
  className = "mx-auto max-w-3xl",
}: VehicleRequiredStateProps) {
  const t = await getTranslations("common");

  return (
    <section className={className} aria-labelledby={title ? "vehicle-required-page-title" : undefined}>
      {title && (
        <h1
          id="vehicle-required-page-title"
          className="text-2xl font-semibold tracking-tight"
        >
          {title}
        </h1>
      )}
      {subtitle && (
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          {subtitle}
        </p>
      )}
      <EmptyState
        icon={CarFront}
        title={t("vehicleRequired.title")}
        hint={t("vehicleRequired.hint")}
        action={{
          href: "/settings",
          label: t("vehicleRequired.action"),
          icon: <Settings2 aria-hidden size={16} />,
        }}
        className={title || subtitle ? "mt-6" : "mt-4"}
      />
    </section>
  );
}
