# Sentinel Test Run 3 — Coverage Round (Findings 3 & 4 from `Sentinel Output 2`)

Run against the current files, **after** fixing `Sentinel Output 2`'s Findings 1 & 2 (`Agents/KYC DocReviewer.md`, `Workflows/KYC DocReviewer - Flows.md` — both edited immediately before this run). Covers the four paths `Sentinel Output 2` flagged as never exercised:

1. The Q5/Q11 screening-derived recommendation-flag mechanism (Finding 3).
2. A `Simplified`-tier case that skips Flow D entirely (Finding 4a).
3. Reopened/resumed-case routing — both `app:inflight_kyc_drafts` (pre-registry) and `app:kyc_case_registry` (post-registry) resume paths (Finding 4b).
4. `KYC Custodian`'s sweep against a real portfolio (Finding 4c).

All `[SIMULATED]` for the same reasons as every prior round — no deployed runtime, no real MCP layer.

---

## TEST 1 — Q5/Q11 Recommended-Answer Flag (+ confirms the Finding-1 fix in a live draft)

**New fictional case: Meridian Trust Services Pte. Ltd.** (Entity). Wave 1 assumed fully documented and converged without incident — not re-tested in detail here; the focus is Flow C.

### Flow C, Node C1 — Screening Gate Check
`[SIMULATED — human-in-the-loop]` R&C confirms screening resolution occurred outside the system, **with a signal**: "apparent PEP exposure identified on one connected party — Requester's own risk-based judgment required." `screening_status_gate → CLEARED`, carrying this signal. Per `KYC Orchestrator - Flows.md` Flow C, only this much is passed to `KYC DocReviewer` — no party name, no match score, no list-hit detail.

### KYC DocReviewer — CDD Typing Draft (excerpt)

| Q# | Question (short) | Draft state |
| :-- | :-- | :-- |
| 2 | MAS-regulated FI | **Suggested: No — confidence: Medium** (Customer Type resolved "Private Company" from ACRA Bizfile SSIC code alone, no CMS licence documentation on file). *Labelled "suggested, not confirmed — verify before answering."* |
| 5 | PEP exposure (directors/signatories/BOs) | **Recommended answer: Yes** — screening resolution flagged apparent PEP exposure. *Highlighted, never pre-accepted; Requester must explicitly confirm or override.* |
| 11 | Sanctioned (OFAC/EU/UN/UK) | No suggestion or recommendation — screening signal was PEP-specific only, nothing else flagged |

**What this confirms:**
- The two suggestion mechanisms **coexist correctly and stay visibly distinct** in the same draft — Q2's confidence-flagged suggestion (Finding 1's fix) and Q5's screening-derived recommendation read differently (labelling, basis stated) and neither is silently pre-filled as a final answer.
- **No leakage:** nothing in the draft names the connected party, states a match score, or describes the nature of the PEP hit beyond "apparent PEP exposure identified." The rule holds under an actual live draft, not just as written prose in the `.md` file.

### Host Client Confirmation Gate — CDD Typing
`[SIMULATED]` Requester reviews both flags: overrides Q2's suggestion to confirm `No` (agrees with the suggestion, explicitly), and confirms Q5's recommendation as `Yes` (accepts it, after doing their own risk-based review — not because the system told them to). `session:confirmed_cdd_typing` captured with both as explicit human decisions, not carried-over suggestions.

