# Atlas — Agents & Workflows

Agent-layer design for Atlas (Keppel Global Insurance Monitoring System). Derived from `Keppel_Atlas_PRD_v0_8.docx` (v0.8, 21 Jul 2026), `Atlas_Agent_Architecture_Plan.html` (v1.5), and `Atlas_State_Management_Design.html` (v1.0), all in `1. Planning & Prototyping/`.

Twelve underlying functions, consolidated into **five subagent files**, all in `a. Agents/` — there is no separate `b. Workflows/` tier any more. Two of the five (Atlas Orchestrator, RiskScanner) are pure agents needing prompt design and an evaluation harness; the other three are packaged as subagents for orchestration purposes but remain internally deterministic — no LLM in the loop for any of their functions, since FR2.4's reproducible calculation lineage is an argument against putting a model near the math. Each merged file's banner states which of its functions are agentic versus deterministic; treat that distinction as still load-bearing even though all five now live in `a. Agents/`.

## Components

| Component (functions merged in) | Type | Release | Doc |
| :--- | :--- | :--- | :--- |
| Atlas Orchestrator *(+ Alerts & Notification)* | Agent | MVP | [main](a.%20Agents/Atlas%20Orchestrator.md) |
| Insurance DocAnalyst *(+ Intake & Classification, + Enrichment & Posting)* | Hybrid | MVP | [main](a.%20Agents/Insurance%20DocAnalyst.md) |
| RiskScanner | Agent | MVP\*\*\* | [main](a.%20Agents/RiskScanner.md) |
| CoverageAnalyst *(Coverage & Ratio + Risk Scoring + Contract Compliance + Config Change-Control)* | Deterministic | MVP\*\* | [main](a.%20Agents/CoverageAnalyst.md) |
| InsuranceCustodian *(Reporting & Export + Audit & Access Log)* | Deterministic / Infra | Mixed\*\*\*\* | [main](a.%20Agents/InsuranceCustodian.md) |

\* Alerts (inside Orchestrator) ships at MVP but not every PRD §12.1 trigger row does.

\*\* Coverage & Ratio, Risk Scoring, and Contract Compliance are MVP; Config Change-Control (inside the same file) is Should/V2 — see that file's §3.

\*\*\* Reclassified from V2 to MVP: only RiskScanner's baseline tier (ingestion, tagging, entity-linking, curated feed, confirm/dismiss) — its impact-scoring/appetite-comparison/weighted-risk-score-input capability (FR6.4–FR6.6) stays Stretch/V2 — see RiskScanner.md §7.

