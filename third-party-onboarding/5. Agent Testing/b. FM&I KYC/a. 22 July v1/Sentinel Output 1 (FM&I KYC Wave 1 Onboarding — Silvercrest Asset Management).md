# Sentinel Test Run 1 — FM&I KYC, Wave 1 Onboarding (Flow A → Flow B)

**First test run against the FM&I KYC agent set** (`Agents/KYC Orchestrator.md`, `Agents/KYC DocReviewer.md`, and their `Workflows/*.md` companions) — no prior fixtures or Sentinel runs existed for this process before this one. Simulated end-to-end by Claude against the current `.md` instruction files, following the same simulation convention as the TPA `Sentinel Output` tests (`5. Testing/b. Fictional Test Fixtures/`).

**What "run" means here:** there is no deployed FM&I KYC agent runtime to execute against — these are prompt specifications, not running code. This test has me (Claude) *act as* `Doc Analyst`, then `KYC DocReviewer`, then `KYC Orchestrator`, applying each one's documented rules in sequence against real fixture PDFs, exactly as a human would trace through the spec by hand. Two things are `[SIMULATED]` because no real system exists behind them: the Host Client human-confirmation step, and the `kyc_open_case` MCP write-back.

**Scope:** Flow A (Pre-Flight Case Resolution) → Flow B (Wave 1 Intake & Confirmation) only — this is the "onboarding" entry point for a fresh FM&I KYC case. CDD typing (Flow C) and Wave 2 (Flow D) are out of scope for this run.

**Fixtures:** 7 fictional PDFs generated for this test, in `Source Docs/` (all headed "FICTIONAL DOCUMENT — GENERATED FOR AGENT WORKFLOW TESTING ONLY"). Deliberately designed to exercise every Wave 1 status path in one pass: a genuine mandatory gap, an ambiguous "where applicable" gap, a lower-quality scan, and a self-certification failure — none of which any prior TPA test happened to cover either, since TPA has no CTC/certification concept at all.

---

## SCENARIO — Silvercrest Asset Management Pte. Ltd. (Entity, fresh case)

### 1. Doc Analyst (simulated)
7 documents read: Certificate of Incorporation, ACRA Bizfile Extract, Constitution (excerpt), Register of Directors, Board Resolution (appointment), Specimen Signature, Government ID (passport bio-data page, bearing a certification stamp). All internally consistent — company name, UEN `202145678K`, and Evelyn Tan Su Min's identity appear identically across every document that names them.

### 2. KYC DocReviewer — Flow A (Wave 1 Checklist Matching & Baseline Extraction)

**Item set handed to me by `KYC Orchestrator`** (Wave 1, all tiers — 9 checklist items per `KYC Orchestrator.md` §4): 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.5, 2.6.

#### Node 1 — Checklist-Item Matching

| Item | Status | Confidence | Source Citation | Mandatory |
| :--- | :--- | :--- | :--- | :--- |
| 1.1 Certificate of Incorporation | Present | High | *Certificate of Incorporation*, p.1 | Yes |
| 1.2 Certificate of Incumbency / business registration extract | Present | High | *ACRA Bizfile Extract*, p.1 — "Business Profile Extract" satisfies "or its equivalent" | Yes |
| 1.3 Certificate of Change of Name (where applicable) | **Missing** | — | No document provided | Yes — **MISSING** |
| 1.4 Constitution / M&AA / LPA / Trust Deed | Present | High | *Constitution (Excerpt)*, Cl. 1–4 | Yes |
| 2.1 Register of Directors | Present | High | *Register of Directors*, p.1 | Yes |
| 2.2 Board resolution appointing person to act on behalf | Present | High | *Board Resolution (Appointment)*, Res. 1, 18 Jun 2026 | Yes |
| 2.3 Board resolution/POA authorising Customer to open account, subscribe, or transact | **Missing** | — | No document provided | Yes — **MISSING** |
| 2.5 Specimen signature (person acting on behalf) | Present | Medium | *Specimen Signature* — document itself states "scanned at low resolution — signature stroke detail partially legible" | Yes |
| 2.6 Government-issued ID (person acting on behalf) | **Non-CTC** | High | *Government ID (Passport Bio-data)* — see Node 3 below | Yes |

