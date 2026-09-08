import { and, asc, eq, isNull, isNotNull, inArray, sql } from "drizzle-orm";
import {
  auditLog,
  classificationRules,
  driveTags,
  drives,
  tags,
  type Db,
} from "@odovi/db";
import { findMatchingRule, isoWeekday } from "@odovi/core";

export interface ClassifyRulesResult {
  applied: number;
}

// Deckelt die Arbeit pro Zyklus — der nächste Tick holt den Rest.
const BATCH_LIMIT = 500;

type RuleClassification = "unclassified" | "private" | "business" | "commute";

interface LoadedRule {
  id: number;
  name: string;
  priority: number;
  startPlaceId: number | null;
  endPlaceId: number | null;
  weekdays: number[] | null;
  classification: RuleClassification | null;
  tagId: number | null;
  tagName: string | null;
  purpose: string | null;
  customer: string | null;
  project: string | null;
}

interface CandidateDrive {
  id: number;
  startTime: Date;
  classification: RuleClassification;
  startPlaceId: number | null;
  endPlaceId: number | null;
  purpose: string | null;
  customer: string | null;
  project: string | null;
}

/** Aktive Regeln inkl. Tag-Name (für Audit), sortiert priority ASC, id ASC. */
async function loadEnabledRules(db: Db): Promise<LoadedRule[]> {
  return db
    .select({
      id: classificationRules.id,
      name: classificationRules.name,
      priority: classificationRules.priority,
      startPlaceId: classificationRules.startPlaceId,
      endPlaceId: classificationRules.endPlaceId,
      weekdays: classificationRules.weekdays,
      classification: classificationRules.classification,
      tagId: classificationRules.tagId,
      tagName: tags.name,
      purpose: classificationRules.purpose,
      customer: classificationRules.customer,
      project: classificationRules.project,
    })
    .from(classificationRules)
    .leftJoin(tags, eq(classificationRules.tagId, tags.id))
    .where(eq(classificationRules.enabled, true))
    .orderBy(asc(classificationRules.priority), asc(classificationRules.id));
}

/** Kandidaten: unclassified, noch keine Regel-Provenance, abgeschlossene Fahrt. */
async function loadCandidateDrives(
  db: Db,
  limit: number,
  driveIds?: number[],
): Promise<CandidateDrive[]> {
  return db
    .select({
      id: drives.id,
      startTime: drives.startTime,
      classification: drives.classification,
      startPlaceId: drives.startPlaceId,
      endPlaceId: drives.endPlaceId,
      purpose: drives.purpose,
      customer: drives.customer,
      project: drives.project,
    })
    .from(drives)
    .where(
      and(
        eq(drives.classification, "unclassified"),
        isNull(drives.classifiedByRuleId),
        isNotNull(drives.endTime),
        driveIds ? inArray(drives.id, driveIds) : undefined,
        sql`not exists (select 1 from ${auditLog} where ${auditLog.entityType} = 'drive' and ${auditLog.entityId} = ${drives.id} and ${auditLog.field} = 'classification')`,
      ),
    )
    .orderBy(asc(drives.id))
    .limit(limit);
}

/**
 * Wendet aktive Auto-Klassifizierungs-Regeln auf unklassifizierte Drives an
 * (classification='unclassified' UND classified_by_rule_id IS NULL — Regeln
 * überschreiben nie User-Entscheidungen, Konvention siehe schema.ts).
 * Erste passende Regel nach priority ASC, id ASC gewinnt. Pro Zyklus wird ein
 * Batch (BATCH_LIMIT) verarbeitet; der nächste Tick holt den Rest.
 *
 * Pro Treffer: classification (falls die Regel eine hat), classifiedByRuleId
 * (Provenance), purpose/customer/project NUR wo das Drive-Feld noch null ist,
 * Tag (falls gesetzt) via onConflictDoNothing. Jede gesetzte Änderung wird
 * mit changedBy=`regel:${name}` im audit_log protokolliert.
 */
export async function applyClassificationRules(
  db: Db,
  appTimezone: string,
  driveIds?: number[],
): Promise<ClassifyRulesResult> {
  if (driveIds?.length === 0) return { applied: 0 };
  const rules = await loadEnabledRules(db);
  if (rules.length === 0) return { applied: 0 };

  const candidates = await loadCandidateDrives(db, BATCH_LIMIT, driveIds);
  if (candidates.length === 0) return { applied: 0 };

  let applied = 0;
  await db.transaction(async (tx) => {
    for (const candidate of candidates) {
      // Re-read after locking: a user may have edited while the candidates loaded.
      const [drive] = await tx.select().from(drives).where(eq(drives.id, candidate.id)).for("update");
      if (!drive || drive.classification !== "unclassified" || drive.classifiedByRuleId != null || !drive.endTime) continue;
      const [classified] = await tx.select({ id: auditLog.id }).from(auditLog).where(and(
        eq(auditLog.entityType, "drive"), eq(auditLog.entityId, drive.id), eq(auditLog.field, "classification"),
      )).limit(1);
      if (classified) continue;
      const rule = findMatchingRule(
        {
          startPlaceId: drive.startPlaceId,
          endPlaceId: drive.endPlaceId,
          weekdayIso: isoWeekday(drive.startTime, appTimezone),
        },
        rules,
      );
      if (!rule) continue;

      const patch: Record<string, unknown> = {
        classifiedByRuleId: rule.id,
        updatedAt: new Date(),
      };
      const audits: {
        field: string;
        oldValue: string | null;
        newValue: string | null;
      }[] = [];

      if (rule.classification && rule.classification !== drive.classification) {
        patch.classification = rule.classification;
        audits.push({
          field: "classification",
          oldValue: drive.classification,
          newValue: rule.classification,
        });
      }
      for (const field of ["purpose", "customer", "project"] as const) {
        const value = rule[field];
        if (value != null && drive[field] == null) {
          patch[field] = value;
          audits.push({ field, oldValue: null, newValue: value });
        }
      }

      await tx.update(drives).set(patch).where(eq(drives.id, drive.id));

      if (rule.tagId != null) {
        const inserted = await tx
          .insert(driveTags)
          .values({ driveId: drive.id, tagId: rule.tagId })
          .onConflictDoNothing()
          .returning({ driveId: driveTags.driveId });
        if (inserted.length > 0) {
          audits.push({
            field: "tags",
            oldValue: null,
            newValue: rule.tagName ?? String(rule.tagId),
          });
        }
      }

      if (audits.length > 0) {
        await tx.insert(auditLog).values(
          audits.map((a) => ({
            entityType: "drive",
            entityId: drive.id,
            field: a.field,
            oldValue: a.oldValue,
            newValue: a.newValue,
            changedBy: `regel:${rule.name}`,
          })),
        );
      }

      applied++;
    }
  });

  return { applied };
}
