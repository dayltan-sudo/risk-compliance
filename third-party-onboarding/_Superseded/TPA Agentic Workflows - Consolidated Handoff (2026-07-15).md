# Handoff: TPA Agentic Workflow Design (Consolidated)

**Date:** 2026-07-15 (originally consolidated) · refreshed same day after a full gap-review and fix pass
**Project root:** `/Users/dayltan/Documents/Claude Code/third-party-onboarding/1. Third Party Onboarding/`
**Purpose of this refresh:** this document originally consolidated two concurrent Claude Code sessions' handoffs. Since then, a further session ran a systematic gap review (PRD vs. the four agent files, cross-checked against a real questionnaire spreadsheet) and fixed what it found. **This version supersedes the original — read this one, not an earlier copy.** It's written for whoever picks this up next, including **a colleague about to test the agentic workflow files' data-extraction behaviour**.

---

## What this project is

A Third-Party Agent (TPA) onboarding/renewal/compliance (AML/KYC/TPRM) system at Keppel, built as a set of LLM agent system-instruction ("persona") markdown files that will eventually run behind an MCP server exposing task-level tools to a host chatbot client. The design philosophy throughout is **deterministic, auditable execution** — flows are explicit numbered nodes, not open-ended agent judgment — because this is a regulated compliance domain.

The four agent files sit behind a separate host client (chatbot) product, specified in a PRD at:

`1. UI UX/Onboarding Host Client - Product Requirements Document.md`

That PRD (**now Draft v4**) is the **authoritative source for product behavior** — confidence indicators (§2.2), the "review-not-create" principle (§2.1: "it suggests; the human commits"), no-fabrication rules, human confirmation gates, screening visibility rules, and the task-tool trigger descriptions (§7.1–§7.12) that the agent files' "Prompt N" references are meant to align with. Read it directly rather than relying on summaries below.

## If you're here to test data extraction (DocReviewer / Screener)

**You don't need the Orchestrator, MCP, or the host client to test extraction.** `TPA DocReviewer.md` (the full pipeline) and `Screener.md`'s **Flow A only** (layered UBO extraction, triggered on a `COMPLEX` ownership classification) are self-contained — neither calls MCP, neither depends on live RCTP or Orchestrator session state beyond an optional `historical_profile` for renewal-delta testing. Screener's **Flow B** (live watchlist screening) is a different matter — see the KIV banner at the top of that file; it's not ready to build or test as specified, and testing extraction doesn't require it.

