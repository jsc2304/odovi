import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const waitlistEntries = sqliteTable(
  "waitlist_entries",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    email: text("email").notNull(),
    interest: text("interest", {
      enum: ["hosted", "self-hosted", "both"],
    })
      .notNull()
      .default("hosted"),
    teslamateExperience: text("teslamate_experience", {
      enum: ["yes", "no", "curious"],
    })
      .notNull()
      .default("no"),
    consent: integer("consent", { mode: "boolean" }).notNull().default(true),
    consentVersion: text("consent_version")
      .notNull()
      .default("legacy-pre-2026-08-22"),
    consentedAt: text("consented_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [uniqueIndex("idx_waitlist_email").on(table.email)],
);
