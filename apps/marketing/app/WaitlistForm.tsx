"use client";

import { useState, type FormEvent } from "react";
import { PRIVACY_NOTICE_VERSION } from "./legal-config";

type SubmitState = "idle" | "sending" | "success" | "error";

export function WaitlistForm() {
  const [state, setState] = useState<SubmitState>("idle");
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("sending");
    setMessage("");

    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/waitlist", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: form.get("email"),
        interest: form.get("interest"),
        teslamate: form.get("teslamate"),
        consent: form.get("consent") === "on",
        consentVersion: PRIVACY_NOTICE_VERSION,
      }),
    }).catch(() => null);

    if (!response) {
      setState("error");
      setMessage("Die Anmeldung ist gerade nicht erreichbar. Bitte versuche es später erneut.");
      return;
    }

    const result = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      setState("error");
      setMessage(result.error ?? "Die Anmeldung konnte nicht gespeichert werden.");
      return;
    }

    setState("success");
    setMessage("Du bist dabei. Wir melden uns, sobald die Hosted Beta startet.");
    event.currentTarget.reset();
  }

  return (
    <form className="waitlist-form" onSubmit={submit}>
      <label className="field field-email">
        <span>E-Mail-Adresse</span>
        <input
          name="email"
          type="email"
          autoComplete="email"
          placeholder="du@beispiel.de"
          required
          disabled={state === "sending"}
        />
      </label>

      <div className="form-grid">
        <label className="field">
          <span>Welche Variante interessiert dich?</span>
          <select name="interest" defaultValue="hosted" disabled={state === "sending"}>
            <option value="hosted">Hosted Early Access</option>
            <option value="self-hosted">Self-hosted</option>
            <option value="both">Beides</option>
          </select>
        </label>
        <label className="field">
          <span>Nutzt du bereits TeslaMate?</span>
          <select name="teslamate" defaultValue="no" disabled={state === "sending"}>
            <option value="no">Nein</option>
            <option value="yes">Ja</option>
            <option value="curious">Noch nicht, aber interessiert</option>
          </select>
        </label>
      </div>

      <label className="consent">
        <input name="consent" type="checkbox" required disabled={state === "sending"} />
        <span>
          Tripatlas darf mich zum Early Access kontaktieren. Meine Daten werden
          nur für diesen Zweck verwendet. Ich habe die{" "}
          <a href="/datenschutz">Datenschutzerklärung</a> gelesen. Die
          Einwilligung kann ich jederzeit für die Zukunft widerrufen.
        </span>
      </label>

      <button className="button button-primary form-submit" type="submit" disabled={state === "sending"}>
        {state === "sending" ? "Wird gespeichert …" : "Platz im Early Access sichern"}
        <span aria-hidden="true">→</span>
      </button>

      {message && (
        <p className="form-message" data-state={state} role="status">
          {message}
        </p>
      )}
    </form>
  );
}
