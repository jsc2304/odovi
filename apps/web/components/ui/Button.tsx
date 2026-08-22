import Link from "next/link";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive";
export type ButtonSize = "sm" | "md";

const base =
  "inline-flex items-center justify-center gap-1.5 rounded-xl font-medium transition-colors disabled:opacity-60 disabled:pointer-events-none " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-neutral-950";

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-gradient-to-br from-violet-600 to-violet-400 text-white shadow-[0_14px_34px_rgba(124,58,237,0.24)] hover:from-violet-500 hover:to-violet-300 active:from-violet-700 active:to-violet-500 " +
    "focus-visible:ring-cyan-300 dark:focus-visible:ring-cyan-300",
  secondary:
    "border border-neutral-300 text-neutral-700 hover:bg-neutral-100 active:bg-neutral-200 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800 dark:active:bg-neutral-700 " +
    "focus-visible:ring-cyan-300 dark:focus-visible:ring-cyan-300",
  ghost:
    "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 active:bg-neutral-200 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-white dark:active:bg-neutral-700 " +
    "focus-visible:ring-cyan-300 dark:focus-visible:ring-cyan-300",
  destructive:
    "border border-red-300 text-red-600 hover:bg-red-50 active:bg-red-100 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950 dark:active:bg-red-900 " +
    "focus-visible:ring-red-600 dark:focus-visible:ring-red-400",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "px-2.5 py-1 text-xs",
  md: "px-4 py-2 text-sm",
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
