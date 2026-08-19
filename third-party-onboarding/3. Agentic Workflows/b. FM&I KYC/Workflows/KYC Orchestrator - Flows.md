# KYC Orchestrator — Full Flow Diagrams & Step-by-Step Routing

Companion to [`Agents/KYC Orchestrator.md`](..%2FAgents%2FKYC%20Orchestrator.md) §3, which carries only the flow summary table. This document holds the full node diagrams and step-by-step instructions the summary table points to — read it before implementing any flow, not just the one-line description.

---

### Flow A: Pre-Flight Case Resolution (`kyc_find_case`)
Mirrors `TPA Orchestrator.md` Flow A exactly, against a different registry. Mandatory gate before Flow B ever starts.
```
[Entry: Company/Customer Name typed or selected by user]
                 │
                 ▼
[Node A1: Registry Indexing] ──► Retrieves candidate cases from {app:kyc_case_registry}
                 │
                 ▼
[Node A2: Multi-Key Matching] ──► Compares Reg No / Customer ID, Tax ID, and Phonetic Names
                 │
                 ▼
[Node A3: Score Aggregation] ──► Calculates confidence score (0-100) per match candidate
                 │
                 ▼
[Output: Case Resolution] ──► Writes session:case_resolution_result;
                               on a confirmed match, seeds session:historical_case_profile
                               and the case's current wave/gate position from the registry
```
*   **Routing Outcome:** A confirmed match routes the user into the case at whatever wave/gate it last stopped at (resuming via `app:inflight_kyc_drafts` if a draft exists — see the State Reference doc). No match routes into **Flow B** as a fresh case.

---

### Flow B: Wave 1 Intake & Confirmation (`kyc_open_case`)
Covers the case's opening move — the tier-independent document set, requested and checked **before CDD typing is known** (PRD §7.2/§7.5). Converges at Wave 1 only, not the whole case.

**Resumable draft.** Check `app:inflight_kyc_drafts` on entry for an existing Wave 1 draft for this case+user before calling Doc Analyst; offer to resume rather than restart.
```
   [Entry from Flow A: fresh case, or reopened case at the Wave 1 stage]
                                │
                                ▼
                     [Calls Doc Analyst] (Horizontal — shared with TPA, raw text extraction)
                                │
                                ▼
              [Calls KYC DocReviewer] (Wave 1 checklist matching — item set is
                                        the 18 Wave-1 properties from the main
                                        doc's §4 checklist reference (Q1 + Q2's
                                        tier-independent items), handed to it by
                                        you — plus baseline identity/CDD-typing-
                                        questionnaire fields; CTC factual
                                        completeness check per item, resolving
                                        directly to Present/Missing/Non-CTC —
                                        certifier-eligibility characterization is
                                        KIV, deferred to v2, no handoff)
                                  │
                                  ▼
              [HOST CLIENT CONFIRMATION GATE — Wave 1] ◄── human-in-the-loop, mandatory
                 Presents session:wave1_checklist_draft (item + status + confidence +
                 citation) to the Requester in the canvas. Nothing written to RCTP
                 yet. Blocks here until confirmed/amended.
                                  │
                                  ▼
              [Capture session:confirmed_wave1_checklist]
                                  │
                                  ▼
        [Calls MCP Task Tool: kyc_open_case] ──► Creates the staged case record +
                                                  Wave 1 checklist status + baseline
                                                  identity fields. Returns case_id →
                                                  session:staged_case_id.
                                  │
                                  ▼
              [Wave 1 Convergence Validation Gate]
                                  │
                                  ▼
              [Case now sits at: Waiting on screening resolution — see Flow C]
```
#### Step-by-Step Routing Instructions:
1.  **Ingestion & Checklist Matching:** Route raw document input to `Doc Analyst`, then trigger `KYC DocReviewer` with the parsed payload to match uploaded documents against Wave 1 checklist items and extract the baseline identity fields (Third Party Type, Customer Type, Person/Entity core fields). Produces `session:wave1_checklist_draft` as a **draft held in session state only.** `KYC DocReviewer`'s factual CTC completeness check resolves each certification-bearing item directly to `Present`/`Non-CTC` — no further eligibility characterization runs (KIV, deferred to v2; see `CTC Reviewer.md`'s banner).
2.  **Host Client Confirmation Gate (Wave 1):** Present the full Wave 1 checklist — item, status, confidence, citation — to the Requester. Do not proceed to the RCTP write until explicitly confirmed. Write whatever is confirmed into `session:confirmed_wave1_checklist`. **A draft with open gaps (`Missing`/`Non-CTC` items) is confirmable as-is (confirmed 22 Jul 2026)** — the gate does not require every item to resolve to `Present` first. Confirming means "the Requester has reviewed this draft, gaps included," not "this draft is complete." Every gap must stay individually visible in what's presented — never collapse them into a single summary count — so the Requester confirms with full knowledge of exactly what's open, not a vague "2 items missing."
3.  **RCTP Write-Back:** Call `kyc_open_case`, passing `session:confirmed_wave1_checklist`. Capture the returned `case_id` into `session:staged_case_id`. **Gaps are not posted, not blocked, not padded:** `kyc_open_case` batch-uploads only the properties with an actual confirmed value — a `Missing` or `Non-CTC` item simply has no property value to send this round, exactly as if that document hadn't been asked for yet. It reaches RCTP later, via the same `kyc_open_case` / `kyc_submit_wave2_documents` batch-upload path, once the Requester supplies it in a subsequent chase round — no separate mechanism, no placeholder value written now.
4.  **Wave 1 Convergence Validation Gate:** Confirm the Wave 1 Convergence formula (State Reference doc) is met before treating Wave 1 as done.
5.  **Advance to Flow C.** Do not attempt CDD typing before Wave 1 has converged.

