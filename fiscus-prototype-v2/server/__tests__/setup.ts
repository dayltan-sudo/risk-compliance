// Shared by every server route test: swap the pooled Neon client for PGlite
// and stub the Risk Commentary LLM (everything else is real).
import { vi, beforeAll, beforeEach } from "vitest";
import { ensureMigrated, resetDb } from "./testDb.js";

vi.mock("../db/client.js", async () => ({ db: (await import("./testDb.js")).db }));
vi.mock("../lib/riskCommentaryLLM.js", () => ({
  generateRiskCommentaryLLM: async (assessmentId: string, ratingId: string) => ({
    id: "unused",
    assessmentId,
    ratingId,
    observations: [],
    noObservations: true,
    modelVersion: "test",
    promptVersion: "test",
    generatedAt: "2026-01-01",
    supersededAt: null,
  }),
}));

beforeAll(ensureMigrated, 60_000);
beforeEach(resetDb);
