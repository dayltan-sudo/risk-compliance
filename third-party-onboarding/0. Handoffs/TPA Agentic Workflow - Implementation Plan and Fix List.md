# TPA Agentic Workflow — Implementation Plan & Fix List

**Owner:** Da'yl Tan, Senior Manager, Risk & Compliance — Keppel
**Date:** 23 June 2026  ·  **Status:** Working notes — TPA is the **active / first** workflow. Pick the Fix List (§7) back up next time.
**Scope:** The TPA (Third Party Associate) agentic workflow only. KYC workflows are in the companion doc *"KYC Agentic Workflows - MAS and non-MAS - Plan and Fix List"*. The TPA *build* (MCP server + guardrails + property mapping) is in `DJ RCTP MCP Server/`.

> **Why split:** tackling all RCTP workflows at once isn't ideal. TPA is furthest along and **establishes the shared platform** the other workflows reuse — so build it first, then KYC.

---

## 1. How to resume

Re-read §2–§3 for context, then work the **Fix List (§7)** (checkboxes = to-do). The detailed TPA build is documented in `DJ RCTP MCP Server/` (handover + 309-field property mapping); this doc is the agentic-direction layer on top.

## 2. Goal & bottlenecks (TPA)

- **Goal:** cut the time of **requesters** (filling the TPA questionnaire) and **reviewers** (checking it), by having an LLM read documents and pre-fill / draft what it can.
- **Bottlenecks (your assessment):**
  1. **Requesters inputting** data into the questionnaire.
  2. **Reviewers checking source documents against the questionnaire.**