What to read, in order:
1. `3. Agentic Workflows/TPA DocReviewer.md` — the persona + extraction rules (§4) and the field contract it points to (§6, now a separate CSV — see below).
2. `3. Agentic Workflows/TPA Reference - In-Scope Extraction Properties.csv` — the actual 24-field extraction contract (Type, Field Class, Mandatory, source citation expectations). This is what DocReviewer's Node 1/Node 3 extraction is scoped against.
3. `3. Agentic Workflows/TPA Reference - Predetermined Answer Lists.csv` — the answer-list options for the four grouped/multi-select fields, pointed to from row 2's CSV. Only needed if your test documents touch one of those four fields (e.g. an industry/services classification or a red-flag questionnaire).
4. `3. Agentic Workflows/TPA Reference - Countries Territories 2025.md` — the 252-entry picklist for the two country fields, pointed to directly from row 2's CSV.
5. `3. Agentic Workflows/Screener.md`, **Flow A section only** (Prompt 3: `extract_directors_shareholders`) — needed only if your test documents include a `COMPLEX` ownership case (a shareholder that's itself a registered company).

**Test document drop location, already created:** `5. Test Documents/SIMPLE Case/` and `5. Test Documents/COMPLEX Case/` (both currently empty, awaiting real/redacted sample docs). SIMPLE needs a base entity's registration extract + register of directors/shareholders + a DDQ/risk-assessment source + a contract. COMPLEX needs the same plus a corporate shareholder's own registration document, to exercise DocReviewer's Ownership Complexity Gate and the handoff to Screener Flow A.

**How to evaluate output:** for every field, check confidence + source citation are both present (or the field is correctly left blank), that `Judgment` fields (§6 CSV: `Notable Org specific RF`, `Notable Txn specific RF`, `Ultimate Beneficial Owners`) are never inferred at `Low` confidence, and that the `SIMPLE`/`COMPLEX` classification and (for COMPLEX) the handoff to Screener are correct per DocReviewer §4's handoff rules.

## ⚠️ Concurrent sessions — historical context, now resolved

*(Kept for context on why the files look the way they do; no longer an active risk — a subsequent session re-read all four files fresh and did a full consistency pass, per the action this section originally called for.)*

Two Claude Code sessions were very likely running concurrently against these files at some point before this document was first written — one found the working folder's write bit stripped and got approval to `chmod u+w` it; the other found its own edits "extended" by content it hadn't authored (Flow D, Flow E, the confidence/citation/Field-Class system). These are almost certainly the same two events seen from opposite sides. If you're now hitting fresh signs of concurrent editing (stale-file warnings, unexplained content), stop and ask the user before proceeding, the same way the original sessions should have.

## The four agent files (current state)

| File | Role | Current state |
|---|---|---|
| `3. Agentic Workflows/TPA Orchestrator.md` | Master coordinator; user-facing; **only agent authorized to call MCP/RCTP, ever**. Owns identity resolution, sub-agent sequencing, the human confirmation gate, and RCTP write-back. | **Flows A–G** (grew from A–E this round): A Pre-Flight Identity Resolution, B Onboarding/Renewal Coordination, C Exception & Gap Reporting (now dual-mode — in-session scan *or* standalone `tpa_exception_report` call on a staged record), D Scheduled Registry Refresh, E Review Pack Generation, **F Record Status Lookup (new — cache-first, fills a gap `tpa_record_status` previously had no Flow for)**, **G Due-for-Renewal Portfolio View (new — user-triggered, BU-scoped, distinct from Flow D's background refresh and from Custodian's own scheduled sweep)**. §6 MCP Task-Tool Bindings table now lists **7 tools** (was 8 — see Register section below). New §7 Failure & Denial Handling section maps PRD §7.10's unhappy paths (BU/role denial, RCTP-unavailable, etc.) to Orchestrator behaviour, since it's the only agent that ever sees an MCP response. New state keys: `app:user_bu_registry` (user→Business-Unit cache, backing Flow G's BU scoping — **source not yet decided: maintained list vs. Active Directory/Entra, flagged as KIV in the flow**) and `app:inflight_drafts` (persisted, retention-windowed draft store so a multi-session onboarding survives across sittings, per PRD §10 resumability). |
| `3. Agentic Workflows/TPA DocReviewer.md` | Default first-pass parser of *all* raw documents (including base/direct shareholders and directors); document ingestion/extraction ("Maker"); complexity triage. | **§6's field table is now a separate CSV** (`TPA Reference - In-Scope Extraction Properties.csv`, same folder) — the inline markdown table was dropped in favour of it after a data-corruption near-miss (a bulk edit briefly mangled rows containing embedded `\|` pipes; caught and fixed, but confirmed the table didn't belong in markdown). The CSV now has two extra columns beyond the original spec: **`Mandatory`** (populated for all 24 fields from `DJ RCTP Consolidated Questionnaire Questions.xlsx`'s `R'd` column — see below) and **`High-Risk to Edit`** (currently all `TBD`, pending a separate confirmed list). Node 5 (Gap Analysis) now reads the CSV's `Mandatory` column directly instead of the previously-undefined `user:ingestion_rules` state key (that key's remaining scope — document-requirements-by-country, matching thresholds — is unchanged but explicitly marked non-blocking until defined). |
| `3. Agentic Workflows/Screener.md` | KYC/sanctions screening; layered UBO resolution — only invoked on handoff from DocReviewer when there's evidence of a multi-layer ownership structure. | **Flow A (extraction) is ready to test; Flow B (screening) carries two separate KIV banners now**, not one: (1) the original API-availability KIV — no confirmed Dow Jones API to read back hit/match-score data; (2) a **new evidence-vs-verdict KIV** — Flow B's output currently renders verdicts (`RESOLVED FALSE POSITIVE`, `CLEARED`), which conflicts with PRD §2.1 ("evidence, not verdicts") and §7.9 (adjudication happens in RCTP, by a human). Both are open; do not build Flow B against the current spec. |
| `3. Agentic Workflows/Custodian.md` | Independent, schedule-triggered portfolio-wide remediation/forecast sweep. Strictly cache-only — never calls MCP itself. | Already correctly consumes the `CACHE_STALE` flag Orchestrator's Flow D writes (Node 1 + protocol step 4) — **the original handoff's open item claiming this was missing was itself stale by the time it was checked; already done.** One line removed: the output archetype previously asserted "failure to renew... will trigger automated system termination," which nothing in the architecture can actually do (Custodian is cache-only, human-in-the-loop everywhere) — removed as an unexplained, contradictory claim. |

A fifth agent, **"Doc Analyst"**, is referenced throughout as the horizontal raw-text/OCR extraction tool that feeds TPA DocReviewer. **It is a separate, pre-existing default sub-agent with its own instructions elsewhere — do not create or edit a Doc Analyst file as part of this set.** The user was explicit about this. For manual testing without a live Doc Analyst instance, feed sample documents directly to whatever is playing the DocReviewer persona and let it do that step itself — a reasonable stand-in for a one-off test.

## Other key files

| File | What it is |
| :--- | :--- |
| `3. Agentic Workflows/TPA Reference - In-Scope Extraction Properties.csv` | **New this round.** The field-level extraction contract for DocReviewer §6 — 24 rows × 9 columns (`Field Name`, `Type`, `Source`, `What to Extract`, `Predetermined Answer List`, `Selection Rule`, `Field Class`, `Mandatory`, `High-Risk to Edit`). Source of truth for `Mandatory` is `DJ RCTP Consolidated Questionnaire Questions.xlsx` (see below); `High-Risk to Edit` is still `TBD` throughout. |
| `DJ RCTP Consolidated Questionnaire Questions.xlsx` (project root, one level up from `1. Third Party Onboarding/`) | **New reference this round**, not previously in this handoff. Single tab `All Questions`, columns include `Property` (col G) and `R'd` (col E, the required/mandatory flag). Used to populate the CSV's `Mandatory` column: `Yes`/`No` per property, cross-checked against both the Onboarding and Risk Assessment tabs where a property appears on both. One exception: `Shareholders` has no discrete `Property` row in this workbook (no standalone shareholder question — captured via the register/Bizfile upload instead), so it was set `No` by explicit decision rather than derived. |
| `3. Agentic Workflows/TPA Reference - Countries Territories 2025.md` | Standalone 252-entry country/territory picklist generated from the Functional Spec's `CountriesTerritories 2025` sheet, so DocReviewer doesn't need to open the xlsx workbook at runtime. **Now referenced directly** from the `Predetermined Answer List` column of `TPA Reference - In-Scope Extraction Properties.csv` — DocReviewer §6.5, which used to be the intermediate pointer, was removed (see below). |
| `3. Agentic Workflows/TPA Reference - Predetermined Answer Lists.csv` | **New this round.** The four grouped/multi-item predetermined answer lists (`TPA Services provided or Industry`, `TPA Interaction with Third parties`, `Notable Org specific RF`, `Notable Txn specific RF`) that used to live inline in DocReviewer.md as §6.1–§6.4. 39 rows, keyed by `List ID`; the `TPA Interaction with Third parties` list carries a `Group` column (Government / Non-Government) since that field requires one selection per group. Referenced directly from the properties CSV's `Predetermined Answer List` column. |
| `4. Properties/TPA Property Mapping v0.2.numbers` | The property→field mapping spreadsheet (real Apple Numbers file, not xlsx). Unchanged this round — see prior handoff content if you need the F/G/H/P column population history. |
| `4. Properties/1. TPA Functional Spec Standard v1.0 ok.xlsx` | Source-of-truth questionnaire spec (Onboarding, Risk Assessment, Name Screening, Doc Upload, TP Certification, TP Training sheets + `Reference Lists` + `CountriesTerritories 2025`). Read-only source for the above. Unchanged. |
| `2. MCP Set-up/TPA MCP Tool Register v2.xlsx`, tab **"Tools (task layer)"** | **Changed this round: now exactly 7 task tools** (was 8) — `tpa_handle_risk_change` was removed from scope (see PRD v4) and the remaining tools renumbered #1–#7: `tpa_find_third_party`, `tpa_onboard_from_documents`, `tpa_renew_from_documents`, `tpa_record_status`, `tpa_review_pack`, `tpa_exception_report`, `tpa_list_due_for_renewal`. The tab's overview subtitle (previously the stale "~13") was corrected to "7". The related `dj_register_risk_webhook` building block (tab "Building blocks (internal)") was also deleted, and its footnote reference cleaned up. A backup of the pre-edit workbook exists in the session scratchpad if you need to diff. Other tabs in this workbook were flagged by the user as possibly outdated — don't rely on them without asking. |
| `1. UI UX/Onboarding Host Client - Product Requirements Document.md` | Host client PRD — **now Draft v4** (was v3). See "What changed in the PRD (v4)" below. |
| `5. Test Documents/SIMPLE Case/`, `5. Test Documents/COMPLEX Case/` | **New this round.** Empty folders created to receive real/redacted sample documents for extraction testing — see "If you're here to test data extraction" above. |

The PRD's sibling-document dependencies are now **confirmed to exist** (this was an open item in the original handoff): `2. MCP Set-up/DJ RCTP MCP Server - Project Handover.md`, `TPA Agentic Workflow - Implementation Plan and Fix List.md`, `KYC Agentic Workflows - MAS and non-MAS - Plan and Fix List.md` (latter two in the project root, one level up).

## What changed in the PRD (v4)

- **§7.12 Portfolio remediation & renewal forecast (new)** — gives the Custodian agent's scheduled, risk-tiered remediation output a home in the PRD; it previously had no corresponding user-facing journey.
- **§7.8 Risk-change alert — removed from scope.** Origin was unclear and there was no confirmed need; `tpa_handle_risk_change` and its deferred Dow Jones webhook are gone (see Register above). The section number is kept as a tombstone so existing §7.9–§7.11 references don't break.
- **§7.7 Due-for-renewal — now explicitly BU-scoped**, backing Orchestrator's new Flow G.
- Mandatory-review field tagging now has a real source (DocReviewer §6 CSV) instead of being an unsourced assumption.

## What got done (this round, on top of the original consolidation)

### 1. Gap review: PRD vs. the four agent files
A systematic cross-check surfaced and fixed: `tpa_record_status` having no Flow (→ Flow F), interactive due-for-renewal having no user-triggered path (→ Flow G), Flow C being bound to `tpa_exception_report` but never calling it (→ fixed to call it for standalone/staged-record use), no MCP-boundary failure/denial handling anywhere (→ Orchestrator §7), Custodian's unexplained "automated termination" line (→ removed), Screener's verdict language conflicting with "evidence not verdicts" (→ flagged KIV), and resumability being asserted in the PRD with no state model behind it (→ `app:inflight_drafts`).

### 2. Mandatory-field tagging sourced and applied
Cross-referenced `DJ RCTP Consolidated Questionnaire Questions.xlsx` against DocReviewer's 24 in-scope properties; populated the CSV's `Mandatory` column field-by-field (16 `Yes`, 8 `No`, including `Shareholders` set `No` by explicit decision — no discrete questionnaire row to derive it from).

### 3. §6 property table split to CSV
Moved DocReviewer's 24-row, 9-column extraction contract out of the markdown persona file into `TPA Reference - In-Scope Extraction Properties.csv`, following the precedent already set by the countries/territories reference file. Triggered by a real near-miss: a bulk find/replace briefly corrupted three rows containing escaped `|` characters in their answer-list values (caught during verification, fixed, but confirmed markdown tables with embedded delimiters are the wrong format for this kind of config).

### 4. MCP Tool Register cleanup
Removed `tpa_handle_risk_change` (register + `dj_register_risk_webhook` building block), renumbered the remaining 7 tools, fixed the stale "~13 task tools" subtitle — closing an item the original handoff had flagged as merely cosmetic.

### 5. Predetermined answer lists split out of DocReviewer.md
The four grouped/multi-item answer lists that used to live inline as DocReviewer §6.1–§6.4 moved to a new `TPA Reference - Predetermined Answer Lists.csv` (39 rows, keyed by `List ID`); the country/territory list (formerly §6.5, itself already just a pointer to the countries file) is now referenced **directly** from the properties CSV instead of routing through DocReviewer.md. Same rationale as item 3 above — these are reference data, not persona instructions, and belong in CSV/reference files the properties CSV can point straight at. DocReviewer.md's §6 is now pure cross-cutting rules (confidence/citation, Field Class, Mandatory) with three external files it defers to for the actual lists.

### 6. Handoff document (this file) refreshed
To reflect all of the above and give a colleague testing extraction a clear "start here" path, separate from the still-in-flux Orchestrator/MCP/host-client side.

*(For the original consolidation's detailed history — agent renames, the dedup/identity-resolution redesign, the original confidence/citation/Field-Class system build, the Property Mapping v0.2 spreadsheet work, Numbers↔xlsx conversion gotchas — see git history on this file or ask; that content held up and wasn't re-litigated this round.)*

## ⚠️ Unresolved / flagged risk: Screener's screening capability

Unchanged in substance, now with a second dimension. Screener.md's Flow B (Prompt 10) assumes live hit/match-score retrieval from Dow Jones RCTP, but the PRD (§4, §7.9, §14.5) states **no confirmed API exists for this today** — original KIV banner, unresolved. **New:** independently of the API question, Flow B's current output renders verdicts (`RESOLVED FALSE POSITIVE`, `CLEARED`), which conflicts with the PRD's "evidence, not verdicts" principle — a second KIV, also unresolved. **Neither blocks testing DocReviewer/Screener Flow A extraction** — both are scoped to Flow B only.

## Open items / next steps

1. **Screener's screening/hit-resolution capability (Flow B, Prompt 10) is unresolved on two fronts** — API availability, and whether the agent may state a resolution at all vs. only present evidence. Do not build Flow B as currently specified.
2. **`app:user_bu_registry` source undecided** — maintained cached list vs. Active Directory/Entra group lookup. Needed before Flow G (due-for-renewal, BU-scoped) is build-ready; modelled as a cache so either source can populate it without changing the flow.
3. **`High-Risk to Edit` column is all `TBD`** in the extraction-properties CSV — needs a confirmed list (backs PRD §7.3's renewal-delta emphasis).
4. **Role/persona field-level gating beyond BU scoping is KIV** in Orchestrator §7 — BU scoping is implemented, broader Requester-vs-R&C field-level gating is not, pending R&C direction.
5. **Test documents pending** — `5. Test Documents/{SIMPLE,COMPLEX} Case/` are empty, waiting on real/redacted samples from the user before an extraction test can actually run.
6. Several PRD §10 assumptions remain open and untouched this round: panel-size persistence scope, file-upload constraints, platform surface (standalone vs. Teams-embedded), branding ownership, and the Requester-visible screening-panel remediation-controls question (reversed in v3, still flagged for reconfirmation with R&C).
7. Neither this round nor the original consolidation has done a **word-for-word** check that DocReviewer §6's confidence/citation/Field-Class language matches the Host Client Confirmation Gate's field-display wording in Orchestrator exactly — still just loosely verified.

## Suggested skills for the next session

- **`xlsx`** — for further edits to `TPA MCP Tool Register v2.xlsx`, `DJ RCTP Consolidated Questionnaire Questions.xlsx`, or `TPA Property Mapping v0.2` (via its Numbers↔xlsx conversion path).
- **`docx`** — only if the "AI team" deployment target wants the final handoff or specs as a Word doc rather than markdown; not confirmed as a requirement.
- No code-review or dataviz skills are relevant — this work is entirely markdown/spreadsheet system-design documentation, not application code.
