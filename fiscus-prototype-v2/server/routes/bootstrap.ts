import { Hono } from "hono";
import { isNull } from "drizzle-orm";
import { db } from "../db/client.js";
import { customers, assessments, ratings, documents, approvalDecisions, auditLog } from "../db/schema.js";

// One round trip for the app-shell data that Directory, Customer Detail, and
// the Audit Trail pages all filter client-side today (src/store/selectors.ts
// operates over full arrays) — at this tool's scale (one team, MVP) that's
// simpler and cheaper than bespoke per-page endpoints. Anything scoped to a
// single assessment (fields, criteria, ratios, rating, commentary) is fetched
// separately via GET /api/assessments/:id — see routes/assessments.ts.
export const bootstrapRoute = new Hono();

bootstrapRoute.get("/", async (c) => {
  const [customerRows, assessmentRows, ratingRows, documentRows, decisionRows, auditRows] = await Promise.all([
    db.select().from(customers),
    db.select().from(assessments),
    db.select().from(ratings).where(isNull(ratings.supersededAt)),
    db.select().from(documents),
    db.select().from(approvalDecisions),
    db.select().from(auditLog),
  ]);

  return c.json({
    customers: customerRows,
    assessments: assessmentRows,
    ratings: ratingRows,
    documents: documentRows,
    approvalDecisions: decisionRows,
    auditLog: auditRows,
  });
});

export default bootstrapRoute;