**Pre-fill & review model (worked out 23 Jun 2026):**
- **Scope:** ~30–50 fields per onboarding (not the full 309).
- **Pre-fill:** the agent *suggests* inputs with a **confidence indicator**; factual fields (name, country) are high-confidence / light-touch. The value is **review-not-create** — no contract-reading, no manual typing — not blind auto-fill.
- **Maker gate (no rubber-stamp):** the API only *populates* fields; it **cannot submit**. The requester must click through and review **every questionnaire to submit**.
- **Checker gate:** R&C reviews all fields regardless of whether a human or the agent populated them (native, unchanged).
- **Agent review report (citation-only):** a GET across the populated fields produces a report showing the **source reference** per field (e.g. "p.5 of Contract X") so the reviewer flips straight to the proof. **No verdict** — avoids automation bias and self-review circularity. This is the main lever for bottleneck #2.
- **Mandatory-review tagging (R&C-owned):** R&C tags the risk-relevant fields (Country 25% / Interaction 50% / Services 25% + screening names + payment/red-flag) as **must-review**; administrative fields get a lighter touch. *(This 'must-review' list scopes the **review** — distinct from the handover's **high-risk-to-edit** list (`DJ RCTP MCP Server/` §D5), an **edit**-sensitivity list for **tighter logging** (approval itself is the native Dow Jones UI step — no MCP approval). Two purposes, two lists.)*

**Renewal (delta refresh — added 24 Jun 2026):** the same workflow also handles **periodic renewal**. On renewal the agent reads the *latest* documents (new contract / ACRA / company registration), updates **only the properties that changed** (not the whole record), re-screens **only new/changed parties**, and refreshes validity per the RC003 §4.6 cadence (Low 5y / Med 3y / High 1y). Tool: `tpa_renew_from_documents` (register → "Tools (task layer)").

## 3. Shared principles (TPA establishes these for all workflows)

- **Governance spine:** the LLM produces a **verifiable first draft**; the **human maker who checks before the API call is accountable**; the system's **native maker–checker** routes to R&C on top. The LLM needn't be right — just fast to verify.
- **Risk posture:** autonomous only on **high-confidence factual gaps**; every **regulated judgment** is surfaced for human review, never auto-decided.
- **Architecture:** TPA builds the **shared guardrail + capability layer** (identity, access control, BU scoping, audit, maker-checker, and the read → extract → check → draft → validated-API-write machinery). KYC and future workflows **reuse this platform**; only their orchestration is bespoke.

## 4. What already exists for TPA

- **MCP server** wrapping Dow Jones RCTP v0.2 — 18 tools, auth, resources, prompts (reference scaffold in `rctp-mcp-server/`, authored not yet compiled).
- **Access-control & guardrails design** — the full handover doc in `DJ RCTP MCP Server/`.
- **309-field property mapping (draft)** — `DJ RCTP MCP Server/TPA Property Mapping (draft).xlsx`: ~89 in-scope, ~193 needs-review, 10 read-back, 17 system. (Built from the 576-field FULL list; EDD / EDD-ESG excluded. **22 fields are orange-flagged for R&C confirmation.**)
- **Confirmed screening tiers** (RC003 §4.2.2: Low/Medium/High).
- **Tool-design guidance** — the handover now includes a tool-granularity section (`DJ RCTP MCP Server/` §J: one tool vs several) for the build team.
- **Renewal flow (delta)** — `tpa_renew_from_documents` in the register's task layer + a `renew_tpa_from_documents` prompt (updates changed properties only).

## 5. What held up (sound)

- Clear, measurable goal; both bottlenecks correctly located.
- The governance line (verifiable draft + accountable maker + native maker-checker).
- The shared-platform / bespoke-orchestration architecture — TPA is the right first instance.

## 6. Cracks / open risks (by severity)

1. **No measured baseline (MED-HIGH).** Optimising for time on intuition; get a rough per-step measurement to target the bigger of the two bottlenecks and prove the saving.
2. **Automation bias at the review gates (MED → designed-for).** TPA is **not** regulated, and only ~30–50 fields are touched per onboarding. The residual risk is that pre-populated, tidy fields invite less scrutiny than hand-entered ones. Addressed by the pre-fill & review model in §2 (forced per-questionnaire review to submit, R&C reviews all, the citation-only review report, R&C-tagged mandatory-review fields). **Residual exposure sits only on fields *not* tagged mandatory** — so keep that tag list current and aligned to the risk drivers.
3. **Citation accuracy (MED).** The citation-only review report (§2) is deliberately built with *no verdict* and a source reference per field — which resolves the earlier "consolidated report invites rubber-stamping" concern *if* the citations are correct. The residual is **citation precision**: a wrong reference (right field, wrong page) misleads the reviewer. Covered by the accuracy eval (§7) — verify the citations, not just the extracted values.

## 7. Fix list — the to-do (pick up here)

- [ ] **Measure first.** Rough time-per-step baseline (≈10 cases) for requester input vs reviewer review — decide which bottleneck to attack hardest.
- [ ] **Finish the TPA build** (the shared platform): the MCP server + the access-control guardrails per the handover doc; close its gating item (host identity forwarding).
- [ ] **Complete the property mapping + mandatory-review tags.** R&C marks the in-scope fields *and* tags the risk-relevant ones (Country / Interaction / Services + screening + payment/red-flag) as **must-review**.
- [ ] **Pre-fill with a confidence indicator** — agent *suggests* inputs (factual fields high-confidence / light-touch); nothing is auto-submitted (the maker reviews each questionnaire to submit).
- [ ] **Build the citation-only review report** — GET the populated fields, show the **source reference** per field (e.g. "p.5 of Contract X"); **no verdict**; scoped to the R&C-tagged mandatory-review fields. (This largely subsumes the earlier 'consolidated report' idea.)
- [ ] **Run an accuracy eval** on field extraction against real documents before trusting suggestions.
- [ ] **Define the renewal-updatable property subset** — which "certain properties" refresh on renewal (the renewal twin of the onboarding in-scope mapping).

## 8. Edge cases worth building (high benefit)

- **Citation-only review report** — the big lever for reviewer time (bottleneck #2): each field shows its source reference so the reviewer flips straight to the proof. (Subsumes the earlier 'consolidated report' idea.)
- **Discrepancy flagging** — when a document contradicts the questionnaire/registry (RC003's "independent search materially different" red flag), surface it. High compliance value, low effort.
- **Confidence indicator** — surface the agent's per-field confidence so the reviewer's eye goes to the softer fields first (R&C-tagged mandatory fields are reviewed regardless).
- **Renewal "what-changed" diff** — on renewal, surface only the deltas (latest documents vs current record) to the reviewer, not the whole record. A high-value reviewer artifact.

## 9. Where we left off / next time

Architecture and governance are settled, and the pre-fill & review model is worked out (§2). **Highest-leverage next moves:** (1) the baseline measurement, (2) the property mapping + mandatory-review tags, (3) the citation-only review report. Resume from the Fix List.

---

*Working notes — a design and governance aid, not legal advice. Governed by RC003-05 and related R&C policies; confirm against the current SharePoint copies.*
