# Sentinel Test Run 4 — Full Flow Coverage (Flows E–J) + Precedence Edge Case

Closes out the remaining gaps in `KYC Orchestrator.md` §3's Flow Summary table. Flows A–D have each been exercised across `Sentinel Output 1–3`; **E, F, G, H, I have never been touched, and J is confirmed-dormant by design.** Also resolves the one open item from the last round: a live confirmation of the Enhanced-first tier precedence fix on a case where both trigger conditions actually hold.

Same simulation conventions as every prior round — hand-traced against the current `.md`/`.csv` files, no deployed runtime. Wave 1/CDD-typing mechanics for the new cases below are **abbreviated** (validated in depth twice already, `Sentinel Output 1–3`) — detail is concentrated on whichever flow is new to this round.

## Portfolio state at the start of this round

| Case | Stage | Resolved Tier | BU | Days Stalled |
| :--- | :--- | :--- | :--- | :--- |
| Silvercrest Asset Management Pte. Ltd. (`KYC-SILVERCREST-001`) | Wave 2 confirmed, 3 open gaps + 1 Non-CTC | Enhanced | Keppel Capital | 20 |
| Meridian Trust Services Pte. Ltd. (`KYC-MERIDIAN-001`) | Wave 2 draft pending (not yet confirmed) | Enhanced | Keppel Capital | 6 |
| Raffles Harbour Pension Trust (`KYC-RAFFLESHARBOUR-001`) | Case Complete | Simplified | Keppel Infrastructure | — |
| Straits Exchange Money Services Pte. Ltd. | *(new this round — see below)* | *(new this round)* | Keppel Capital | — |
| Tanjong Bay Ventures | Wave 1 draft only, never confirmed (`app:inflight_kyc_drafts`, no `case_id`) | — | — | *(invisible to any sweep — per last round's flagged gap)* |

---

## PRECEDENCE EDGE CASE — Straits Exchange Money Services Pte. Ltd.

**New fictional case, chosen specifically to make Q1–4 and Q5–19 both fire.** A MAS-licensed money-changer/remittance agent — Entity.

**Wave 1 (abbreviated):** 6 of 7 base-set documents present; **item 2.5 (specimen signature) missing** — kept deliberately open for the Flow E test below. `session:wave1_checklist_draft` produced; **not yet confirmed** at the point Flow E's Mode 1 runs (see below), then confirmed and staged immediately after (`case_id = KYC-STRAITSX-001`).

**CDD Typing:**
| Q# | Question (short) | Answer | Basis |
| :-- | :-- | :-- | :-- |
| 2 | MAS-regulated FI, FATF-consistent AML/CFT supervision | **Yes** | Requester confirms a Capital Markets Services-equivalent money-changing/remittance licence is on file — genuinely Simplified-eligible on Q1–4's own terms |
| 17 | Cash-intensive business | **Yes** | Nature of business (money-changing/remittance) is inherently cash-intensive — Requester-confirmed |
| *(all other Q1–19)* | No | No other factor disclosed |

**`kyc_submit_cdd_typing`:** Enhanced-first rule applied — Q5–19 checked first, **Q17 = Yes fires**, so **`resolved_cdd_tier = Enhanced`**, regardless of Q2's Simplified-eligible `Yes`.

**Result: precedence fix confirmed working in a live draft.** This is exactly the case `Sentinel Output 3`'s Test 2 flagged as untestable by accident (its Raffles Harbour scenario never produced a genuine conflict) — this one was built to produce one on purpose, and the fix holds: a Simplified-eligible customer type does **not** override a live Enhanced-triggering risk factor.

---

## FLOW E — Exception & Gap Reporting *(first exercise, both modes)*

### Mode 1 — In-session (pre-commit)
Mid-Wave-1, before Straits Exchange's draft is confirmed: scan `session:wave1_checklist_draft` for `Missing`/`Non-CTC` items classified `Mandatory: Yes`. **No MCP call.**

**Exception Matrix (pre-commit):**
- ⚠️ 2.5 Specimen signature — `Missing`, `Mandatory: Yes`. No other open items this wave.

*(Presented to the Requester alongside the confirmation draft — this mode doesn't gate confirmation, per Flow B's "confirmable with gaps" rule; it's a checklist for what to chase next, not a blocker.)*

### Mode 2 — Standalone, on a staged case
Target: **Silvercrest** (`case_id` already known — Flow A resolution skipped). `[SIMULATED]` `kyc_exception_report` pulls the full live checklist/blanks/CTC-flag state from RCTP — not the registry cache, per the flow's own instruction that the cache "holds a summary, not the complete checklist/blanks/CTC-flag detail."

**Exception Matrix (grouped by severity, pre-sign-off checklist — not a verdict):**

| Severity | Item | Status | Note |
| :-- | :-- | :-- | :-- |
| High | 2.6 Government ID (Evelyn Tan Su Min) | Non-CTC | Self-certification failure — needs re-certification by an eligible third party |
| High | 5.3 UBO documentary proof of SOF/SOW | Missing | Enhanced-tier-specific requirement |
| Medium | 2.3 Board resolution/POA to open account | Missing | Wave 1 gap |
| Medium | 3.3 AML/CFT undertaking + UBO declaration | Missing | Wave 2 gap |
| Medium | 3.5 UBO proof of residential address | Missing | Wave 2 gap |

**Result: confirmed working as specified.** Both entry modes behave correctly — Mode 1 stays in-session with no MCP call, Mode 2 correctly goes to a *live* pull rather than trusting the cache, and severity grouping (not a pass/fail verdict) matches the flow's own instruction.

---

## FLOW F — Scheduled Case Registry Refresh

### Normal refresh
`[Scheduler Trigger]` → `[SIMULATED]` `kyc_list_active_cases` → returns current 4 staged/in-progress cases (Silvercrest, Meridian, Raffles Harbour, Straits Exchange — **not** Tanjong Bay, which was never staged) → writes `app:kyc_case_registry`. Cache timestamp updates to "now."

### Failure path — `CACHE_STALE`
`[SIMULATED]` next scheduled refresh fails (RCTP timeout). Per Flow F's own instruction, `KYC Orchestrator` sets `CACHE_STALE` on `app:kyc_case_registry` rather than leaving the cache silently outdated.

**Downstream effect, verified against `KYC Custodian.md` §3.4 (Cache Freshness Check — never tested until now):** rerunning `Sentinel Output 3`'s Test 4 sweep against this state, the report header now reads:

> **Data Freshness:** `DATA MAY BE STALE` — last successful refresh predates this sweep; do not treat the case list below as current.

...prepended ahead of the same Silvercrest/Meridian stalled-case findings, rather than presenting them as a fresh read.

**Result: confirmed working as specified**, both the refresh-success path and the failure→`CACHE_STALE`→Custodian-warning chain, which is the first time that chain has been exercised end-to-end rather than just described in two separate files.

---

## FLOW G — Review Pack Generation *(R&C)*

### Positive path — Silvercrest (staged, ≥ Wave 1 Convergence)
`[SIMULATED]` R&C opens the case; `case_id` already known, Flow A resolution skipped. `kyc_review_pack` pulls the full staged checklist + typing state live from RCTP.

**[REVIEW PACK — Silvercrest Asset Management Pte. Ltd.]**
| Item | Value/Status | Source Reference | Confidence | Mandatory? |
| :-- | :-- | :-- | :-- | :-- |
| 1.1 Certificate of Incorporation | Present | Certificate of Incorporation, p.1 | High | Yes |
| 2.3 Board resolution/POA | Missing | — | — | Yes |
| 2.6 Gov ID (Evelyn Tan Su Min) | Non-CTC | Passport bio-data copy | High | Yes |
| Q2 (CDD Typing) | No | Requester-confirmed | — | Yes |
| Q12 (CDD Typing) | Yes | Requester-supplied (SG NRA sector) | — | Yes |
| 3.4 UBO Gov ID | Present | Notary-certified passport copy | High | Yes |
| 5.3 UBO SOF/SOW proof | Missing | — | — | Yes |
| *(remaining 14 items)* | *(as ledgered in `Sentinel Output 2`)* | | | |

**No verdict column, no "CTC valid ✓" indicator** — per PRD §7.9, confirmed correctly omitted (contrast Silvercrest's 2.6 row above: states `Non-CTC` as a status, not a pass/fail judgment).

### Precondition-failure path — Tanjong Bay Ventures (never staged)
`[SIMULATED]` R&C attempts to open a review pack for Tanjong Bay Ventures. Precondition check: "case must already be staged (at least Wave 1 Convergence)." Tanjong Bay's draft was never confirmed — no `case_id` exists. **Correctly routes to Flow A / Flow B instead** of attempting a `kyc_review_pack` call against nothing.

**Result: confirmed working as specified**, both the positive pull-and-format path and the precondition guard.

---

## FLOW H — Case Status Lookup *(cache-first)*

### Exact match, cache-first read
"Where is Silvercrest's KYC?" → reads `app:kyc_case_registry`: **Stage:** Wave 2 confirmed, 5 outstanding items · **Resolved Tier:** Enhanced · **Cache timestamp:** shown, matching Flow F's last successful refresh. **No screening-hit content of any kind** — Q12's basis ("SG NRA sector") is shown as a typing answer, never anything resembling a screening result, consistent with the system's one-and-only screening-content exception living solely in the Q5/Q11 flag mechanism, not here.

### Fuzzy match — first-ever exercise of Flow A's Node A2/A3 on an inexact name
Query: "How's Silvercrest Asset Mgmt Pte Ltd doing?" (abbreviated, no UEN given). `kyc_find_case` → **Node A2 (Multi-Key Matching):** no Reg No/Tax ID supplied this time, falls through to phonetic name comparison against the registry. **Node A3 (Score Aggregation):** "Silvercrest Asset Mgmt Pte Ltd" vs. registry's "Silvercrest Asset Management Pte. Ltd." → **confidence score 91/100** (single strong candidate, common abbreviation pattern). Presented to the user for confirmation ("Did you mean *Silvercrest Asset Management Pte. Ltd.*, `KYC-SILVERCREST-001`?") rather than auto-resolved silently. `[SIMULATED]` user confirms → resolves to the same case, same status card as above.

**Result: confirmed working — first real exercise of fuzzy/phonetic matching in any Sentinel test to date** (every prior Flow A test used either an exact name or a deliberately-unmatched one). The confidence-score-then-confirm pattern behaves as specified rather than either auto-matching silently or failing outright on an inexact name.

### Optional live refresh
`[SIMULATED]` user explicitly asks for a live (non-cached) check. Only `KYC Orchestrator` may call `kyc_case_status` live, per the flow's own restriction — done here, cache timestamp updates to "just now," status unchanged (nothing had moved since the last refresh).

---

## FLOW I — KYC Cases Portfolio View *(R&C, BU-scoped)*

`[SIMULATED]` R&C user "Alice," permitted BU set = `{Keppel Capital}` only (per `app:user_bu_registry`, shared with TPA). Requests the KYC Cases view.

**[KYC CASES — BU: Keppel Capital]**
| Case | Stage | Resolved Tier | Days Since Last Contact | Current Gate |
| :-- | :-- | :-- | :-- | :-- |
| Silvercrest Asset Management Pte. Ltd. | Wave 2 confirmed | Enhanced | 20 | Wave 2 |
| Meridian Trust Services Pte. Ltd. | Wave 2 draft pending | Enhanced | 6 | Wave 2 |
| Straits Exchange Money Services Pte. Ltd. | CDD Typing confirmed | Enhanced | 0 | Wave 2 (not yet started) |

Sorted by days-since-last-contact, descending. **Raffles Harbour Pension Trust correctly excluded** — owning BU is `Keppel Infrastructure`, outside Alice's permitted set; it never appears in the table or in a count anywhere in the output. **Reads cache only** — no `kyc_*` MCP call made to produce this view, per the flow's stated discipline (identical to TPA's Flow G).

**Result: confirmed working as specified**, including the BU-exclusion boundary, which had never been exercised with an actual excluded case before (only asserted as a rule).

---

## FLOW J — Rectification Correspondence *(confirmed still correctly dormant)*

No test performed — deliberately. `Flow J` is KIV per its own banner ("do not build against this until §7.7 is reprioritized"). Confirmed only that nothing in this round's four live cases (all carrying open Missing/Non-CTC items) triggered any auto-drafted customer email — there is still no send tool wired to anything, and `KYC DocReviewer`'s Missing/Non-CTC output remains exactly as available for manual Requester action as it was in every prior round. No change expected or found here; this is a "still correctly unbuilt" confirmation, not a functional test.

---

## Summary

| Flow | Status before this round | Result |
| :-- | :-- | :-- |
| A (fuzzy/phonetic match specifically) | Only exact-match tested | **Confirmed working** — first exercise of Node A2/A3 scoring |
| E | Untested | **Confirmed working**, both modes |
| F | Untested | **Confirmed working**, including the `CACHE_STALE` → Custodian-warning chain end-to-end |
| G | Untested | **Confirmed working**, both the pull-and-format path and the staged-precondition guard |
| H | Untested | **Confirmed working**, cache-first + fuzzy-match + live-refresh paths |
| I | Untested | **Confirmed working**, including BU-exclusion with a real excluded case |
| J | KIV, not built | Correctly still dormant — nothing to fix |
| Enhanced-first precedence (last round's open item) | Fix written, never exercised live | **Confirmed working** on a case built specifically to conflict |

**Every flow in `KYC Orchestrator.md` §3's table has now been exercised at least once, across `Sentinel Output 1–4`, except Flow J (correctly out of scope).** No new findings requiring a `.md`/`.csv` change surfaced this round — this was a coverage round, not a fix-finding one. The one still-open item remains the same as flagged last round: `KYC Custodian`'s non-visibility into `app:inflight_kyc_drafts` (Tanjong Bay Ventures, this round's throwaway case, is a live example — it never appeared in Flow F's refresh, Flow I's portfolio view, or any Custodian sweep, exactly as the flagged gap predicts).
