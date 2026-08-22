"use client";
import { useActionState, useRef, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import {
  bootstrapAdmin,
  login,
  type AuthResult,
} from "../../lib/auth/actions";
import { buttonClasses } from "../../components/ui/Button";

const initialState: AuthResult = {};

const fieldClasses =
  "rounded-xl border border-neutral-300 bg-white px-3 py-2.5 text-base text-neutral-900 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-cyan-300/50 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100 dark:focus:border-violet-400";

export function LoginForm({ bootstrap }: { bootstrap: boolean }) {
  const action = bootstrap ? bootstrapAdmin : login;
  const [state, formAction, pending] = useActionState(action, initialState);
  const passwordRef = useRef<HTMLInputElement>(null);
  const passwordRepeatRef = useRef<HTMLInputElement>(null);
  const [matchError, setMatchError] = useState<string | null>(null);
  const t = useTranslations("auth");

  // Serverseitige Prüfung in bootstrapAdmin() ist die eigentliche Quelle der
  // Wahrheit — dieser Check ist nur eine freundliche, sofortige Fehlermeldung
  // ohne Roundtrip, falls die beiden Felder (z. B. wegen Autofill) auseinanderlaufen.
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    if (!bootstrap) return;
    if (passwordRef.current?.value !== passwordRepeatRef.current?.value) {
      event.preventDefault();
      setMatchError(t("passwordMismatch"));
      return;
    }
    setMatchError(null);
  }

  return (
    <form action={formAction} onSubmit={handleSubmit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
          {t("passwordLabel")}
        </span>
        <input
          ref={passwordRef}
          type="password"
          name="password"
          autoComplete={bootstrap ? "new-password" : "current-password"}
          autoFocus
          required
          minLength={8}
          className={fieldClasses}
        />
      </label>

      {bootstrap && (
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            {t("passwordRepeatLabel")}
          </span>
          <input
            ref={passwordRepeatRef}
            type="password"
            name="passwordRepeat"
            autoComplete="new-password"
            required
            minLength={8}
            className={fieldClasses}
          />
        </label>
      )}

      {bootstrap && (
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          {t.rich("passwordHint", {
            b: (chunks) => <span className="font-medium">{chunks}</span>,
          })}
        </p>
      )}

      {(matchError ?? state.error) && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300"
        >
          {matchError ?? state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className={buttonClasses("primary", "md", "!py-2.5 !text-base")}
      >
        {pending
          ? t("pending")
          : bootstrap
            ? t("submitCreatePassword")
            : t("submitLogin")}
      </button>
    </form>
  );
}
