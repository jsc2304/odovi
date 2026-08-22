import { env, type D1Database } from "cloudflare:workers";

const createWaitlistTable = `
  CREATE TABLE IF NOT EXISTS waitlist_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    interest TEXT NOT NULL DEFAULT 'hosted',
    teslamate_experience TEXT NOT NULL DEFAULT 'no',
    consent INTEGER NOT NULL DEFAULT 1,
    consent_version TEXT NOT NULL DEFAULT 'legacy-pre-2026-08-22',
    consented_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
  await db.prepare(createWaitlistTable).run();

  const tableInfo = await db
    .prepare("PRAGMA table_info(waitlist_entries)")
    .all<{ name: string }>();
  const columns = new Set(tableInfo.results.map((column) => column.name));

  if (!columns.has("consent_version")) {
    await db
      .prepare(
        "ALTER TABLE waitlist_entries ADD COLUMN consent_version TEXT NOT NULL DEFAULT 'legacy-pre-2026-08-22'",
      )
      .run();
  }
  if (!columns.has("consented_at")) {
    await db
      .prepare(
        "ALTER TABLE waitlist_entries ADD COLUMN consented_at TEXT NOT NULL DEFAULT '2026-08-22'",
      )
      .run();
    await db
      .prepare(
        "UPDATE waitlist_entries SET consented_at = COALESCE(updated_at, created_at) WHERE consented_at = '2026-08-22'",
      )
      .run();
  }

  await db.batch([db.prepare(createEmailIndex), db.prepare("PRAGMA optimize")]);
}