\*\*\*\* Split release: Audit & Access Log is back to **MVP** (restored, after a brief V2 reclassification that would have left every other component's "writes `atlas_write_audit` unconditionally" claim with nothing to write to at go-live); Reporting & Export stays **V2** — it never had an explicit PRD tag and nothing else depends on it structurally. See InsuranceCustodian.md §1.

## Where the reference material lives

There is no separate state or reference tier — each PRD reference table now sits in the agent that owns it, as a labelled appendix reproducing the PRD section verbatim.

| Reference | Home |
| :--- | :--- |
| KPI formulas (PRD §7.1–7.8) | [CoverageAnalyst](a.%20Agents/CoverageAnalyst.md) §8 |
| Risk score drivers, bands, scoring approach (PRD §10) | [CoverageAnalyst](a.%20Agents/CoverageAnalyst.md) §9 |
| KPI / Risk Score Snapshot + Configuration Version entities | [CoverageAnalyst](a.%20Agents/CoverageAnalyst.md) §4, §3 |
| Policy field set (PRD §8.2) + contractual requirement field set | [Insurance DocAnalyst](a.%20Agents/Insurance%20DocAnalyst.md) §14, §15 |
| Alert triggers, channels, scheduled reports (PRD §12.1–12.2) | [Atlas Orchestrator](a.%20Agents/Atlas%20Orchestrator.md) §10; report list in [InsuranceCustodian](a.%20Agents/InsuranceCustodian.md) §3 |
| Personas, role-capability matrix (PRD §4.1–4.2) | [InsuranceCustodian](a.%20Agents/InsuranceCustodian.md) §5 |
| Bitemporal model, entity lifecycle, retention clocks, storage patterns (PRD §8.1, PRD §13) | [InsuranceCustodian](a.%20Agents/InsuranceCustodian.md) §6 |
| Convergence formulas | Each in its owning agent — Validation/Posting: DocAnalyst §6/§7 · Snapshot: CoverageAnalyst §3 · Answer: Orchestrator §5 · Signal: RiskScanner §2 |
| Alert resolution (data-change auto-close vs. risk-acceptance override) | [Atlas Orchestrator](a.%20Agents/Atlas%20Orchestrator.md) §11 |
| Worked output examples | Inline in the producing agent — Orchestrator §5/§6, DocAnalyst §4, CoverageAnalyst §5/§6 |

## State keys & ownership

All `app:` keys — application scope, persistent.

| Key | Written By | Read By |
| :--- | :--- | :--- |
| `app:entity_site_master` | *(integration — HR/entity master)* | Insurance DocAnalyst (Flow H), Orchestrator, RiskScanner |
| `app:document_store` | Insurance DocAnalyst (Flow A) | Insurance DocAnalyst (Flow B), InsuranceCustodian |
| `app:validation_queue` | Insurance DocAnalyst | Insurance DocAnalyst, Orchestrator (status read + alert dispatch) |
| `app:contract_requirement_inputs` | Insurance DocAnalyst (Flow G, PRD §13) | CoverageAnalyst (Contract Compliance — required-limit input, all four counterparty types) |
| `app:policy_registry` | Insurance DocAnalyst (Flow H) **only** | Orchestrator, CoverageAnalyst, InsuranceCustodian |
| `app:kpi_snapshot_store` | CoverageAnalyst (all three engines) | Orchestrator, InsuranceCustodian |
| `app:contract_requirements_register` | CoverageAnalyst (Contract Compliance) | Orchestrator, InsuranceCustodian |
| `app:exclusions_register` | CoverageAnalyst (Contract Compliance) | Orchestrator, InsuranceCustodian |
| `app:config_versions` | CoverageAnalyst (Config Change-Control) **only** | Same agent's three engines, Orchestrator |
| `app:fx_rates` | *(integration — FX service; append-only)* | Insurance DocAnalyst (Flow H), CoverageAnalyst (Coverage & Ratio) |
| `app:risk_indices` | *(integration — nat-cat/country-risk/sanctions/carrier ratings)* | CoverageAnalyst (Risk Scoring), Insurance DocAnalyst (Flow H) |
| `app:alert_trigger_table` | *(configured — PRD §12.1)* | Atlas Orchestrator (Flow F/G) |
| `app:alert_registry` | Atlas Orchestrator (`atlas_acknowledge_alert`) **only** | Atlas Orchestrator (Flow F Node 1a) |
| `app:news_signals` | RiskScanner | CoverageAnalyst (Risk Scoring, optional weighted input, FR6.6), Orchestrator |
| `app:user_scope_registry` | *(integration — Entra ID/SSO)* | Orchestrator (access gate), InsuranceCustodian (both functions) |
| `app:audit_log` | **Every component** (append-only) — owned by InsuranceCustodian's Audit & Access Log, **MVP** | Auditor, Treasury, R&C, Group Insurance per InsuranceCustodian §5 |

**`user:` keys** (configured, never agent-written): `user:assistant_response_rules`, `user:notification_preferences` (Orchestrator) · `user:extraction_confidence_config` (Insurance DocAnalyst) · `user:news_relevance_config` (RiskScanner) · `user:reporting_templates` (InsuranceCustodian).

**`temp:` keys** (discarded after turn): `temp:grounding_payloads` (Orchestrator) · `temp:extraction_raw`, `temp:fx_lookup` (Insurance DocAnalyst) · `temp:driver_breakdown`, `temp:conflict_candidates` (CoverageAnalyst) · `temp:render_buffer` (InsuranceCustodian).

**Two structural rules, no exceptions:**
1. `app:policy_registry` has exactly one writer — Insurance DocAnalyst, and only via its Flow H. No engine, no Orchestrator path, no other flow anywhere ever writes it. **Enforced structurally, not by convention:** the underlying table grants INSERT/UPDATE only to the service identity Insurance DocAnalyst's Flow H runs as; every other agent's DB credential is read-only against it — the same enforcement pattern as rule 2, applied to the architecture's other single-writer, high-blast-radius table.
2. `app:audit_log` is append-only. Every component writes to it via `atlas_write_audit` (no exceptions), but **no component has an UPDATE or DELETE path** to it — enforced structurally, not by convention.

## MVP Scope — RBAC Deferred

Permission checks against the InsuranceCustodian §5 role-capability matrix are **stubbed to always-allow** through the closed-group testing period — every frontend user is treated as holding whatever permission an action requires. This is a deliberate MVP scoping decision, not an oversight.

**What stays live regardless:** identity and entity/site resolution (`app:user_scope_registry` → `access_scope`), and audit attribution (`atlas_write_audit` actor field). Nothing about *who did what* is lost — only the *deny* branch of each permission check is disabled. This keeps re-enabling enforcement later a matter of flipping the stub, not retrofitting identity capture after the fact.

**Do not defer past this testing period:** widening access beyond the closed group, or any production rollout, without first re-enabling enforcement — entity-scoped data (Entity Risk Champion's cross-entity isolation in particular) has real sensitivity once the user base isn't a small trusted group.

## Cross-cutting guardrails

Bind every component; each doc restates only the ones that apply to it.

1. **Validation gate** — a field stays `unconfirmed` and is excluded from every KPI until a human validates it (PRD §9.1).
2. **Never silently overwrite** — every change is a new version, prior values retrievable, audit entry every time (FR3.7). Audit & Access Log (inside InsuranceCustodian) is MVP, so this guardrail holds in full from go-live.
3. **Entity/site scoping** — scope the *request* before it reaches a grounding service, not the response afterward (PRD §4.2).
4. **News is advisory only** — a signal never changes coverage or KPI data without human confirmation (FR6.9).

## Build sequence

Functions, not files — several land in the same subagent file but still sequence independently by dependency:

| Order | Functions |
| :--- | :--- |
| MVP 1 | Insurance DocAnalyst's own sequence: Intake & Classification → Extraction/Validation → Enrichment & Posting |
| MVP 2 | CoverageAnalyst's three MVP engines: Coverage & Ratio, Risk Scoring, Contract Compliance |
| MVP 3 | Orchestrator's Alerts function (MVP triggers only), InsuranceCustodian's Audit & Access Log function |
| MVP 4 | Atlas Orchestrator's core Q&A — live-data answering, citations, fallback (FR8.3–FR8.5) |
| MVP 5 | RiskScanner's baseline tier (FR6.1–6.3, 6.7–6.10) — reclassified from V2; needs prompt design/eval like the Orchestrator, but has no dependency on MVP 1–4 and can build in parallel |
| V2 | InsuranceCustodian's Reporting & Export function (stays V2 — see Sponsor decisions below), RiskScanner's Stretch tier (FR6.4–6.6, impact scoring/appetite comparison/weighted risk-score input), Config Change-Control (inside CoverageAnalyst), FR7.6 auto-recalc, FR4.5 reweight recompute, remaining alert triggers, FR3.8 bulk/multi-language reprocessing |

The Orchestrator's core Q&A sequences last within MVP: it needs prompt design and an evaluation harness rather than just correct code, and has nothing to query until MVP 1–3 exist. Its Alerts function, by contrast, can build alongside MVP 3 since it depends only on the engines and registers, not on the NL layer.

## Sponsor decisions (21 Jul 2026)

Every open item from the first pass is resolved.

| # | Item | Resolution |
| :--- | :--- | :--- |
| 2, 8 | "Configuration Version" and KPI values not named PRD §8.1 entities | **Resolved** — both formalized as first-class entities (Option A): **Configuration Version**, and **KPI / Risk Score Snapshot** (its `config_version_id` FK required the former too). Field lists in [CoverageAnalyst](a.%20Agents/CoverageAnalyst.md) §3 and §4. |
| 3 | Regulatory-retention duration unspecified | **Resolved** — retain indefinitely for now; revisit if a shorter Group policy duration is confirmed. |
| 4 | Dismissed news-signal retention | **Resolved** — indefinite, surfaced in an Archived Signals section separate from the active watchlist. |
| 5 | Claim tracking after policy retirement | **Resolved** — Atlas keeps following an open claim past its policy's expiry; ends at settlement. |
| 6 | No tool for the FR3.9 manual-questionnaire path | **Resolved** — new maker-checker process, tool `atlas_submit_questionnaire`; a second user (never the preparer) confirms every field. See [Insurance DocAnalyst](a.%20Agents/Insurance%20DocAnalyst.md) §5. |
| 7 | 6 of 9 PRD §12.1 alert triggers untagged | **Resolved** — Renewal due and Low-confidence extraction ship MVP; Coverage gap, Carrier downgrade, Aggregate erosion, New high-risk hotspot are V2. Low-confidence extraction also gains a reviewer capability to confirm/adjust a field's confidence level. See [Atlas Orchestrator](a.%20Agents/Atlas%20Orchestrator.md) §10. |
| 9 | InsuranceCustodian's audit-log gap, raised after a brief MVP→V2 reclassification of the whole agent (later addition, not part of the 21 Jul 2026 pass) | **Resolved** — split the release instead of moving the whole agent: Audit & Access Log reverted to MVP (every other component's "writes `atlas_write_audit` unconditionally" claim now holds from go-live); Reporting & Export stays V2, since it never had a PRD tag and nothing depends on it structurally. |

Config Change-Control's release tag (Should/V2, governing threshold/weight *changes*) is unaffected — already correct as documented.

## Conventions

Every file in `a. Agents/` opens `# System Instruction:` — the separate `# Workflow Specification:` heading and `b. Workflows/` tier were retired when the nine deterministic components were consolidated into subagent files alongside the three original agents; references bare. Each carries a banner blockquote placing it in the system (and, for a merged file, naming which formerly-separate components it now contains), then numbered sections ending in Failure & Denial Handling, one table per merged function where more than one exists in a file. Flow diagrams are ASCII node graphs, lettered continuously across a merged file's functions; gates are `$$`-delimited convergence formulas. Every non-obvious assertion carries a PRD reference. The prior **1000-word-per-file cap no longer applies** to the merged files — each covers multiple formerly-separate components by design; a single-function file (RiskScanner) still holds to it.
