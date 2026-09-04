# Census Test Run 2 — FM&I KYC, Full Pipeline Rerun (Flow A → B → C → D)

**Rerun of `Census Output 1`'s Silvercrest case, extended end-to-end.** Simulated by Claude against the *current* `.md`/CSV files, following the same simulation convention as all prior Census tests (no deployed FM&I KYC runtime exists — this is a hand-traced walkthrough of the prompt specs, not code execution).

## Why this rerun

Every file below was edited **after** `Census Output 1` ran (22 Jul, 10:11) but **before** this run:

| File | Last edited |
| :--- | :--- |
| `References/KYC Reference - Document Checklist Properties.csv` | 22 Jul, 10:16 |
| `Agents/KYC Orchestrator.md` | 22 Jul, 10:17 |
| `Workflows/KYC Orchestrator - Flows.md` | 22 Jul, 14:21 |
| `Agents/KYC DocReviewer.md` | 22 Jul, 14:46 |
| `References/KYC Reference - Baseline Identity Properties.csv` | 22 Jul, 14:46 |
| `References/KYC Reference - Answer Lists.md` (new file) | 22 Jul, 14:51 |

Scope of this run: **the entire onboarding pipeline** — Flow A (Pre-Flight) → Flow B (Wave 1) → Flow C (Screening-Gate Wait & CDD Typing) → Flow D (Wave 2). `Census Output 1` covered Flow A → B only; Flow C and Flow D have **never been exercised**, even in simulation, until this run.

**Fixture note:** Wave 1 reuses the same 7 fictional PDFs from `Census Output 1` (`Source Docs/`, unchanged). **No new PDF fixtures were generated for Wave 2/CDD-typing** — those facts (shareholder register, UBO identity, SOF/SOW declarations, etc.) are narrated inline below, clearly marked, in the same spirit as prior tests' `[SIMULATED]` human-in-the-loop steps. If the tech team wants file-based evidence for Wave 2, fixtures should be generated following the `reportlab` pattern used for Wave 1 (see the TPA handoff's note on this). Two things remain genuinely `[SIMULATED]` because no real system exists behind them: the Host Client human-confirmation gates, and every `kyc_*` MCP write-back.

---

## FLOW A — Pre-Flight Case Resolution

