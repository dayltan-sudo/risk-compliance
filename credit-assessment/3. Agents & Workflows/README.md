# Credit Assessment — Agents & Workflows

Agent-layer design for the trade credit risk tool. Derived from `Credit_Assessment_PRD_v0.10.md` (now v0.12, 21 Aug 2026), `Credit_Assessment_Agent_Architecture_Plan.html` (v2.3), and `Credit_Assessment_State_Management_Plan.html` (v1.7), all in `1. Planning & Prototyping/` and `c. State/`.

Thirteen underlying components, consolidated into **five committed subagent files plus one specified-but-unbuilt sixth**, all in `a. Agents/`. Only two files hold agentic content: Statement Extraction (one hybrid function — extraction) and Adverse-Media Screening (one pure agent — screening); Assistant / Q&A Orchestrator is the roster's second pure agent, specified as FR13 but not yet built. The other three files are deterministic throughout — no LLM in the loop for any function they contain, since NFR Traceability's reconstructability requirement is an argument against putting a model near the math or the record. Each file's banner states which of its functions are agentic versus deterministic; that distinction is load-bearing regardless of which file a function lives in.

## Components

| Component (functions merged in) | Type | Release | Doc |
| :--- | :--- | :--- | :--- |
| Statement Extraction *(Document Intake & Versioning + Field Extraction & Validation Routing)* | Hybrid | MVP\* | [main](a.%20Agents/Statement%20Extraction.md) |
| Field Review *(Field Review, Confirmation & Posting)* | Deterministic | MVP | [main](a.%20Agents/Field%20Review.md) |
| Scoring & Decisioning *(Ratio Engine + Rating / Scorecard Engine + Recommendation Engine)* | Deterministic | MVP\*\* | [main](a.%20Agents/Scoring%20%26%20Decisioning.md) |
| Adverse-Media Screening *(Screening Subject Register & Review + Adverse Media Screening)* | Deterministic / Agent | V2 | [main](a.%20Agents/Adverse-Media%20Screening.md) |
| Governance & Records *(Approval Workflow + Customer & Assessment Registry + Audit & Access Log + Methodology Config & Change-Control + Reporting & Export)* | Deterministic / Infra | Mixed\*\*\* | [main](a.%20Agents/Governance%20%26%20Records.md) |
| Assistant / Q&A Orchestrator | Agent | V2, specified\*\*\*\* | [main](a.%20Agents/Assistant%20Q%26A%20Orchestrator.md) |

\* Document Intake's registration-document sub-flow (FR1.8) and Field Extraction's identity-extraction widening (FR2.8) are Should/V2; the rest of this file is Must/MVP — see that file's §1.

\*\* All of FR4–FR6 is Must/MVP. The scorecard's qualitative override (FR5.3) is Should/V2 — see that file's §6.

\*\*\* Approval Workflow, Customer & Assessment Registry, and Audit & Access Log are MVP; Methodology Config's versioned schema is MVP but its admin editing screen (FR10.2) is Should/V2; Reporting & Export is Should/MVP. See that file's §1.

\*\*\*\* FR13 (eleven sub-requirements) is fully specified in the PRD, all three of its open decisions closed at v0.12 — but no build has started. It depends only on data Scoring & Decisioning and Governance & Records already produce, so nothing structural blocks starting it; only prioritisation against the rest of V2 does.

## Where the reference material lives

There is no separate state or reference tier — each PRD reference table sits in the agent that owns it, as a labelled appendix reproducing the PRD section it derives from.

| Reference | Home |
| :--- | :--- |
| Standardized field set, confidence bands, tier ladder (PRD FR2.1–FR2.8) | [Statement Extraction](a.%20Agents/Statement%20Extraction.md) §8 |
| Ratio set, scorecard, and recommendation formulas — all `PLACEHOLDER` pending the baseline Excel template | [Scoring & Decisioning](a.%20Agents/Scoring%20%26%20Decisioning.md) §7 |
| ExtractedField, Ratio, Rating, Recommendation, ApprovalDecision, AuditLogEntry, ScorecardConfig, ScreeningSubject, ScreeningRun, AdverseFinding entity field lists (PRD §4) | Each in its owning agent — see §2 State Management in each file |
| Personas, role-capability scope (PRD §1, NFR RBAC) | [Governance & Records](a.%20Agents/Governance%20%26%20Records.md) §5 |
| Data lifecycle, versioning & retention clocks (PRD §4 mutability column, NFR Data retention) | [Governance & Records](a.%20Agents/Governance%20%26%20Records.md) §6 |
| Convergence formulas | Each in its owning agent — Confirmation: Field Review §3 · Compute: Scoring & Decisioning §3 · Screening: Adverse-Media Screening §3 · Answer: Assistant §3 |
| Alert / adverse-finding review states, screening trigger timing (PRD FR12.1, FR12.7) | [Adverse-Media Screening](a.%20Agents/Adverse-Media%20Screening.md) §7 |
| Worked output examples | Inline in the producing agent — Statement Extraction §4, Scoring & Decisioning §5, Adverse-Media Screening §6, Assistant §5 |

