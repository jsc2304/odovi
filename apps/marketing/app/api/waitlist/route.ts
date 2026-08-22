import { NextResponse } from "next/server";
import { ensureWaitlistSchema, waitlistDb } from "../../../db/client";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INTEREST = new Set(["hosted", "self-hosted", "both"]);
const TESLAMATE = new Set(["yes", "no", "curious"]);

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }

  if (typeof payload !== "object" || payload === null) {
    return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }

  const body = payload as Record<string, unknown>;
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const interest = typeof body.interest === "string" ? body.interest : "hosted";
  const teslamate = typeof body.teslamate === "string" ? body.teslamate : "no";

  if (email.length > 254 || !EMAIL_RE.test(email)) {
    return NextResponse.json(
      { error: "Bitte gib eine gültige E-Mail-Adresse ein." },
      { status: 400 },
    );
  }
  if (!INTEREST.has(interest) || !TESLAMATE.has(teslamate) || body.consent !== true) {
    return NextResponse.json(
      { error: "Bitte prüfe deine Auswahl und Zustimmung." },
      { status: 400 },
    );
  }

  const db = waitlistDb();
  await ensureWaitlistSchema(db);
  await db
    .prepare(
      `INSERT INTO waitlist_entries
        (email, interest, teslamate_experience, consent, created_at, updated_at)
       VALUES (?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT(email) DO UPDATE SET
         interest = excluded.interest,
         teslamate_experience = excluded.teslamate_experience,
         consent = 1,
         updated_at = CURRENT_TIMESTAMP`,
    )
    .bind(email, interest, teslamate)
    .run();

  return NextResponse.json({ ok: true }, { status: 201 });
}
