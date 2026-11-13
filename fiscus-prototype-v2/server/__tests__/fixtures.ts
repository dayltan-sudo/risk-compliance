import { eq } from "drizzle-orm";
import { db } from "./testDb.js";
import { signSession } from "../lib/auth.js";
import { app } from "../app.js";
import { assessments, criterionInputs, customers, documents, extractedFields, ratings } from "../db/schema.js";
import { EXTRACTION_MODEL_VERSION, FIELD_DEFS } from "../../src/data/config.js";
import { emptyCriterionInput, CRITERION_NUMBERS } from "../lib/criterionSkeleton.js";
import { refreshAfterFieldChange } from "../lib/recompute.js";
import type { AssessmentState, RelationshipType, StandardFieldName } from "../../src/types.js";

process.env.SESSION_SECRET ??= "test-secret-test-secret-test-secret";
process.env.APP_PASSWORD ??= "test-password";

export const PERIODS = ["FY2025", "FY2026"];

// A statement that satisfies every integrity check.
export const BALANCED: Record<StandardFieldName, number | boolean> = {
  Sales: 1000,
  NPAT: 100,
  "Current Assets": 600,
  "Cash and Bank Balances": 200,
  "Non-Current Assets": 400,
  "Total Assets": 1000,
  "Current Liabilities": 300,
  "Non-Current Liabilities": 200,
  "Total Liabilities": 500,
  "Total Equity": 500,
  "Net Operating Cash Flow Positive": true,
};

export async function cookieFor(actor = "Alice Chen", userId = "u-alice") {
  return `fiscus_session=${await signSession({ userId, actor })}`;
}

export async function call(method: string, path: string, body?: unknown, opts: { actor?: string; userId?: string; headers?: Record<string, string> } = {}) {
  const res = await app.request(`/api${path}`, {
    method,
    headers: {
      cookie: await cookieFor(opts.actor, opts.userId),
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...opts.headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  return { status: res.status, body: json };
}

/** Like call() but sends a pre-serialised body, for payloads JSON.stringify can't produce (e.g. 1e999). */
export async function callRaw(method: string, path: string, rawBody: string) {
  const res = await app.request(`/api${path}`, { method, headers: { cookie: await cookieFor(), "content-type": "application/json" }, body: rawBody });
  return { status: res.status, body: (await res.json().catch(() => null)) as Record<string, unknown> | null };
}

interface SeedOptions {
  id?: string;
  state?: AssessmentState;
  relationshipType?: RelationshipType;
  /** Fields + criteria all Confirmed (vs all Unconfirmed). */
  reviewed?: boolean;
  /** Run the real recompute so a live rating exists. Implies reviewed. */
  scored?: boolean;
}

export async function seedAssessment(opts: SeedOptions = {}) {
  const id = opts.id ?? "a-test";
  const scored = opts.scored ?? false;
  const reviewed = opts.reviewed ?? scored;
  const status = reviewed ? ("Confirmed" as const) : ("Unconfirmed" as const);

  await db.insert(customers).values({ id: "c-test", name: "ZZ-TEST Co", industry: "Test", relationshipOwner: "Alice Chen" }).onConflictDoNothing();
  await db.insert(assessments).values({
    id,
    customerId: "c-test",
    division: "Div",
    version: 1,
    state: scored || reviewed ? "Draft" : "Draft",
    relationshipType: opts.relationshipType ?? "Renewal",
    assessmentYear: 2026,
    periods: PERIODS,
    createdBy: "Alice Chen",
  });

  for (const period of PERIODS) {
    const docId = `doc-${id}-${period}`;
    await db.insert(documents).values({
      id: docId,
      assessmentId: id,
      type: "audited",
      period,
      financialsDate: `${period.slice(2)}-12-31`,
      presentationCurrency: "SGD",
      presentationScale: "units",
      statementBasis: "standalone",
      uploader: "Alice Chen",
      fileName: `${period}.pdf`,
      blobUrl: "blob://test",
    });
    await db.insert(extractedFields).values(
      FIELD_DEFS.map((def) => ({
        id: `f-${id}-${period}-${def.name}`,
        assessmentId: id,
        documentId: docId,
        fieldName: def.name,
        section: def.section,
        period,
        value: BALANCED[def.name],
        originalExtractedValue: BALANCED[def.name],
        scaleApplied: "units" as const,
        currency: "SGD",
        confidenceScore: 100,
        sourcePointer: "p.1",
        extractionModelVersion: EXTRACTION_MODEL_VERSION,
        status,
        amendmentHistory: [],
      })),
    );
  }

  await db.insert(criterionInputs).values(
    CRITERION_NUMBERS.map((n) => {
      const base = { ...emptyCriterionInput(id, n), id: `crit-${id}-${n}` };
      if (!reviewed) return base;
      const confirmed = { ...base, status: "Confirmed" as const, confirmedBy: "Alice Chen", confirmedAt: "2026-01-01", enteredBy: "Alice Chen" };
      switch (n) {
        case 5:
          return { ...confirmed, paidUpCapital: 100_000, totalExposure: 50_000, currency: "SGD", source: "manual" as const };
        case 7:
          return { ...confirmed, yearRegisteredSg: 2005 };
        case 8:
          return { ...confirmed, litigationRecord: "Clean" as const, evidenceSource: "eLitigation", evidencePeriodOrDate: "2026-01-01" };
        case 9:
          return { ...confirmed, changeInDirectors: false };
        case 11:
          return { ...confirmed, promptPaymentRecord: "Good" as const, evidenceSource: "AR ledger", evidencePeriodOrDate: "FY2026" };
      }
    }),
  );

  if (scored) await refreshAfterFieldChange(id);
  if (opts.state && opts.state !== "Draft") await db.update(assessments).set({ state: opts.state }).where(eq(assessments.id, id));
  return id;
}

export async function liveRating(assessmentId: string) {
  const rows = await db.select().from(ratings).where(eq(ratings.assessmentId, assessmentId));
  return rows.filter((r) => r.supersededAt === null);
}
