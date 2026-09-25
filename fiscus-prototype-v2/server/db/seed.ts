// Ports the prototype's static fixtures (src/data/seed.ts — pure TS, no
// browser dependency) into real Postgres rows, so the deployed app isn't
// empty on first login. Run once against a fresh database: `npm run db:seed`.
import { config } from "dotenv";
// .env.local is Vercel-managed (`vercel env pull`) and carries DATABASE_URL;
// .env holds hand-set local-only vars — see dev-server.ts for the same split.
config({ path: ".env" });
config({ path: ".env.local" });
import { db } from "./client.js";
import {
  customers,
  assessments,
  documents,
  extractedFields,
  integrityCheckResults,
  criterionInputs,
  ratios,
  ratings,
  riskCommentaries,
  approvalDecisions,
  auditLog,
} from "./schema.js";
import {
  customers as seedCustomers,
  assessments as seedAssessments,
  documents as seedDocuments,
  extractedFields as seedExtractedFields,
  integrityChecks as seedIntegrityChecks,
  criterionInputs as seedCriterionInputs,
  ratios as seedRatios,
  ratings as seedRatings,
  riskCommentaries as seedRiskCommentaries,
  approvalDecisions as seedApprovalDecisions,
  auditLog as seedAuditLog,
} from "../../src/data/seed.js";

async function main() {
  console.log("Seeding database from src/data/seed.ts fixtures...");

  if (seedCustomers.length) await db.insert(customers).values(seedCustomers);
  if (seedAssessments.length) await db.insert(assessments).values(seedAssessments);
  if (seedDocuments.length) await db.insert(documents).values(seedDocuments.map((d) => ({ ...d, blobUrl: `seed://${d.fileName}` })));
  if (seedExtractedFields.length) await db.insert(extractedFields).values(seedExtractedFields);
  if (seedIntegrityChecks.length) await db.insert(integrityCheckResults).values(seedIntegrityChecks);
  if (seedCriterionInputs.length) await db.insert(criterionInputs).values(seedCriterionInputs);
  if (seedRatios.length) await db.insert(ratios).values(seedRatios);
  if (seedRatings.length) await db.insert(ratings).values(seedRatings);
  if (seedRiskCommentaries.length) await db.insert(riskCommentaries).values(seedRiskCommentaries);
  if (seedApprovalDecisions.length) await db.insert(approvalDecisions).values(seedApprovalDecisions);
  if (seedAuditLog.length) await db.insert(auditLog).values(seedAuditLog);

  console.log(
    `Seeded: ${seedCustomers.length} customers, ${seedAssessments.length} assessments, ${seedDocuments.length} documents, ` +
      `${seedExtractedFields.length} fields, ${seedCriterionInputs.length} criterion inputs, ${seedRatios.length} ratios, ` +
      `${seedRatings.length} ratings, ${seedRiskCommentaries.length} commentaries, ${seedApprovalDecisions.length} decisions, ` +
      `${seedAuditLog.length} audit entries.`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
