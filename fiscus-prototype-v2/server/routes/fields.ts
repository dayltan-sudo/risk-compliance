import { Hono } from "hono";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { extractedFields } from "../db/schema.js";
import { requireActor } from "../lib/actor.js";
import { writeAudit } from "../lib/audit.js";
import { nowStamp } from "../lib/ids.js";
import { checkReviewCompleteAndRecompute } from "../lib/recompute.js";
import type { AmendmentHistoryEntry } from "../../src/types.js";

export const fieldsRoute = new Hono();

const confirmSchema = z.object({ value: z.union([z.number(), z.boolean(), z.null()]).optional() });

// FR3.4/FR3.5 — Confirm accepts the extracted value as-is, or asserts genuine
// absence when `value` is explicitly null. Only an Unconfirmed field may be
// confirmed; a reviewed field is amended instead.
fieldsRoute.post("/:fieldId/confirm", async (c) => {
  const actor = requireActor(c);
  if (!actor) return c.json({ error: "Missing actor" }, 400);
  const fieldId = c.req.param("fieldId");

  const parsed = confirmSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "Invalid body" }, 400);

  const [field] = await db.select().from(extractedFields).where(eq(extractedFields.id, fieldId));
  if (!field) return c.json({ error: "Field not found" }, 404);
  if (field.status !== "Unconfirmed") return c.json({ error: "Already reviewed — use Amend instead." }, 409);

  const confirmedValue = "value" in parsed.data && parsed.data.value !== undefined ? parsed.data.value : field.value;
  await db.update(extractedFields).set({ value: confirmedValue, status: "Confirmed" }).where(eq(extractedFields.id, fieldId));

  await writeAudit({
    entityType: "ExtractedField",
    entityId: fieldId,
    actor,
    action: `Confirmed: ${field.fieldName} (${field.period})`,
    beforeValue: "Unconfirmed",
    afterValue: confirmedValue === null ? "Confirmed absent" : "Confirmed",
  });

  await checkReviewCompleteAndRecompute(field.assessmentId);
  return c.json({ ok: true });
});

const amendSchema = z.object({ value: z.union([z.number(), z.boolean(), z.null()]), reason: z.string().trim().optional() });

fieldsRoute.post("/:fieldId/amend", async (c) => {
  const actor = requireActor(c);
  if (!actor) return c.json({ error: "Missing actor" }, 400);
  const fieldId = c.req.param("fieldId");

  const parsed = amendSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? "Invalid body" }, 400);

  const [field] = await db.select().from(extractedFields).where(eq(extractedFields.id, fieldId));
  if (!field) return c.json({ error: "Field not found" }, 404);

  const entry: AmendmentHistoryEntry = {
    previousValue: field.value,
    previousStatus: field.status,
    newValue: parsed.data.value,
    newStatus: "Amended",
    reason: parsed.data.reason,
    actor,
    timestamp: nowStamp(),
  };

  await db
    .update(extractedFields)
    .set({ value: parsed.data.value, status: "Amended", amendmentHistory: [...field.amendmentHistory, entry] })
    .where(eq(extractedFields.id, fieldId));

  await writeAudit({
    entityType: "ExtractedField",
    entityId: fieldId,
    actor,
    action: `Amended: ${field.fieldName} (${field.period})`,
    beforeValue: String(field.value),
    afterValue: String(parsed.data.value),
  });

  await checkReviewCompleteAndRecompute(field.assessmentId);
  return c.json({ ok: true });
});

export default fieldsRoute;