`kyc_find_case("Silvercrest Asset Management Pte. Ltd.")` against `app:kyc_case_registry` → `[SIMULATED]` no candidate match (UEN `202145678K` not found). `session:case_resolution_result = NEW_CASE`. Routes into Flow B fresh. *(Unchanged from `Census Output 1` — Flow A itself wasn't touched this session.)*

---

## FLOW B — Wave 1 Intake & Confirmation

### KYC DocReviewer — Flow A (Wave 1 Checklist Matching & Baseline Extraction)

Same 7 documents, same underlying facts as `Census Output 1`. Rematched against the **current** rules to confirm what changed.

#### Node 1 — Checklist-Item Matching (unchanged from Output 1 — no rule here was touched)

| Item | Status | Confidence | Source Citation | Mandatory |
| :--- | :--- | :--- | :--- | :--- |
| 1.1 Certificate of Incorporation | Present | High | *Certificate of Incorporation*, p.1 | Yes |
| 1.2 Certificate of Incumbency / business registration extract | Present | High | *ACRA Bizfile Extract*, p.1 | Yes |
| 1.3 Certificate of Change of Name | **Missing** | — | No document provided | **No** ⬅ *changed* |
| 1.4 Constitution / M&AA / LPA / Trust Deed | Present | High | *Constitution (Excerpt)*, Cl. 1–4 | Yes |
| 2.1 Register of Directors | Present | High | *Register of Directors*, p.1 | Yes |
| 2.2 Board resolution appointing person to act on behalf | Present | High | *Board Resolution (Appointment)*, Res. 1, 18 Jun 2026 | Yes |
| 2.3 Board resolution/POA to open account, subscribe, or transact | **Missing** | — | No document provided | Yes — **MISSING** |
| 2.5 Specimen signature | Present | Medium | *Specimen Signature* — low-resolution scan | Yes |
| 2.6 Government-issued ID (person acting on behalf) | **Non-CTC** | High | *Government ID (Passport Bio-data)* — see CTC check below | Yes |

**Fix confirmed (Finding 1 from `Census Output 1`):** item 1.3 now carries `Mandatory: No` in the CSV, per `KYC Orchestrator.md` §4's 22-Jul correction note ("item 1.3 is `Mandatory: No` — overrides the raw workbook's `Yes`, since its own text is '(where applicable)'"). It still shows `Missing` (no document was provided, and none should exist — ACRA Bizfile states "Former Name(s): None") — but it **no longer counts as an open mandatory gap**. Only **2.3** remains a genuine mandatory Wave 1 gap this round, down from two.

#### Node 2 — Baseline Identity Extraction (materially changed — this is where most fixes land)

| Property | Value | Confidence | Source | Mandatory |
| :--- | :--- | :--- | :--- | :--- |
| Third Party Legal Structure | Entity | High | ACRA Bizfile — "Private Company Limited by Shares" | Yes |
| MASKYC Customer Type | **Private Company** | Medium | ACRA Bizfile — SSIC 66301 "Fund Management"; Certificate of Incorporation — "Private Company Limited by Shares" | Yes |
| MASKYC Fund or Listed Vehicle | **None — Silvercrest is a fund manager, not itself a fund or listed vehicle** (name doesn't appear on the sourced 30-fund/5-listed-vehicle list, nor would it — it's the manager, not a managed vehicle) | High | ACRA Bizfile — Principal Activity | Yes |
| MASKYC Project or AssetCo | **None disclosed** — no project- or asset-company structure named in any Wave 1 document | High | *(absence across all 7 documents)* | Yes |
| Entity Third Party Legal Name | Silvercrest Asset Management Pte. Ltd. | High | Certificate of Incorporation; ACRA Bizfile | Yes |
| Entity Company Number | 202145678K | High | Certificate of Incorporation; ACRA Bizfile | No |
| Entity Registered Address | 1 Shenton Way, #19-03, SGX Centre 1, Singapore 068804 | High | ACRA Bizfile | No |
| Entity Registered Country | Singapore [SINGP] | High | ACRA Bizfile — resolved against the reused TPA country list | Yes |
| Entity Website | *(blank)* | — | Not stated | No |
| Entity ID Type | **Company Identification No.** | High | Inferred from ACRA Bizfile's UEN field — resolved against the sourced Entity ID Type list (22 Jul) | No |
| Entity ID Value | 202145678K | High | ACRA Bizfile | No |
| *Person fields (Legal Name, Business Address, Country of Residence, Year of Birth, Gender, ID Type/Value)* | **N/A — not applicable (Entity customer)** | — | — | N/A |

**Fixes confirmed against `Census Output 1`'s findings:**
- **Finding 3** (no documented Person/Entity carve-out): now an explicit rule in `KYC DocReviewer.md` §3 ("Person/Entity Field-Type Override... mark them `N/A — not applicable (Entity customer)`"). Applied as a stated rule this round, not an inference.
- **Finding 4, half-resolved** (`LIST_PENDING` double duty): `Entity Registered Country` and `Entity ID Type` are now cleanly resolved — no longer `LIST_PENDING` — since `Answer Lists.md` sources both. `MASKYC Customer Type` is **still not a clean `LIST_PENDING` case**, but for the reason `KYC DocReviewer.md`'s own test now correctly distinguishes: the picklist itself is sourced (8 categories), but *which* category "Fund Management" maps to is genuinely uncertain from the documents on hand — no document states whether Silvercrest holds a Capital Markets Services (CMS) licence, which would make **"Regulated Financial Institution"** the correct category instead of "Private Company." Per the field-class rule, this is an ordinary confidence problem, not a picklist gap — resolved here at **Medium** confidence with the ambiguity flagged, not silently guessed. **This ambiguity has a real downstream consequence — see CDD Typing Q2 below.**
- **New minor finding:** `MASKYC Fund or Listed Vehicle` and `MASKYC Project or AssetCo` are both `Mandatory: Yes` textbox/dropdown fields that don't structurally apply to an entity that is itself a manager rather than a fund/vehicle/project company. Resolved here by direct analogy to `TPA DocReviewer.md`'s already-settled Fields 21–24 pattern ("None disclosed" when nothing applies, not a carve-out) — but `KYC DocReviewer.md` doesn't state this pattern itself the way the TPA file does. Same shape of gap as the now-fixed Finding 3, just not yet written down for these two fields.

#### Node 3 — CTC Factual Check (unchanged — rule wasn't touched)
Item 2.6: certification text present, certifier stated (Evelyn Tan Su Min), dated within 6 months, signature present — but **self-certification check fails**: certifier name matches the document holder's own name. **Resolution: `Non-CTC`, High confidence.** *(Finding 2 from Output 1 — reconfirmed unchanged, as expected.)*

#### Output: `session:wave1_checklist_draft`
**Missing-Item Surfacing:** only **item 2.3** is now an open *mandatory* gap (1.3 downgraded to non-mandatory this round). Item 2.6 remains `Non-CTC`.

### KYC Orchestrator — Flow B, Steps 2–5

**Host Client Confirmation Gate (Wave 1):** `[SIMULATED — human-in-the-loop]` Requester reviews and confirms the draft as-is, gaps included. `session:wave1_confirmation_status = CONFIRMED`.

**RCTP Write-Back:** `[SIMULATED]` `kyc_open_case(confirmed_wave1_checklist)` → `case_id = KYC-SILVERCREST-001` → `session:staged_case_id = KYC-SILVERCREST-001`.

**Wave 1 Convergence Validation Gate:** `confirmed_wave1_checklist ≠ ∅` ✅, `wave1_confirmation_status = CONFIRMED` ✅, `staged_case_id ≠ ∅` ✅. **Met.**

**Advance to Flow C.**

---

## FLOW C — Screening-Gate Wait & CDD Typing *(first-ever exercise of this flow)*

### Node C1: Screening Gate Check
`screening_status_gate` starts `PENDING`. `[SIMULATED — human-in-the-loop]` R&C confirms, outside this system, that screening resolution occurred with **no PEP or sanctions hit** on any of the three Wave-1-identified individuals (Evelyn Tan Su Min as signatory; directors per the Register of Directors — see Wave 2 below for named UBO). `screening_status_gate → CLEARED`. No screening-derived recommendation-flag signal is passed to `KYC DocReviewer` this round (clean result) — **the Q5/Q11 recommended-answer-highlight mechanism remains untested by any Census run to date**, same caveat as the TPA suite's unresolved item 3.

### KYC DocReviewer — Flow B (CDD-Typing Questionnaire Drafting)

Drafts Q1–19 for human completion. No recommendation highlight (clean screening signal, per above).

### Host Client Confirmation Gate — CDD Typing

`[SIMULATED — human-in-the-loop]` Requester completes and confirms the questionnaire:

| Q# | Question (short) | Answer | Basis |
| :-- | :-- | :-- | :-- |
| 1 | Listed entity w/ disclosure regime | No | ACRA Bizfile — private company, not listed |
| 2 | MAS-regulated FI / FATF-consistent overseas equivalent | **No** | Requester-confirmed: no CMS licence or equivalent on file — resolves the Node 2 ambiguity above in the *conservative* direction (does **not** claim Simplified-eligibility on an unverified regulatory status) |
| 3 | SG Government Entity | No | ACRA Bizfile — private company |
| 4 | Pension/superannuation scheme | No | Nature of business is fund management services, not a benefit scheme |
| 5 | PEP exposure (directors/signatories/BOs) | No | Screening gate cleared, no hit |
| 6 | UBO is a PEP with majority control | No | Screening gate cleared, no hit |
| 7 | SOF originates from a PEP | No | No indication in any document |
| 8 | FATF grey/black-list jurisdiction | No | Singapore only, no cross-border exposure disclosed |
| 9 | Jurisdiction w/ poor AML/CFT measures | No | Singapore only |
| 10 | Jurisdiction w/ higher TF risk | No | Singapore only |
| 11 | Sanctioned (OFAC/EU/UN/UK) | No | Screening gate cleared, no hit |
| **12** | **Higher-risk business/sector per SG NRA** | **Yes** | Requester-supplied detail: external asset/fund management has been identified as a higher-ML-risk sector in Singapore's National Risk Assessment; Silvercrest's principal activity (SSIC 66301) falls squarely in it |
| 13 | Unusual/complex ownership structure | No | *(assessed on typing facts known so far; Wave 2's Register of Shareholders — see below — confirms a simple structure)* |
| 14 | Personal asset-holding vehicle | No | Fund manager, not a holding vehicle |
| 15 | Unusual circumstances of business relations | No | — |
| 16 | Nominee shareholders / bearer shares | No | — |
| 17 | Cash-intensive business | No | Fund management is not cash-intensive |
| 18 | Shell-company characteristics | No | Active registered office, active directors, executed client contracts on file |
| 19 | Cannot prove ongoing operation/business purpose | No | Constitution, ACRA Bizfile, and appointment documents jointly establish an operating entity |

`session:confirmed_cdd_typing` captured.

**`kyc_submit_cdd_typing`:** `[SIMULATED]` server-side rule applied — No to all of Q1–4 (not Simplified-eligible), **Yes to Q12** (Enhanced-triggering, since "Yes to any of Q5–19 → Enhanced"). → **`resolved_cdd_tier = Enhanced`**.

**CDD Typing Convergence:** `screening_status_gate = CLEARED` ✅, `confirmed_cdd_typing ≠ ∅` ✅, `cdd_typing_confirmation_status = CONFIRMED` ✅, `resolved_cdd_tier ≠ ∅` ✅. **Met.**

**Routing:** tier = Enhanced → **advance to Flow D**, not Case Complete.

---

## FLOW D — Wave 2 Document Chase & Confirmation *(first-ever exercise of this flow)*

Enhanced tier → 22-property item set: Standard's 2.4, 2.7, Q3 (3.1–3.5), Q4 (4.1) **plus** Q5 (5.1–5.3).

**New characters introduced for this round** (not in `Census Output 1`'s Wave 1 fixtures, narrated per the fixture note above): **Marcus Wong Kai Loon**, sole director and 100% shareholder/UBO of Silvercrest (distinct from Evelyn Tan Su Min, the company secretary/authorised signatory named in the Wave 1 Board Resolution).

### KYC DocReviewer — Flow C (Wave 2 Checklist Matching)

| Item | Status | Confidence | Source Citation | Mandatory |
| :--- | :--- | :--- | :--- | :--- |
| 2.4 Gov ID (Connected Party — UBO) | Present | High | Marcus Wong Kai Loon's passport bio-data copy | Yes |
| 2.7 Proof of residential address (person acting on behalf) | Present | High | Utility bill, Evelyn Tan Su Min, dated within 3 months | Yes |
| 3.1 Register of Shareholders | Present | High | Register of Shareholders — Marcus Wong Kai Loon, 100% | Yes |
| 3.2 Ownership and control structure | Present | High | Same register — single natural-person shareholder, no intermediate layer | Yes |
| 3.3 AML/CFT undertaking + UBO declaration | **Missing** | — | Not provided this round | Yes — **MISSING** |
| 3.4 UBO gov ID docs | Present, **CTC pass** | High | Marcus Wong's passport, certified by a named notary (not the document holder) — certification text present, dated within 6mo, self-cert check **passes** | Yes |
| 3.5 UBO proof of residential address | **Missing** | — | Not provided this round | Yes — **MISSING** |
| 4.1 SOF/SOW declaration (entity-level) | Present | High | Executed SOF/SOW declaration form, dated | Yes |
| 5.1 Financial statements/mgmt accounts corroborating SOF/SOW | Present | High | Latest unaudited management accounts | Yes |
| 5.2 SOF/SOW declaration, per UBO | Present | High | Marcus Wong's executed SOF/SOW declaration | Yes |
| 5.3 Documentary proof of SOF/SOW, per UBO | **Missing** | — | No supporting bank statement/asset schedule provided | Yes — **MISSING** |

**Notable contrast with Wave 1:** item 3.4 is the first `Present, CTC-pass` result in any Census test — every prior CTC check (Wave 1's 2.6, and every TPA test) exercised only the "no stamp" or "self-cert fail" paths. This confirms the factual CTC check's pass path also resolves cleanly, not just its two failure modes.

### Host Client Confirmation Gate — Wave 2
`[SIMULATED — human-in-the-loop]` Requester confirms the draft as-is, three open gaps (3.3, 3.5, 5.3) included. `session:confirmed_wave2_checklist` captured.

**`kyc_submit_wave2_documents`:** `[SIMULATED]` batch-uploads only the 8 `Present` properties; the three `Missing` items send nothing this round.

**Wave 2 Convergence:** `confirmed_wave2_checklist ≠ ∅` ✅, `wave2_confirmation_status = CONFIRMED` ✅. **Met.**

**Case Complete** (Wave 1 Convergence ∧ CDD Typing Convergence ∧ Wave 2 Convergence, tier ≠ Simplified) — with open items carried forward as outstanding, per the same "confirmed ≠ complete" discipline established at Wave 1.

---

## KYC Orchestrator — Final Consolidated Case Report

### [FM&I KYC CASE REVIEW]
| | |
| :--- | :--- |
| Orchestration Ref | `ORCH-KYC-SILVERCREST-001` |
| Case Stage | `WAVE_2_CONFIRMED` |
| Resolved CDD Tier | `Enhanced` |

#### SECTION 1: CASE INFORMATION SUMMARY
| Field | Value |
| :--- | :--- |
| Legal/Customer Name | Silvercrest Asset Management Pte. Ltd. |
| Third Party Legal Structure | Entity |
| Customer Type | Private Company (Medium confidence — see Key Flags) |
| Registered Country | Singapore |

**Case Resolution:** `NEW_CASE` (Flow A outcome).

#### SECTION 2: DOCUMENTS REVIEWED
| Document | Wave | Item(s) Satisfied | Confidence |
| :--- | :--- | :--- | :--- |
| Certificate of Incorporation | 1 | 1.1 | High |
| ACRA Bizfile Extract | 1 | 1.2, baseline identity | High |
| Constitution (Excerpt) | 1 | 1.4 | High |
| Register of Directors | 1 | 2.1 | High |
| Board Resolution (Appointment) | 1 | 2.2 | High |
| Specimen Signature | 1 | 2.5 | Medium |
| Government ID (Passport, Evelyn Tan Su Min) | 1 | 2.6 — Non-CTC | High |
| Government ID (Passport, Marcus Wong Kai Loon) | 2 | 2.4 | High |
| Utility Bill (Evelyn Tan Su Min) | 2 | 2.7 | High |
| Register of Shareholders | 2 | 3.1, 3.2 | High |
| UBO Passport (certified) | 2 | 3.4 — CTC pass | High |
| SOF/SOW Declaration (entity) | 2 | 4.1 | High |
| Management Accounts | 2 | 5.1 | High |
| SOF/SOW Declaration (UBO) | 2 | 5.2 | High |

#### SECTION 3: CDD TYPING SUMMARY
- **Screening Gate:** `CLEARED` (human-confirmed resolution outside this system, no hit).
- **Resolved Tier:** `Enhanced` — basis: No to all of Q1–4 (not Simplified-eligible); **Yes to Q12** (higher-risk sector per SG NRA — fund management), Enhanced-triggering.
- **Recommended-Answer Flags:** none arose — screening result was clean, so the Q5/Q11 highlight mechanism didn't fire this round.

#### SECTION 4: CHECKLIST LEDGER
*(All items as tabulated above across Wave 1 and Wave 2 — not restated a third time here, per this test file's own economy; a real Orchestrator output would inline all rows directly.)*

**Count reconciliation:** Wave 1 — 1 mandatory gap open (2.3); item 1.3 present-but-non-mandatory. Wave 2 — 3 mandatory gaps open (3.3, 3.5, 5.3), 8 items satisfied.

#### SECTION 5: KEY FLAGS (At a Glance)
- ⚠️ 2.3 Board resolution/POA to open account, subscribe, or transact — Missing, genuine Wave 1 gap.
- ⚠️ 2.6 Government ID (Evelyn Tan Su Min) — Non-CTC, self-certification.
- ⚠️ 3.3 AML/CFT undertaking + UBO declaration — Missing, Wave 2 gap.
- ⚠️ 3.5 UBO proof of residential address — Missing, Wave 2 gap.
- ⚠️ 5.3 Documentary proof of SOF/SOW (UBO) — Missing, Wave 2 gap (Enhanced-tier requirement).
- ℹ️ MASKYC Customer Type resolved to "Private Company" at Medium confidence, not High — no document confirms or rules out a CMS licence. CDD Typing Q2 was answered `No` on the conservative assumption that an unverified licence shouldn't be assumed; **if a CMS licence is later confirmed, this typing answer and possibly the resolved tier should be revisited.**
- ℹ️ Tier resolved `Enhanced` on a single trigger (Q12, higher-risk sector) — no PEP/sanctions/jurisdictional factor contributed. Worth the Requester double-checking Q12's sector classification is intended to apply this broadly, given it alone moves every future fund-manager customer of this Customer Type into Enhanced.

#### SECTION 6: RISK DOMAIN TIERING
| Domain | Status | Finding | Priority |
| :--- | :--- | :--- | :--- |
| Document Completeness | 🟠 | 4 of 19 total checklist items outstanding across both waves (2.3, 3.3, 3.5, 5.3) | HIGH |
| Certification Integrity | 🟠 | 1 Non-CTC (self-cert failure, 2.6); 1 CTC pass (3.4) confirming the pass path also works | HIGH |
| CDD Type Appropriateness | 🟡 | Tier resolution basis is clean (single unambiguous Q12 trigger), but rests on a Medium-confidence Customer Type classification — see Key Flags | MEDIUM |
| Baseline Identity Completeness | 🟢 | All baseline fields resolved (sourced picklists); only the two structurally-inapplicable fields (Fund/Listed Vehicle, Project/AssetCo) needed inference-by-analogy rather than a stated rule | LOW |

**Overall Risk Tier: `HIGH`** — driven by the Enhanced CDD tier, the unresolved self-certification failure, and three open Wave 2 mandatory gaps (one of which — 5.3 — is itself an Enhanced-tier-specific SOF/SOW corroboration requirement).

#### SECTION 7: DECISION & CONDITIONS FOR FULL APPROVAL
**Decision: `CONDITIONAL — Wave 1 & Wave 2 items outstanding`**
| # | Condition | Owner | Deadline |
| :-- | :-- | :-- | :-- |
| C1 | Provide Board resolution/POA (2.3) | Requester | 5 business days |
| C2 | Resolve 2.6's self-certification failure — re-certify by an eligible third party | Requester | 5 business days |
| C3 | Provide AML/CFT undertaking + UBO declaration (3.3) and UBO proof of address (3.5) | Requester | 10 business days |
| C4 | Provide documentary proof of UBO SOF/SOW (5.3) — bank statement or equivalent asset schedule | Requester | 10 business days |
| C5 | Confirm whether Silvercrest holds a CMS licence; revisit Customer Type / CDD Typing Q2 if so | Compliance Business Partner | 5 business days |

#### SECTION 8: ESCALATION PATH & NEXT REVIEW
**Escalation Path:** Any later-surfaced PEP/sanctions match → escalate to Senior Compliance Officer; record reclassified `BLOCKED`. Persistent non-response on C1–C4 beyond deadline → escalate to `KYC Custodian`'s staleness sweep (Wave 2, `Enhanced` tier stalled → auto-classified `HIGH` per `KYC Custodian.md` §3.2).
**Next Review Date:** 12 months post-onboarding (Enhanced-tier standard cycle), contingent on C1–C5 closing first.

---

## What this round found

1. **All 5 findings from `Census Output 1` were checked against the current files — 3 fully fixed, 1 half-fixed, 1 unaffected because it was already correct:**
   - Finding 1 (item 1.3's "(where applicable)" conflict) — **fixed.** `Mandatory: No` now overrides the workbook default; the false-gap problem is gone.
   - Finding 2 (Non-CTC path) — **unaffected, reconfirmed working** (no rule here changed).
   - Finding 3 (no Person/Entity carve-out rule) — **fixed.** Now an explicit, stated rule.
   - Finding 4 (`LIST_PENDING` double duty) — **half-fixed.** Country and ID Type are now cleanly sourced. Customer Type is *correctly* still not `LIST_PENDING` (the rule's own test — "would confirming the picklist alone resolve this?" — correctly says no here), but this round surfaced *why* that residual ambiguity actually matters: it feeds directly into CDD Typing Q2, and a wrong guess there could misroute Simplified/Enhanced eligibility. Worth a line in `KYC DocReviewer.md` calling out that a Medium-confidence Customer Type should be flagged forward into the CDD-typing step specifically, not just left as a Wave 1 footnote.
   - Finding 5 (confirmable-with-gaps rule underspecified) — **fixed.** Now written explicitly into `KYC Orchestrator - Flows.md` Flow B Step 2, dated 22 Jul 2026.

2. **Flow C and Flow D both work as specified on their first-ever exercise** — no structural break in the screening-gate halt, the tier-resolution handoff (agent drafts, server resolves), the Enhanced-tier item-set expansion, or the three-stage convergence formula. This is the single most important finding: the previously **completely untested two-thirds of the pipeline** is now validated at the same level of confidence as Wave 1 already was.

3. **New minor finding — `MASKYC Fund or Listed Vehicle` / `MASKYC Project or AssetCo`** don't structurally apply to a fund-manager entity (as opposed to a fund/vehicle/project company itself), the same shape of gap Finding 3 used to describe for Person/Entity fields — just not yet written down for these two. Low cost to fix: one line mirroring the already-fixed Person/Entity rule, or explicit confirmation (as was done for TPA's Fields 21–24) that "None" is the correct, expected answer and no rule change is needed.

4. **New finding — Q5/Q11's recommended-answer-flag mechanism remains completely untested.** This round deliberately drove Enhanced via Q12 instead, precisely to test a *different* Enhanced-triggering path than PEP/sanctions — but that means the one screening-derived-content exception the whole system carries (`KYC Orchestrator - Flows.md` Flow C's "only screening-derived content that ever reaches the user") still has zero test coverage. Recommend a dedicated future round with a `[SIMULATED]` PEP or sanctions signal specifically to exercise this path.

5. **Open items not addressed this round, carried forward:** no Census test has yet exercised a `Simplified`-tier case (would skip Flow D entirely — untested), a reopened/resumed case at a mid-flow gate (`app:inflight_kyc_drafts` resume logic — untested), or `KYC Custodian`'s sweep against a real stalled-case scenario (mirrors the same gap noted for TPA's `Custodian`, and this round's own Section 8 escalation reference to it is itself unverified against the actual agent).