## State keys & ownership

All `cra:` keys — application scope, persistent (Credit [Risk] Assessment).

| Key | Written By | Read By |
| :--- | :--- | :--- |
| `cra:customer_registry` | Governance & Records (Registry) **only** | Every agent (customer identity) |
| `cra:document_store` | Statement Extraction (Intake) **only** | Statement Extraction (Extraction), Governance & Records (browse, FR1.9) |
| `cra:extracted_field_store` | Statement Extraction (value, copy-on-reuse) → Field Review (status, amendments) | Field Review, Scoring & Decisioning (Ratio Engine) |
| `cra:assessment_registry` | Governance & Records (Registry mints; Approval Workflow transitions state) | Statement Extraction, Field Review, Governance & Records, Assistant — not Scoring & Decisioning or Adverse-Media Screening, which operate on assessment-scoped rows already keyed by `assessment_id` from their trigger and never read the Assessment record itself |
| `cra:ratio_store` | Scoring & Decisioning (Ratio Engine) **only** | Scoring & Decisioning (Rating Engine), Governance & Records (comparison), Adverse-Media Screening (write-complete signal only, FR12.1 — never consumes ratio values), Assistant |
| `cra:rating_store` | Scoring & Decisioning (Rating Engine) **only** | Scoring & Decisioning (Recommendation Engine), Governance & Records, Assistant |
| `cra:recommendation_store` | Scoring & Decisioning (Recommendation Engine); locked (read-only past this point) by Governance & Records (Approval) on Approve | Governance & Records, Assistant |
| `cra:approval_decision_log` | Governance & Records (Approval Workflow) **only** | Governance & Records, Assistant |
| `cra:scorecard_config` | Governance & Records (Methodology Config) **only** | Scoring & Decisioning (all three engines), Statement Extraction (confidence bands/floor, FR10.4), Assistant (`config_version_id` citation) |
| `cra:screening_subject_register` | Statement Extraction (candidate, FR2.8) → Adverse-Media Screening (status, FR3.11) | Adverse-Media Screening — not Assistant, which reads `cra:screening_run_store` and `cra:adverse_finding_store` instead (FR13.10 summarizes findings, not the underlying roster) |
| `cra:screening_run_store` | Adverse-Media Screening **only** | Assistant (FR13.10) — not Governance & Records, which has no FR11 export scope or FR8 comparison reason to read screening data; an Auditor's visibility into screening activity comes through `cra:audit_log` instead (FR12.8) |
| `cra:adverse_finding_store` | Adverse-Media Screening **only** | Assistant (FR13.10) — not Scoring & Decisioning, whose Rating Engine reads only the analyst's typed FR5.3 justification, never a finding directly (architecture plan §5); not Governance & Records, for the same export/comparison-scope reason as above |
| `cra:audit_log` | **Every agent** (append-only) — owned by Governance & Records's Audit & Access Log, **MVP** | Approver, Admin, Auditor per Governance & Records §5 |
| `cra:user_scope_registry` | *(integration — identity/SSO)* | Statement Extraction (Intake's upload gate only, not Extraction's triggered pass), Field Review, Adverse-Media Screening (Subject Register Review's human-facing gate only, not the triggered screening run), Governance & Records, Assistant — not Scoring & Decisioning, whose engines run only against triggers a human action already gated upstream |

**`user:` keys** (configured, never agent-written): `user:assistant_response_rules` (Assistant, once built).

**`temp:` keys** (discarded after turn): `temp:extraction_raw` (Statement Extraction) · `temp:driver_breakdown` (Scoring & Decisioning) · `temp:query_selection` (Assistant, once built).

**Two structural rules, no exceptions:**
1. `cra:assessment_registry`'s version-mint and state-transition operations have exactly one writer each — Governance & Records mints (Registry function), and only Governance & Records transitions state (Approval Workflow function). No engine, no Statement Extraction path, no Assistant path ever writes to it. Enforced structurally, not by convention: the underlying table grants INSERT/UPDATE only to the service identities these two functions run as.
2. `cra:audit_log` is append-only. Every agent writes to it via `cra_write_audit` (no exceptions), but **no agent has an UPDATE or DELETE path** to it — enforced structurally, not by convention. This is the same guardrail the architecture plan states for `AuditLogEntry` (§11): immutable and append-only by definition.

## Cross-cutting guardrails

Bind every agent; each file restates only the ones that apply to it. Full reasoning: architecture plan §10.

1. **Validation gate** — no agent may treat an Unconfirmed field as fact (FR3.8). A field stays `Unconfirmed` and its ratio computes flagged **Provisional** until a human confirms or amends it; **Not Present** is a third terminal status distinct from Provisional, never conflated, never substituted with a value.
2. **Field state never crosses an assessment boundary** — `ExtractedField` belongs to Assessment, not Document; reuse copies fields and resets every copy to Unconfirmed (FR1.7). The one deliberate exemption is `ScreeningSubject`, which belongs to Customer and *is* shared across assessments.
3. **Never silently overwrite** — document re-upload creates a new version (FR1.5), field amendment retains the original (FR3.6), a Refresh Assessment creates a new linked version rather than editing the last (FR8.2–FR8.4). Every one is paired with an audit entry (FR9.1).
4. **Config immutability for historical results** — a methodology change must never retroactively rescore a past assessment (FR10.3). Every engine computes on write and stamps its output with the config version live at compute time; none is a read-current-config service.
5. **The recommendation is a proposal, never an application** — nothing downstream of the Recommendation Engine may apply a limit or terms to a live customer account without an FR7.4 approval (FR6.2).
6. **Role-scoped visibility** — scope every query by the caller's role before it reaches data, not at the UI layer (NFR RBAC, FR9.3).
7. **Currency is normalized explicitly or blocked, never assumed** — a mixed-currency assessment is rejected rather than normalized at an unspecified rate and date, since an invented FX treatment inside a ratio is invisible in the output and voids FR4.2's lineage claim. Enforced by Field Review, not by Governance & Records.
8. **Untrusted external content is adversarial by default** — Adverse-Media Screening's retrieved content reaches the model as data, never instruction; every finding carries its source URL; no path from a finding to any engine, only through a human's FR5.3 citation (FR12.5–FR12.6).
9. **The Assistant reads, cites, and refuses — it never acts** (once built) — no write path to any entity, grounded through fixed parameterized queries only, routes an implied action into the existing gated flow rather than performing it (FR13.3, FR13.8, FR13.11).

## Build sequence

Functions, not files — several land in the same agent file but still sequence independently by dependency. Full detail and rationale: architecture plan §12.

| Order | Functions |
| :--- | :--- |
| MVP 1 | Governance & Records's foundations: Customer & Assessment Registry (entry point, version chain), Audit & Access Log — both precede everything that writes through them |
| MVP 2 | Statement Extraction's own sequence: Document Intake & Versioning → Field Extraction & Validation Routing (MVP's only agentic capability; evaluation harness built here) |
| MVP 3 | Field Review, Confirmation & Posting — the core GUI and the only legitimate path into a ratio |
| MVP 4 | Scoring & Decisioning's Ratio Engine + Governance & Records's config schema/read path (Methodology Config, MVP schema) |
| MVP 5 | Scoring & Decisioning's Rating and Recommendation Engines + Governance & Records's cross-assessment read surfaces (drill-down, history, comparison) and browse entry point (Customer Directory) |
| MVP 6 | Governance & Records's Approval Workflow |
| MVP 7 | Governance & Records's Reporting & Export |
| V2 | Governance & Records's Methodology Config editing surface (FR10.2); Scoring & Decisioning's qualitative override (FR5.3); Adverse-Media Screening in full — Statement Extraction's FR1.8/FR2.8 capture chain first, then the Screening Subject Register (FR3.11), then the screening agent (FR12); Governance & Records's multi-approver committee (FR7.7); **Assistant / Q&A Orchestrator (FR13)** — depends only on data available from MVP 5 onward, so it can build any time after that, gated only by prioritisation |
| V3 | ERP/CRM write-back, portfolio-level views — neither has a requirement in the PRD |

The Assistant's build has no dependency ordering within V2 the way the screening chain does (register before agent, in that order, because the agent's search scope comes from the register) — it can start as soon as V2 work is prioritized, since Scoring & Decisioning and Governance & Records both ship at MVP.

## Conventions

Every file in `a. Agents/` opens `# System Instruction:`. Each carries a banner blockquote placing it in the system (agent type, release, companion docs, and for a merged file, naming which formerly-separate components it now contains), then numbered sections ending in Failure & Denial Handling, one table per merged function where more than one exists in a file. Flow diagrams are ASCII node graphs, lettered continuously across a merged file's functions; gates are `$$`-delimited convergence formulas. Every non-obvious assertion carries an FR or NFR reference. A single-function file (Assistant / Q&A Orchestrator, once built) still holds to a tighter length; the merged files cover multiple formerly-separate components by design and are not capped the same way.
