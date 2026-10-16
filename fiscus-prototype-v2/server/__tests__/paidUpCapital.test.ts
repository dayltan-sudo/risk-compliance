import { describe, it, expect, vi, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "./testDb.js";
import { app } from "../app.js";
import { cookieFor, seedAssessment } from "./fixtures.js";
import { assessments, criterionInputs, extractedFields } from "../db/schema.js";
import { extractPaidUpCapital, toAbsoluteValue } from "../lib/extraction.js";

const llm = vi.hoisted(() => ({ callStructuredLLM: vi.fn() }));
vi.mock("../lib/llm.js", () => llm);
vi.mock("../lib/blob.js", () => ({ storeDocument: async () => "blob://test" }));
vi.mock("../lib/documentText.js", () => ({ extractDocumentText: async () => "statement text" }));

beforeEach(() => {
  llm.callStructuredLLM.mockReset(); // block body: a returned function would run as a teardown hook
});

// P0 #3 — paid-up capital must be returned at absolute scale.
describe("extractPaidUpCapital scaling", () => {
  it("toAbsoluteValue multiplies by the scale", () => {
    expect(toAbsoluteValue(2000, "thousands")).toBe(2_000_000);
    expect(toAbsoluteValue(2, "millions")).toBe(2_000_000);
    expect(toAbsoluteValue(2000, "units")).toBe(2000);
    expect(toAbsoluteValue(2000, null)).toBe(2000);
  });

  it("scales a registry figure by the scale the model read", async () => {
    llm.callStructuredLLM.mockResolvedValue({ value: 2000, scale: "thousands", currency: "sgd", confidence: 90, sourcePointer: "p1" });
    const r = await extractPaidUpCapital({ text: "x", documentKind: "registry", sessionId: "s" });
    expect(r).toMatchObject({ value: 2_000_000, currency: "SGD" });
  });

  it("a statement note inherits the statement's detected scale and currency", async () => {
    llm.callStructuredLLM.mockResolvedValue({ value: 2000, scale: "units", currency: null, confidence: 80, sourcePointer: "note 12" });
    const r = await extractPaidUpCapital({ text: "x", documentKind: "statement-note", sessionId: "s", statementScale: "thousands", statementCurrency: "USD" });
    expect(r).toMatchObject({ value: 2_000_000, currency: "USD" });
  });

  it("passes through a missing figure", async () => {
    llm.callStructuredLLM.mockResolvedValue({ value: null, scale: null, currency: null, confidence: null, sourcePointer: null });
    const r = await extractPaidUpCapital({ text: "x", documentKind: "registry", sessionId: "s" });
    expect(r).toEqual({ value: null, currency: null, confidence: null, sourcePointer: null });
  });

  it("does not default an undeterminable currency to SGD", async () => {
    llm.callStructuredLLM.mockResolvedValue({ value: 5, scale: "units", currency: null, confidence: 50, sourcePointer: "p" });
    expect((await extractPaidUpCapital({ text: "x", documentKind: "registry", sessionId: "s" })).currency).toBeNull();
  });
});

// P0 #3 + #4 end to end: the upload route stores the statement's own scale and currency on criterion 5.
describe("statement upload prefills criterion 5 from the share-capital note", () => {
  async function upload(assessmentId: string) {
    const form = new FormData();
    form.set("type", "audited");
    form.set("file", new File(["x"], "fy2026.pdf", { type: "application/pdf" }));
    return app.request(`/api/assessments/${assessmentId}/documents`, { method: "POST", headers: { cookie: await cookieFor() }, body: form });
  }

  it("stores 2,000 (S$'000) as 2,000,000 USD, not 2,000 SGD", async () => {
    await seedAssessment({ id: "a1" });
    await db.delete(extractedFields).where(eq(extractedFields.assessmentId, "a1"));
    await db.update(assessments).set({ periods: [] }).where(eq(assessments.id, "a1"));
    await db.update(criterionInputs).set({ paidUpCapital: null }).where(eq(criterionInputs.id, "crit-a1-5"));

    llm.callStructuredLLM.mockImplementation(async (opts: { sessionId: string }) => {
      return opts.sessionId.startsWith("extract-")
        ? { period: "FY2026", financialsDate: "2026-06-30", presentationCurrency: "USD", presentationScale: "thousands", fields: [] }
        : { value: 2000, scale: "units", currency: null, confidence: 90, sourcePointer: "note 12" };
    });

    const res = await upload("a1");
    expect(res.status).toBe(201);

    const [c5] = await db.select().from(criterionInputs).where(eq(criterionInputs.id, "crit-a1-5"));
    expect(c5.paidUpCapital).toBe(2_000_000);
    expect(c5.currency).toBe("USD");
    expect(c5.source).toBe("statement-note");
  });
});
