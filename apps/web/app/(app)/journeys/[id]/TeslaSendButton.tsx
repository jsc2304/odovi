"use client";

import { useState, useTransition } from "react";
import { CarFront, Send } from "lucide-react";
import { sendRoadtripToTesla } from "../../../../lib/actions/tesla";
import { buttonClasses } from "../../../../components/ui/Button";

export function TeslaSendButton({
  journeyId,
  version,
  labels,
}: {
  journeyId: number;
  version: number;
  labels: Record<"send" | "sending" | "confirm", string>;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  function send() {
    if (!window.confirm(labels.confirm)) return;
    setMessage(null);
    startTransition(async () => {
      const result = await sendRoadtripToTesla({ journeyId, version });
      setMessage({ ok: result.ok, text: result.ok ? result.message : result.error });
    });
  }

  return (
    <div>
      <button type="button" disabled={pending} onClick={send} className={buttonClasses("primary", "sm")}>
        {pending ? <CarFront aria-hidden size={14} /> : <Send aria-hidden size={14} />}
        {pending ? labels.sending : labels.send}
      </button>
      {message && <p role="status" className={`mt-2 text-xs ${message.ok ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300"}`}>{message.text}</p>}
    </div>
  );
}
