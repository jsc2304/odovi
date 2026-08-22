type BrandWordmarkSize = "sm" | "md" | "lg";

const sizeClasses: Record<BrandWordmarkSize, string> = {
  sm: "brand-wordmark-sm",
  md: "brand-wordmark-md",
  lg: "brand-wordmark-lg",
};

export function BrandWordmark({
  size = "md",
  className = "",
}: {
  size?: BrandWordmarkSize;
  className?: string;
}) {
  return (
    <span
      className={`brand-wordmark leading-none ${sizeClasses[size]} ${className}`}
    >
      <span className="sr-only">Tripatlas</span>
      <span aria-hidden="true" className="inline-flex items-center">
        <span className="brand-wordmark-pin" />
        <span>trip</span>
        <span className="brand-wordmark-atlas">atlas</span>
      </span>
    </span>
  );
}