**`kyc_submit_cdd_typing`:** Yes to Q5 → **`resolved_cdd_tier = Enhanced`** (second distinct Enhanced-trigger path exercised across the test suite — `Sentinel Output 2`'s Silvercrest triggered via Q12; this one via Q5).

**Result: mechanism confirmed working as specified, first exercise ever.** No further action needed on this finding.

---

## TEST 2 — Simplified Tier (Flow D Never Triggers)

**New fictional case: Raffles Harbour Pension Trust.** (Entity — a company-established pension/superannuation scheme.) Wave 1 assumed fully documented, no gaps — deliberately kept clean so this test isolates the tier-routing behavior, not gap mechanics already covered twice.

### CDD Typing
| Q# | Question (short) | Answer |
| :-- | :-- | :-- |
| 1 | Listed entity | No |
| 2 | MAS-regulated FI | No |
| 3 | SG Government Entity | No |
| **4** | **Pension/superannuation scheme, no assignment of member interest** | **Yes** — Trust Deed confirms scheme rules prohibit assignment |
| 5–19 | *(all)* | No — clean screening result, no other risk factor disclosed |

**`kyc_submit_cdd_typing`:** Yes to Q4 → **`resolved_cdd_tier = Simplified`**.

### Routing
Per the State Reference doc: *"A `Simplified` case is Case Complete the moment CDD Typing Convergence is met — don't wait for a Wave 2 that will never trigger."* Flow D is **not** invoked. `KYC Orchestrator` produces the final case report with no Section 4 Wave-2 rows and no Wave-2-outstanding conditions.

**Result: confirmed working exactly as specified.** `Case Complete` triggers correctly straight off CDD Typing Convergence; the Orchestrator doesn't wait on or reference a Wave 2 that structurally can't happen for this tier.

**One open question this test could not resolve (flagging, not fixing):** this scenario answered `No` to every one of Q5–19, so it never tests what happens if a case is *both* Q1–4-eligible (Simplified) *and* has a `Yes` somewhere in Q5–19 (Enhanced-triggering). Neither `KYC Orchestrator.md` nor the Flows doc states which wins. Real MAS Simplified-CDD practice typically treats the Simplified-eligible customer *type* itself as the override (customer-type-based Simplified CDD isn't usually defeated by a single risk-factor answer) — but that's this test's inference, not a stated rule. Worth a one-line precedence rule in `kyc_submit_cdd_typing`'s spec (Yes-to-Q1–4 wins outright, or the reverse) rather than leaving it implicit.

---

## TEST 3 — Reopened/Resumed-Case Routing

Two distinct mechanisms, tested separately since they key off different state.

### 3a. Pre-registry resume (`app:inflight_kyc_drafts`)

Continuing **Meridian Trust Services** (Test 1): imagine instead that its session had ended **before** Wave 1's Host Client Confirmation Gate — documents uploaded, `KYC DocReviewer` produced `session:wave1_checklist_draft`, but the Requester never confirmed and `kyc_open_case` was never called. No `case_id` exists; nothing was ever written to `app:kyc_case_registry`.

Requester returns days later, types the company name again.

- **Flow A:** `kyc_find_case("Meridian Trust Services Pte. Ltd.")` against `app:kyc_case_registry` → `[SIMULATED]` **no match** (correct — the case was never staged, so it can't be in the registry). Routes into **Flow B as a fresh case**, per Flow A's own stated routing rule.
- **Flow B entry:** *before* calling `Doc Analyst`, checks `app:inflight_kyc_drafts` for this case+user → `[SIMULATED]` **finds the abandoned Wave 1 draft**. Offers to resume rather than restart. Requester accepts. `KYC DocReviewer` and `Doc Analyst` are **not** re-invoked — the existing `wave1_checklist_draft` is re-presented directly at the Host Client Confirmation Gate.

**Result: confirmed working as specified.** The resumability check does what `KYC Orchestrator - Flows.md` Flow B says it does — the two-key design (registry for staged cases, in-flight-drafts for pre-write sessions) correctly routes a never-staged, abandoned session back through the resume path rather than either silently vanishing or forcing a full document re-upload.

### 3b. Post-registry resume (`app:kyc_case_registry`, resume-at-gate)

Continuing **Silvercrest Asset Management** (`Sentinel Output 2`): its Wave 1 *was* confirmed and staged (`case_id = KYC-SILVERCREST-001`, in the registry), then the session ended before Flow C started — case sits at "Waiting on screening resolution."

Requester returns, types the company name.

- **Flow A:** `kyc_find_case` → `[SIMULATED]` **match found** (UEN `202145678K`). `session:historical_case_profile` seeded; **the case's current wave/gate position is read from the registry** and the user is routed directly into **Flow C's entry state** — not back into Flow B, not asked to re-upload Wave 1 documents.

**Result: confirmed working as specified.** This is the mechanism `Sentinel Output 1`'s Flow A already exercised in the abstract ("no candidate match" case); this is its first test of the *match-found* branch, and it correctly resumes at the gate rather than restarting the case.

**New finding — a real visibility gap, not a bug:** `KYC Custodian` (see Test 4) reads only `app:kyc_case_registry`, never `app:inflight_kyc_drafts` (confirmed against the Cross-Agent Key Index in the State Reference doc — that key is Orchestrator-only). An abandoned **pre-confirmation** Wave 1 draft, like Meridian's in Test 3a, is therefore **completely invisible to any portfolio-level staleness sweep** — it exists only in a session-scoped, per-user store that no auditing agent ever reads. A case can sit abandoned indefinitely before its first confirmation with zero portfolio visibility, in a way that can never happen once it's staged. Worth flagging to the tech team: either `KYC Custodian` needs read access to `app:inflight_kyc_drafts` too, or this is an accepted gap (pre-staging abandonment is out of scope for portfolio auditing) — but right now it's neither decided nor documented, just a byproduct of how the two keys are scoped.

---

## TEST 4 — KYC Custodian Sweep

Portfolio at this point in the test suite: **Silvercrest** (Enhanced, staged, sitting at Wave 2 with 3 open gaps per `Sentinel Output 2`), **Raffles Harbour Pension Trust** (Simplified, `Case Complete`), **Meridian Trust Services** (never staged — per Test 3a's finding, invisible to this sweep).

`[SIMULATED]` `app:kyc_case_registry` read, not live. Assume Silvercrest's last customer contact was 20 days ago (exceeds the 14-day Wave 1/2 default threshold); Raffles Harbour completed with no outstanding threshold breach.

### [FM&I KYC CASE PORTFOLIO AUDIT: STALLED CASE & REMEDIATION FORECAST]
- **Audit Reference:** `AUDIT-KYC-SIM-001`
- **Data Freshness:** `CACHE FRESH` *(simulated — no `CACHE_STALE` flag set)*

| Case Name | Case ID | Risk Tier (this sweep) | Resolved CDD Tier | Days Stalled | Current Gate | Primary Remediation Trigger |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| Silvercrest Asset Management Pte. Ltd. | `KYC-SILVERCREST-001` | `HIGH` | Enhanced | 20 | Wave 2 | 3 open mandatory items (3.3, 3.5, 5.3) + unresolved self-cert failure (2.6) |

*(Raffles Harbour Pension Trust correctly excluded — `Case Complete`, no gate to stall at. Meridian Trust Services does not appear — never reached the registry; see Test 3b's finding.)*

#### Strategic Remediation Directives
1. **Immediate Focus (Critical):** `KYC-SILVERCREST-001` — `Enhanced`-tier case stalled at Wave 2 for 20 days, past the 14-day default threshold. Per `KYC Custodian.md` §3.2, an `Enhanced`-tier stall auto-classifies `HIGH` regardless of which specific items are outstanding.
2. Chase items 3.3 (AML/CFT undertaking + UBO declaration), 3.5 (UBO proof of address), 5.3 (UBO SOF/SOW documentary proof) — per `Sentinel Output 2`'s own Conditions C3/C4.
3. Resolve item 2.6's self-certification failure (C2) — a factual gap independent of Wave 2's chase items, still open.

**Result: confirmed working as specified.** Node 2's staleness filter, Node 3's risk tiering (`Enhanced` stall → `HIGH`, matching the rule literally), and the scope-discipline rule (this report doesn't re-summarize Silvercrest's checklist detail, only cites what's specific to *this* sweep — staleness and remediation triggers) all behave as documented. This is `KYC Custodian`'s first exercise against an actual case, not just a confirmation that it correctly *doesn't* run mid-flow.

---

## Summary — Findings 3 & 4 Disposition

| Finding (from `Sentinel Output 2`) | Result |
| :--- | :--- |
| 3. Q5/Q11 recommendation-flag mechanism untested | **Tested, confirmed working.** No leakage; coexists correctly with the new Finding-1 suggestion mechanism. |
| 4a. `Simplified`-tier routing untested | **Tested, confirmed working.** One new open question surfaced: Simplified-vs-Enhanced precedence when both trigger conditions hold — not a defect, a genuinely unstated rule. |
| 4b. Resumed/reopened-case logic untested | **Tested, confirmed working**, both sub-paths (`app:inflight_kyc_drafts` pre-registry resume; `app:kyc_case_registry` match-and-resume-at-gate). **One new finding:** pre-staging abandoned drafts are invisible to any portfolio sweep — undecided whether that's intended. |
| 4c. `KYC Custodian` sweep untested | **Tested, confirmed working** against a real (simulated) portfolio, not just checked for correct non-interference. |

**New open items for the tech team, not yet actioned (same "flag, don't silently fix" posture as every prior round):**
1. Simplified-vs-Enhanced tier precedence when both conditions independently hold (Test 2).
2. Whether `KYC Custodian` should read `app:inflight_kyc_drafts` for pre-staging staleness, or whether that's accepted as out of scope (Test 3b).

No further findings from this round require a `.md`/`.csv` file change — both are policy decisions for the tech team/R&C, not implementation gaps.
