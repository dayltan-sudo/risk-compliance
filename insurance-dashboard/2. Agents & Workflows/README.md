# Atlas — Agents & Workflows

Agent-layer design for Atlas (Keppel Global Insurance Monitoring System). Derived from `Keppel_Atlas_PRD_v0_8.docx` (v0.8, 21 Jul 2026), `Atlas_Agent_Architecture_Plan.html` (v1.5), and `Atlas_State_Management_Design.html` (v1.0), all in `1. Planning & Prototyping/`.

Twelve underlying functions, consolidated into **five subagent files**, all in `a. Agents/` — there is no separate `b. Workflows/` tier any more. Two of the five (Atlas Assistant Orchestrator, News & Sector Intelligence) are pure agents needing prompt design and an evaluation harness; the other three are packaged as subagents for orchestration purposes but remain internally deterministic — no LLM in the loop for any of their functions, since FR2.4's reproducible calculation lineage is an argument against putting a model near the math. Each merged file's banner states which of its functions are agentic versus deterministic; treat that distinction as still load-bearing even though all five now live in `a. Agents/`.

## Components

| Component (functions merged in) | Type | Release | Doc |
| :--- | :--- | :--- | :--- |
| Atlas Assistant Orchestrator *(+ Alerts & Notification)* | Agent | MVP | [main](a.%20Agents/Atlas%20Assistant%20Orchestrator.md) |
| Field Extraction & Validation Routing *(+ Intake & Classification, + Enrichment & Posting)* | Hybrid | MVP | [main](a.%20Agents/Field%20Extraction%20%26%20Validation%20Routing.md) |
| News & Sector Intelligence | Agent | V2 | [main](a.%20Agents/News%20%26%20Sector%20Intelligence%20Agent%20-%20V2.md) |
| Coverage, Risk & Compliance Engines Agent *(Coverage & Ratio + Risk Scoring + Contract Compliance + Config Change-Control)* | Deterministic | MVP\*\* | [main](a.%20Agents/Coverage%2C%20Risk%20%26%20Compliance%20Engines%20Agent.md) |
| Reporting & Audit Agent *(Reporting & Export + Audit & Access Log)* | Deterministic / Infra | MVP\*/Guardrail | [main](a.%20Agents/Reporting%20%26%20Audit%20Agent.md) |

\* Alerts (inside Orchestrator) ships at MVP but not every §12.1 trigger row does. Reporting & Export (inside Reporting & Audit Agent) has no §6 release tag — its MVP placement is the architecture plan's inference from the §3 "Decision speed" metric.

\*\* Coverage & Ratio, Risk Scoring, and Contract Compliance are MVP; Config Change-Control (inside the same file) is Should/V2 — see that file's §3.

## Shared references

| Doc | Contents |
| :--- | :--- |
| [Google ADK State Reference](c.%20State/Atlas%20-%20Google%20ADK%20State%20Reference.md) | Every `app:`/`user:`/session/`temp:` key, who writes and reads it, and all five convergence formulas |
| [Data Lifecycle & Versioning](c.%20State/Atlas%20-%20Data%20Lifecycle%20%26%20Versioning%20Reference.md) | Bitemporal pattern, entity lifecycle classification, four retention clocks, storage patterns |
| [Output Templates](c.%20State/Atlas%20-%20Output%20Templates.md) | Worked examples — cited answer, exception-queue entry, driver breakdown, `Excluded` status row |
| [KPI Formulas](d.%20Reference/Atlas%20Reference%20-%20KPI%20Formulas.md) | PRD §7.1–7.8 |
| [Risk Score Drivers](d.%20Reference/Atlas%20Reference%20-%20Risk%20Score%20Drivers.md) | PRD §10 weights, bands, change control |
| [Extraction Field Set](d.%20Reference/Atlas%20Reference%20-%20Extraction%20Field%20Set.md) | PRD §8.2 data dictionary |
| [Alert Triggers](d.%20Reference/Atlas%20Reference%20-%20Alert%20Triggers.md) | PRD §12.1–12.2 |
| [RBAC & Access Scoping](d.%20Reference/Atlas%20Reference%20-%20RBAC%20%26%20Access%20Scoping.md) | PRD §4.1–4.2, §13 PII handling |

## Cross-cutting guardrails

Bind every component; each doc restates only the ones that apply to it.

