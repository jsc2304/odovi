import { env, type D1Database } from "cloudflare:workers";

const createWaitlistTable = `
  CREATE TABLE IF NOT EXISTS waitlist_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    interest TEXT NOT NULL DEFAULT 'hosted',
    teslamate_experience TEXT NOT NULL DEFAULT 'no',
    consent INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`;

const createEmailIndex = `
  CREATE UNIQUE INDEX IF NOT EXISTS idx_waitlist_email
  ON waitlist_entries(email)
`;

export function waitlistDb(): D1Database {
  return env.DB as D1Database;
}

export async function ensureWaitlistSchema(db: D1Database): Promise<void> {
  await db.batch([
    db.prepare(createWaitlistTable),
    db.prepare(createEmailIndex),
    db.prepare("PRAGMA optimize"),
  ]);
}