---

### Flow C: Screening-Gate Wait & CDD Typing (`kyc_submit_cdd_typing`)
Covers PRD §7.3. Gated on **Wave 1 Convergence** and, separately, on `screening_status_gate = CLEARED` — a human-set signal, not an MCP read (see the State Reference doc's Screening Gate note).
```
[Entry: Wave 1 Convergence met]
                 │
                 ▼
[Node C1: Screening Gate Check] ──► If screening_status_gate ≠ CLEARED, halt here.
                                     Case status (Flow H) shows the content-free
                                     "Waiting on screening resolution" label. No
                                     further action until a human confirms
                                     resolution happened outside this system.
                 │  (gate cleared)
                 ▼
[Calls KYC DocReviewer] (Drafts the CDD-typing questionnaire — Third Party Type /
                          Person / Entity baseline already captured in Wave 1;
                          this node covers the Type of Customer Due Diligence
                          Q1–19 battery. If you were handed an external
                          screening-derived flag alongside the gate-clear signal
                          — e.g. "apparent PEP or sanctions exposure identified"
                          — pass it through to KYC DocReviewer so it can
                          highlight Q5/Q11 with a recommended answer.)
                 │
                 ▼
[HOST CLIENT CONFIRMATION GATE — CDD Typing] ◄── human-in-the-loop, mandatory
   Presents session:cdd_typing_draft, including any recommended-answer flag,
   visibly highlighted, never pre-accepted.
                 │
                 ▼
[Capture session:confirmed_cdd_typing]
                 │
                 ▼
[Calls MCP Task Tool: kyc_submit_cdd_typing] ──► Server-side rule resolves the
                                                   tier, Enhanced-first
                                                   (confirmed 22 Jul 2026):
                                                   Enhanced if Yes to any of
                                                   Q5–19, checked first and
                                                   taking precedence — else
                                                   Simplified if Yes to any of
                                                   Q1–4 — else Standard. A
                                                   case Simplified-eligible by
                                                   customer type (Q1–4) but
                                                   carrying an Enhanced-
                                                   triggering risk factor
                                                   (Q5–19) resolves Enhanced,
                                                   never Simplified. Returns
                                                   tier → session:resolved_cdd_tier.
                 │
                 ▼
[CDD Typing Convergence Validation Gate]
                 │
        ┌────────┴────────┐
        ▼                  ▼
  [Simplified]      [Standard / Enhanced]
  → Case Complete    → Advance to Flow D (Wave 2)
  (skip Flow D)
```
*   **You never compute the tier yourself.** The Simplified/Standard/Enhanced mapping rule is server-side logic behind `kyc_submit_cdd_typing` — you capture the human-confirmed questionnaire and pass it through.
*   **The recommended-answer flag is the only screening-derived content that ever reaches the user in this entire system.** If you receive a screening-derived signal from whatever upstream process resolved the hit, pass through only enough for `KYC DocReviewer` to highlight the relevant question (Q5 PEP exposure / Q11 sanctions exposure) — never party names, match scores, or list-hit detail.

---

### Flow D: Wave 2 Document Chase & Confirmation (`kyc_submit_wave2_documents`)
**Trigger:** `session:resolved_cdd_tier` is `Standard` or `Enhanced` (Flow C). Not triggered for `Simplified`.
```
   [Entry from Flow C: tier = Standard or Enhanced]
                                │
                                ▼
                     [Calls Doc Analyst] (Horizontal, shared)
                                │
                                ▼
              [Calls KYC DocReviewer] (Wave 2 checklist matching — item set is
                                        the tier-scoped filter of the main doc's
                                        §4 checklist reference you compute and
                                        hand to it: Standard = 16 properties
                                        (2.4, 2.7, Q3, Q4); Enhanced = 22
                                        properties (adds Q5) — plus CTC factual
                                        check on any new certification-bearing
                                        items, resolving directly to
                                        Present/Missing/Non-CTC — no eligibility-
                                        characterization handoff, KIV/deferred
                                        to v2)
                                  │
                                  ▼
              [HOST CLIENT CONFIRMATION GATE — Wave 2]
                                  │
                                  ▼
              [Capture session:confirmed_wave2_checklist]
                                  │
                                  ▼
        [Calls MCP Task Tool: kyc_submit_wave2_documents]
                                  │
                                  ▼
              [Wave 2 Convergence Validation Gate] ──► Case Complete
```
*   A case does not get a separate third round for Enhanced — everything beyond Wave 1 applicable to the resolved tier is requested together, in this one Wave 2.

---

### Flow E: Exception & Gap Reporting (`kyc_exception_report`)
Mirrors `TPA Orchestrator.md` Flow C, two entry modes:
*   **Mode 1 — In-session (pre-commit).** During a live Flow B/C/D run, scan the relevant `session:*_draft` for null/blank/Missing/Non-CTC items classified mandatory. No MCP call.
*   **Mode 2 — Standalone on a staged case.** Resolve via **Flow A** if `case_id` isn't already known, then call `kyc_exception_report` to pull the full checklist state live from RCTP. Reading `app:kyc_case_registry` alone is **not** sufficient — the cache holds a summary, not the complete checklist/blanks/CTC-flag detail.
*   **Construct Exception Matrix:** present exceptions grouped by severity, a pre-sign-off checklist, not a pass/fail verdict.

---

### Flow F: Scheduled Case Registry Refresh (Background — `kyc_list_active_cases`)
Mirrors `TPA Orchestrator.md` Flow D.
```
[Scheduler Trigger] ──► [Calls MCP Task Tool: kyc_list_active_cases] ──► [Writes result to app:kyc_case_registry cache]
```
*   You are the only agent that runs this job. `KYC Custodian` reads the cache; it never calls `kyc_list_active_cases` or any other MCP tool itself.
*   If the refresh fails or the cache goes stale beyond a configured threshold, set `CACHE_STALE` on `app:kyc_case_registry` so `KYC Custodian`'s sweep surfaces a staleness warning instead of silently reporting on outdated data.

---

### Flow G: Review Pack Generation (`kyc_review_pack`) *(R&C)*
Mirrors `TPA Orchestrator.md` Flow E. Standalone from Flows B–D — triggered whenever an R&C reviewer opens an already-staged case. Reads and reports only; never re-triggers ingestion or a write-back.
```
[Entry: R&C opens a case for review]
                 │
                 ▼
[Resolve target case] ──► Reuses Flow A if case_id isn't already known
                 │
                 ▼
[Calls MCP Task Tool: kyc_review_pack] ──► Pulls the staged case's full checklist +
                                            typing state (values, sources, confidence)
                                            live from RCTP
                 │
                 ▼
[Synthesize Review Pack Report] ──► Item | Value/Status | Source Reference |
                                     Confidence | Mandatory? — no verdict column,
                                     no "CTC valid ✓" indicator, per PRD §7.9.
```
*   **Precondition:** the case must already be staged (at least Wave 1 Convergence). If not found, route to Flow A / Flow B instead.

---

### Flow H: Case Status Lookup (`kyc_case_status`) — cache-first
Mirrors `TPA Orchestrator.md` Flow F, backing PRD §7.10. Read-only, no confirmation gate, no write.
```
[Entry: user asks "where is [company]'s KYC?" / invoked from within another flow]
                 │
                 ▼
[Resolve target case] ──► Reuses Flow A if case_id isn't already known
                 │
                 ▼
[Read status — cache-first] ──► Reads app:kyc_case_registry: case stage (Wave 1 /
                                Waiting on screening resolution / CDD typing /
                                Wave 2 / Review / Complete), resolved tier once
                                known, outstanding item count. Shows the cache
                                timestamp so a stale value is never presented as
                                live. No screening-hit content of any kind.
                 │
                 ▼
[Optional live refresh] ──► Only you may call kyc_case_status for a live read.
                 │
                 ▼
[Output: read-only status card]
```

---

### Flow I: KYC Cases Portfolio View (User-Triggered, BU-Scoped) *(R&C)*
Mirrors `TPA Orchestrator.md` Flow G, backing PRD §7.12's confirmed **separate** "KYC Cases" page (not unified with TPA's Third Parties page).
```
[Entry: R&C user requests the KYC Cases view]
                 │
                 ▼
[Resolve requesting user's BU access] ──► Reads app:user_bu_registry (shared with TPA)
                 │
                 ▼
[Scope by BU] ──► From app:kyc_case_registry, keep only cases whose owning BU is in
                  the user's permitted set
                 │
                 ▼
[Filter + sort] ──► By stage, resolved tier, days since last customer contact
                 │
                 ▼
[Output: KYC Cases table] ──► Each row can launch the case at its current gate
                              directly. Shows the cache timestamp.
```
*   **Reads cache, never MCP:** identical discipline to TPA's Flow G.

---

### Flow J (Deferred — not built): Customer Rectification Correspondence
> **KIV — do not build against this until §7.7 of the FM&I KYC PRD is reprioritized.** Confirmed 17 Jul 2026: the drafting/send workflow for customer-facing rectification emails is **not a current priority**. `KYC DocReviewer`'s checklist output (Missing/Non-CTC items, per Wave) remains fully available for a Requester to act on **manually, outside this agent system**. This stub exists so the concept and its non-negotiable human-gating principle (never auto-sent, no exceptions) aren't lost when this is revisited, exactly as `Screener.md`'s KIV banner preserves an unbuilt flow's intent without inviting it to be built prematurely. When reprioritized, this flow would sit here, gated on `confirmed_wave1_checklist` / `confirmed_wave2_checklist` containing Missing/Non-CTC items, with an explicit human-send confirmation before any MCP-adjacent send action — no send tool exists today.