1. **Validation gate** — a field stays `unconfirmed` and is excluded from every KPI until a human validates it (§9.1).
2. **Never silently overwrite** — every change is a new version, prior values retrievable, audit entry every time (FR3.7).
3. **Entity/site scoping** — scope the *request* before it reaches a grounding service, not the response afterward (§4.2).
4. **News is advisory only** — a signal never changes coverage or KPI data without human confirmation (FR6.9).
5. **Role-based PII redaction** — masking on answers, posted records, and generated packs; source-document export restricted (§13). **No component owns this end-to-end.**

## Build sequence

Functions, not files — several land in the same subagent file but still sequence independently by dependency:

| Order | Functions |
| :--- | :--- |
| MVP 1 | Field Extraction & Validation Routing's own sequence: Intake & Classification → Extraction/Validation → Enrichment & Posting |
| MVP 2 | Coverage, Risk & Compliance Engines Agent's three MVP engines: Coverage & Ratio, Risk Scoring, Contract Compliance |
| MVP 3 | Orchestrator's Alerts function (MVP triggers only), Reporting & Audit Agent's two functions |
| MVP 4 | Atlas Assistant Orchestrator's core Q&A — live-data answering, citations, fallback (FR8.3–FR8.5) |
| V2 | News & Sector Intelligence, Config Change-Control (inside Coverage, Risk & Compliance Engines Agent), FR7.6 auto-recalc, FR4.5 reweight recompute, remaining alert triggers, FR3.8 bulk/multi-language reprocessing |

The Orchestrator's core Q&A sequences last within MVP: it needs prompt design and an evaluation harness rather than just correct code, and has nothing to query until MVP 1–3 exist. Its Alerts function, by contrast, can build alongside MVP 3 since it depends only on the engines and registers, not on the NL layer.

## Sponsor decisions (21 Jul 2026)

Every open item from the first pass is resolved except PII ownership — a deliberate deferral, not a gap.

| # | Item | Resolution |
| :--- | :--- | :--- |
| 1 | PII redaction ownership | **Deferred** — in-scope source documents aren't expected to carry named-individual data in practice; revisit before onboarding D&O, GPA, or workmen's-comp lines. |
| 2, 8 | "Configuration Version" and KPI values not named §8.1 entities | **Resolved** — both formalized as first-class entities (Option A): **Configuration Version**, and **KPI / Risk Score Snapshot** (its `config_version_id` FK required the former too). See [Data Lifecycle & Versioning Reference](c.%20State/Atlas%20-%20Data%20Lifecycle%20%26%20Versioning%20Reference.md). |
| 3 | Regulatory-retention duration unspecified | **Resolved** — retain indefinitely for now; revisit if a shorter Group policy duration is confirmed. |
| 4 | Dismissed news-signal retention | **Resolved** — indefinite, surfaced in an Archived Signals section separate from the active watchlist. |
| 5 | Claim tracking after policy retirement | **Resolved** — Atlas keeps following an open claim past its policy's expiry; ends at settlement. |
| 6 | No tool for the FR3.9 manual-questionnaire path | **Resolved** — new maker-checker process, tool `atlas_submit_questionnaire`; a second user (never the preparer) confirms every field. See [Field Extraction & Validation Routing](a.%20Agents/Field%20Extraction%20%26%20Validation%20Routing.md) §5. |
| 7 | 6 of 9 §12.1 alert triggers untagged | **Resolved** — Renewal due and Low-confidence extraction ship MVP; Coverage gap, Carrier downgrade, Aggregate erosion, New high-risk hotspot are V2. Low-confidence extraction also gains a reviewer capability to confirm/adjust a field's confidence level. See [Alert Triggers](d.%20Reference/Atlas%20Reference%20-%20Alert%20Triggers.md). |

Config Change-Control's release tag (Should/V2, governing threshold/weight *changes*) is unaffected — already correct as documented.

## Conventions

Every file in `a. Agents/` opens `# System Instruction:` — the separate `# Workflow Specification:` heading and `b. Workflows/` tier were retired when the nine deterministic components were consolidated into subagent files alongside the three original agents; references bare. Each carries a banner blockquote placing it in the system (and, for a merged file, naming which formerly-separate components it now contains), then numbered sections ending in Failure & Denial Handling, one table per merged function where more than one exists in a file. Flow diagrams are ASCII node graphs, lettered continuously across a merged file's functions; gates are `$$`-delimited convergence formulas. Every non-obvious assertion carries a PRD reference. The prior **1000-word-per-file cap no longer applies** to the merged files — each covers multiple formerly-separate components by design; a single-function file (News & Sector Intelligence) still holds to it.