#### Node 2 — Baseline Identity Extraction

| Property | Value | Confidence | Source | Mandatory |
| :--- | :--- | :--- | :--- | :--- |
| Third Party Legal Structure | Entity | High | ACRA Bizfile — "Private Company Limited by Shares" | Yes |
| MASKYC Customer Type | *(raw value)* "Fund Management" (SSIC 66301) | Medium | ACRA Bizfile — "Principal Activity" | Yes — **`LIST_PENDING`**, no sourced picklist to map "Fund Management" onto a confirmed Customer Type category |
| MASKYC Fund or Listed Vehicle | *(blank)* | — | Not stated in any Wave 1 document | Yes — **needs Requester input**, not a document-extractable fact at this stage |
| MASKYC Project or AssetCo | *(blank)* | — | Not stated | Yes — **needs Requester input** |
| Entity Third Party Legal Name | Silvercrest Asset Management Pte. Ltd. | High | Certificate of Incorporation; ACRA Bizfile | Yes |
| Entity Company Number | 202145678K | High | Certificate of Incorporation; ACRA Bizfile | No |
| Entity Registered Address | 1 Shenton Way, #19-03, SGX Centre 1, Singapore 068804 | High | ACRA Bizfile | No |
| Entity Registered Country | *(raw value)* Singapore | High | ACRA Bizfile | Yes — **`LIST_PENDING`**, no sourced picklist (per `Baseline Identity Properties.csv`) |
| Entity Website | *(blank)* | — | Not stated in any document | No |
| Entity ID Type | *(raw value)* "UEN" | Medium | Inferred from ACRA Bizfile field label, not an explicit "ID Type" declaration | No — **`LIST_PENDING`** |
| Entity ID Value | 202145678K | High | ACRA Bizfile | No |
| *Person fields (Legal Name, Business Address, Country of Residence, Year of Birth, Gender, ID Type/Value)* | N/A — Entity, not Person | — | — | N/A |

*(Person-field exclusion above is an inference, not an explicit rule in `KYC DocReviewer.md` — see Finding 3 below.)*

#### Node 3 — CTC Factual Check
Only one item bears a certification mark: **2.6**, the passport bio-data copy. The document itself carries a "CERTIFIED TRUE COPY OF THE ORIGINAL" stamp with:
- Certification text present ✅
- Certifier name stated: **Evelyn Tan Su Min** ✅
- Date stated: 19 June 2026 — within 6 months of this test's submission date ✅
- Signature present ✅
- **Self-certification check: FAILS.** The certifier name ("Evelyn Tan Su Min") is identical to the document holder's own name (the passport is Evelyn Tan Su Min's own ID). Self-certification is always invalid, per `KYC DocReviewer.md` §3's Confidence rule and the underlying MAS CTC standard.

**Resolution: item 2.6 → `Non-CTC`, High confidence** (the self-cert failure is objectively determinable from the two names matching — not an ambiguous read). No handoff to `CTC Reviewer` — that agent is KIV/deferred to v2. This item is simply left for an R&C reviewer to assess manually per current build.

#### Output: `session:wave1_checklist_draft`
**Missing-Item Surfacing** (per `KYC DocReviewer.md` §3 — no separate gap-analysis pass; a `Missing` status against a `Mandatory: Yes` item is itself the flag): **items 1.3 and 2.3** are the two open mandatory gaps in this draft. Item 2.6 is `Non-CTC`, not `Missing` — a distinct status, correctly not conflated with an outright gap.

**PROVISIONAL — held in session state only, nothing written to RCTP.**

---

### 3. KYC Orchestrator — Flow A then Flow B

