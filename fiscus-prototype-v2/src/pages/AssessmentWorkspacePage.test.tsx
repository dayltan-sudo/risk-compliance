// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AssessmentWorkspacePage } from "./AssessmentWorkspacePage.js";
import { ErrorBoundary } from "../components/ErrorBoundary.js";
import { useStore } from "../store/useStore.js";
import type { Assessment, Customer } from "../types.js";

const customer: Customer = { id: "c1", name: "Acme Pte Ltd", industry: "Retail", relationshipOwner: "Alice Chen" };
const assessment: Assessment = {
  id: "a1",
  customerId: "c1",
  division: "Div",
  version: 1,
  state: "Draft",
  relationshipType: "New",
  relationshipTypeOverridden: false,
  relationshipTypeOverrideReason: null,
  assessmentYear: 2026,
  recencyFlag: null,
  periods: [],
  productType: null,
  contractStartDate: null,
  contractPeriodMonths: null,
  contractValueOrAverageDemand: null,
  principalActivities: null,
  parentageShareholding: null,
  auditedFinancialsFlag: null,
  createdBy: "Alice Chen",
  createdAt: "2026-01-01",
  submittedBy: null,
  submittedAt: null,
};

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

async function render(path = "/assessments/a1") {
  const container = document.createElement("div");
  await act(async () => {
    createRoot(container).render(
    <ErrorBoundary>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/assessments/:assessmentId" element={<AssessmentWorkspacePage />} />
        </Routes>
      </MemoryRouter>
    </ErrorBoundary>,
    );
  });
  return container.innerHTML;
}

// P0 #9 — a deep link / reload resolves the assessment detail before the
// bootstrap has delivered customers; that used to throw on `customer.name`.
describe("AssessmentWorkspacePage on reload", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    useStore.setState({
      loaded: false,
      customers: [],
      assessments: [],
      extractedFields: [],
      criterionInputs: [],
      ratings: [],
      approvalDecisions: [],
      loadAssessmentDetail: async () => {}, // no network in tests
    });
  });

  it("shows a loading state while the bootstrap is pending, even if the assessment is already in the store", async () => {
    useStore.setState({ assessments: [assessment] });
    const html = await render();
    expect(html).toContain("Loading");
    expect(html).not.toContain("Something went wrong");
  });

  it("does not crash when the assessment's customer is missing after load", async () => {
    useStore.setState({ loaded: true, assessments: [assessment] });
    const html = await render();
    expect(html).toContain("Customer for this assessment not found");
    expect(html).not.toContain("Something went wrong");
  });

  it("says not found for an unknown id once loaded", async () => {
    useStore.setState({ loaded: true, customers: [customer], assessments: [assessment] });
    expect(await render("/assessments/nope")).toContain("Assessment not found");
  });

  it("renders the workspace once everything is loaded", async () => {
    useStore.setState({ loaded: true, customers: [customer], assessments: [assessment] });
    expect(await render()).toContain("Acme Pte Ltd");
  });
});

describe("ErrorBoundary", () => {
  it("renders a message instead of a blank screen when a child throws", async () => {
    function Boom(): never {
      throw new Error("kaboom");
    }
    const container = document.createElement("div");
    await act(async () => {
      createRoot(container).render(
        <ErrorBoundary>
          <Boom />
        </ErrorBoundary>,
      );
    });
    expect(container.innerHTML).toContain("Something went wrong");
    expect(container.innerHTML).toContain("kaboom");
  });
});
