import Link from "next/link";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive";
export type ButtonSize = "sm" | "md";

const base =
  "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:opacity-60 disabled:pointer-events-none " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-neutral-950";

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-accent-700 text-white hover:bg-accent-800 active:bg-accent-900 dark:bg-accent-300 dark:text-neutral-950 dark:hover:bg-accent-200 dark:active:bg-accent-400 " +
    "focus-visible:ring-accent-700 dark:focus-visible:ring-accent-300",
  secondary:
    "border border-neutral-300 text-neutral-700 hover:bg-neutral-100 active:bg-neutral-200 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800 dark:active:bg-neutral-700 " +
    "focus-visible:ring-accent-700 dark:focus-visible:ring-accent-300",
  ghost:
    "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 active:bg-neutral-200 active:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-white dark:active:bg-neutral-700 dark:active:text-neutral-100 " +
    "focus-visible:ring-accent-700 dark:focus-visible:ring-accent-300",
  destructive:
    "border border-red-300 text-red-700 hover:bg-red-50 active:bg-red-100 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950 dark:active:bg-red-900 dark:active:text-red-200 " +
    "focus-visible:ring-red-600 dark:focus-visible:ring-red-400",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "min-h-9 px-3 py-1.5 text-xs",
  md: "min-h-11 px-4 py-2 text-sm",
};

/**
 * Shared class builder for both the <Button> component and any bespoke
 * button/link element (e.g. useActionState-driven forms) that needs the
 * same visual language without going through the component itself.
 */
export function buttonClasses(
  variant: ButtonVariant = "secondary",
  size: ButtonSize = "md",
  className = "",
): string {
  return `${base} ${variantClasses[variant]} ${sizeClasses[size]} ${className}`.trim();
}

interface CommonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  className?: string;
  children: ReactNode;
}

type ButtonAsButton = CommonProps &
  Omit<ComponentPropsWithoutRef<"button">, keyof CommonProps> & {
    href?: undefined;
  };

type ButtonAsLink = CommonProps &
  Omit<ComponentPropsWithoutRef<typeof Link>, keyof CommonProps> & {
    href: string;
  };

export type ButtonProps = ButtonAsButton | ButtonAsLink;

/**
 * Server-component-friendly button/link. Plain props, no client hooks —
 * forms that need pending state should keep their useActionState wrapper
 * and style the raw <button> via `buttonClasses()` instead of this component.
 */
export function Button(props: ButtonProps) {
  const {
    variant = "secondary",
    size = "md",
    icon,
    className,
    children,
    ...rest
  } = props;
  const classes = buttonClasses(variant, size, className);

  if ("href" in rest && rest.href !== undefined) {
    const { href, ...linkRest } = rest as Omit<ButtonAsLink, keyof CommonProps>;
    return (
      <Link href={href} className={classes} {...linkRest}>
        {icon}
        {children}
      </Link>
    );
  }

  const buttonRest = rest as Omit<ButtonAsButton, keyof CommonProps>;
  return (
    <button className={classes} {...buttonRest}>
      {icon}
      {children}
    </button>
  );
}