**Flow A (Pre-Flight Case Resolution):** `kyc_find_case("Silvercrest Asset Management Pte. Ltd.")` against `app:kyc_case_registry` → `[SIMULATED]` no candidate match (UEN `202145678K` not found in the registry). `session:case_resolution_result = NEW_CASE`. Routes into Flow B fresh — no `session:historical_case_profile` seeded.

**Flow B, Step 1 (Ingestion & Checklist Matching):** Delegated to Doc Analyst → `KYC DocReviewer` as above. `session:wave1_checklist_draft` received.

**Flow B, Step 2 — HOST CLIENT CONFIRMATION GATE (Wave 1):** `[SIMULATED — human-in-the-loop]` Presents the 9-item Wave 1 draft above to the Requester in the canvas. **Assumed for this test:** the Requester reviews and confirms the draft as-is (including its two open gaps and the Non-CTC item — confirming a draft with gaps is valid; it does not require the gaps to be resolved first, only that the human has reviewed what's there). `session:wave1_confirmation_status = CONFIRMED`; `session:confirmed_wave1_checklist` set to the table above, unchanged.

**Flow B, Step 3 (RCTP Write-Back):** `[SIMULATED]` `kyc_open_case(confirmed_wave1_checklist)` → returns `case_id = KYC-SILVERCREST-001` → `session:staged_case_id = KYC-SILVERCREST-001`.

**Flow B, Step 4 (Wave 1 Convergence Validation Gate):** Formula check — `confirmed_wave1_checklist ≠ ∅` ✅, `wave1_confirmation_status = CONFIRMED` ✅, `staged_case_id ≠ ∅` ✅. **Wave 1 Convergence: met.**

**Flow B, Step 5:** Case advances to Flow C's entry state — **"Waiting on screening resolution"** — per Flow B's own terminal diagram node. Not run further; out of scope for this test.

---

### [FM&I KYC CASE REVIEW]
*   **Orchestration Ref:** `ORCH-KYC-SILVERCREST-001`
*   **Case Stage:** `WAITING_ON_SCREENING_RESOLUTION` (Wave 1 confirmed and staged; CDD typing not yet started)
*   **Resolved CDD Tier:** *(not yet known — set in Flow C)*

#### SECTION 1: CASE INFORMATION SUMMARY
| Field | Value |
| :--- | :--- |
| Legal/Customer Name | Silvercrest Asset Management Pte. Ltd. |
| Third Party Legal Structure | Entity |
| Customer Type | Fund Management (raw value — `LIST_PENDING`) |
| Registered Country | Singapore |

*   **Case Resolution:** `NEW_CASE` (Flow A outcome).

#### SECTION 2: DOCUMENTS REVIEWED
| Document Name | Wave | Checklist Item(s) Satisfied | Confidence |
| :--- | :--- | :--- | :--- |
| Certificate of Incorporation | 1 | 1.1 | High |
| ACRA Bizfile Extract | 1 | 1.2, baseline identity | High |
| Constitution (Excerpt) | 1 | 1.4 | High |
| Register of Directors | 1 | 2.1 | High |
| Board Resolution (Appointment) | 1 | 2.2 | High |
| Specimen Signature | 1 | 2.5 | Medium |
| Government ID (Passport Bio-data) | 1 | 2.6 — Non-CTC | High |

#### SECTION 4: CHECKLIST LEDGER
*(Reproduces Node 1's table above in full — same 9 rows, not restated a second time here per this test file's own economy; a real Orchestrator output would still inline all 9 rows directly.)*

#### SECTION 5: KEY FLAGS (At a Glance)
*   ⚠️ 1.3 Certificate of Change of Name — Missing, and possibly not genuinely applicable (ACRA Bizfile shows "Former Name(s): None") — Section 4 / Finding 1 below.
*   ⚠️ 2.3 Board resolution/POA to open account, subscribe, or transact — Missing, no ambiguity, a real gap — Section 4.
*   ⚠️ 2.6 Government ID — Non-CTC, self-certification (certifier is the document holder) — Section 4.
*   ⚠️ MASKYC Customer Type, MASKYC Fund or Listed Vehicle, MASKYC Project or AssetCo — all `LIST_PENDING`/blank, need Requester input or picklist confirmation before Wave 1 can be treated as fully resolved.

#### SECTION 6: RISK DOMAIN TIERING
| Domain | Status | Finding | Priority |
| :--- | :--- | :--- | :--- |
| Document Completeness | 🟠 | 2 of 9 Wave 1 items outstanding (1.3, 2.3) | HIGH |
| Certification Integrity | 🟠 | 1 item Non-CTC (2.6, self-certification) — factual gap only, no eligibility characterization in this build (KIV v2) | HIGH |
| Baseline Identity Completeness | 🟡 | 3 dropdown fields blank/`LIST_PENDING`, pending Requester input or picklist sourcing | MEDIUM |

**Overall Risk Tier:** `HIGH` — driven by two open mandatory document gaps and a Non-CTC identity document at the very start of the case.

---

## What this round found

1. **Item 1.3's "(where applicable)" phrasing conflicts with its `Mandatory: Yes` value, and no rule resolves the conflict.** Silvercrest genuinely never changed its name (the ACRA Bizfile states "Former Name(s): None"), so a Certificate of Change of Name cannot exist — yet the checklist question text says "(where applicable)" while the CSV's `Mandatory` column says `Yes` unconditionally, and neither `KYC Orchestrator.md` nor `KYC DocReviewer.md` gives the agent a rule for treating "never applicable" as anything other than `Missing`. As specified, this test correctly produced a false-looking "gap" that a Requester would have to manually recognize as a non-issue every time a company has never changed its name — which, for most customers, is the common case, not the exception. **Worth a decision:** either add a `Not Applicable` status (distinct from `Missing`) for items whose own question text is conditional, with a rule for when an agent may infer inapplicability from other evidence already in hand (e.g. the Bizfile's own "Former Name(s): None" field) — or explicitly confirm the current behavior (always `Missing`, human sorts it out) is intended.

2. **Item 2.6's Non-CTC path worked exactly as specified** — this is the first real exercise of the CTC factual-completeness/self-certification check since `CTC Reviewer` was scoped out. `KYC DocReviewer` correctly resolved straight to `Non-CTC` with no handoff attempt, confirming the deferral is clean and doesn't leave a dangling reference anyone would try to follow.

3. **No Person/Entity field-type carve-out is documented for FM&I KYC**, unlike `TPA DocReviewer.md`'s explicit rule (Person-scoped fields marked `N/A` when the TPA is an Entity, and vice versa). This test inferred the same behavior for the Person baseline-identity fields (Legal Name, Business Address, Country of Residence, Year of Birth, Gender, ID Type/Value) by analogy, since populating them for an Entity customer would be nonsensical — but `KYC DocReviewer.md` never states this explicitly. Worth adding one line mirroring TPA's rule, so this isn't left to inference every time.

4. **`LIST_PENDING` is doing double duty** in this run — once for a genuinely blank picklist (Entity Registered Country, where "Singapore" is known but has nowhere confirmed to map to) and once where the underlying fact itself is uncertain (MASKYC Customer Type, where "Fund Management" is a document-derived guess at what the actual customer-type category should be, not a clean extraction). The spec's `LIST_PENDING` definition ("no predetermined answer list sourced... extract and hold the raw underlying value") covers the first case cleanly but is a slightly awkward fit for the second — worth confirming whether "closest inferred term" is the right thing to hold for `LIST_PENDING` fields, or whether an ambiguous source should instead resolve to a plain blank with "needs confirmation," same as a `Low`-confidence checklist item.

5. **The Confirmation Gate's behavior when the draft contains gaps is workable but underspecified.** This test assumed the Requester can confirm a Wave 1 draft that still has `Missing`/`Non-CTC` items in it (the gaps just carry forward as open items on the staged case). That reading is consistent with `kyc_open_case`'s job ("creates the staged case record + Wave 1 checklist status") but isn't stated as an explicit rule anywhere — worth one line confirming a draft doesn't need to be gap-free to pass the gate, only reviewed.
