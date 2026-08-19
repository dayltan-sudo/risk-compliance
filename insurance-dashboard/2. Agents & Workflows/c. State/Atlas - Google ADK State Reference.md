# Atlas — Google ADK State Reference

> Reference doc, Google ADK 2.0. Consolidated state schema for all twelve Atlas components, now merged into five subagent files, all in `a. Agents/` — no separate workflow tier. Each component file links here instead of repeating its schema.
>
> **Companion docs:** [`Atlas - Data Lifecycle & Versioning Reference.md`](Atlas%20-%20Data%20Lifecycle%20%26%20Versioning%20Reference.md) · [`Atlas - Output Templates.md`](Atlas%20-%20Output%20Templates.md)

## Cross-Agent Key Index

All `app:` keys — application scope, persistent.

| Key | Written By | Read By |
| :--- | :--- | :--- |
| `app:entity_site_master` | *(integration — HR/entity master)* | Insurance DocAnalyst (Flow H), Orchestrator, News |
| `app:document_store` | Insurance DocAnalyst (Flow A) | Insurance DocAnalyst (internal, Flow B), InsuranceCustodian |
| `app:validation_queue` | Insurance DocAnalyst | Insurance DocAnalyst, Orchestrator (status read + alert dispatch) |
| `app:contract_requirement_inputs` | Insurance DocAnalyst (Flow G, §11a there) | CoverageAnalyst (Contract Compliance function — Required Limit input, all four counterparty types) |
| `app:policy_registry` | Insurance DocAnalyst (Flow H) **only** | Orchestrator, CoverageAnalyst, InsuranceCustodian |
| `app:kpi_snapshot_store` | CoverageAnalyst (all three engine functions) | Orchestrator, InsuranceCustodian |
| `app:contract_requirements_register` | CoverageAnalyst (Contract Compliance function) | Orchestrator, InsuranceCustodian |
| `app:exclusions_register` | CoverageAnalyst (Contract Compliance function) | Orchestrator, InsuranceCustodian |
| `app:config_versions` | CoverageAnalyst (Config Change-Control function) **only** | Same agent's three engine functions, Orchestrator |
| `app:fx_rates` | *(integration — FX service; append-only)* | Insurance DocAnalyst (Flow H), CoverageAnalyst (Coverage & Ratio function) |
| `app:risk_indices` | *(integration — nat-cat/country-risk/sanctions/carrier ratings)* | CoverageAnalyst (Risk Scoring function), Insurance DocAnalyst (Flow H) |
| `app:alert_trigger_table` | *(configured — §12.1)* | Atlas Orchestrator (Flow F/G) |
| `app:news_signals` | RiskScanner | CoverageAnalyst (Risk Scoring function, optional weighted input, FR6.6), Orchestrator |
| `app:user_scope_registry` | *(integration — Entra ID/SSO)* | Orchestrator (access gate), InsuranceCustodian (both functions) |
| `app:audit_log` | **Every component** (append-only) — owned by InsuranceCustodian's Audit & Access Log function, **MVP** | Auditor, Treasury, R&C, Group Insurance per §4.2 |

`app:kpi_snapshot_store` backs the formal **KPI / Risk Score Snapshot** entity; `app:config_versions` backs the formal **Configuration Version** entity — field lists: [`Atlas - Data Lifecycle & Versioning Reference.md`](Atlas%20-%20Data%20Lifecycle%20%26%20Versioning%20Reference.md).

**Two structural rules, no exceptions:**
1. `app:policy_registry` has exactly one writer — Insurance DocAnalyst, and only via its Flow H. No engine function, no Orchestrator path, no other flow anywhere ever writes it.
2. `app:audit_log` is append-only. Every component writes to it via `atlas_write_audit` (no exceptions), but **no component has an UPDATE or DELETE path** to it — enforced structurally, not by convention.

## Agent & Hybrid State Schemas

### Atlas Orchestrator (+ Alerts & Notification)

| Key | Scope & Lifetime | Description |
| :--- | :--- | :--- |
| `user:assistant_response_rules` | User, persistent, configured | Response-composition and citation rules. |
| `user:notification_preferences` | User, persistent, configured | Channel choice (in-app/email/Teams) per alert type and user (Flow G). |
| `[no prefix]` | Session | `assistant_state`, `page_context`, `resolved_intent`, `access_scope`, `grounding_results`, `citation_set`, `answer_status`, `triggered_items` (Flow F, shared with Flow G). |
| `temp:grounding_payloads` | Temporary, discarded after turn | Raw grounding-service responses before citation composition. |

Reads `app:policy_registry`, `app:kpi_snapshot_store`, `app:contract_requirements_register`, `app:exclusions_register`, `app:news_signals`, `app:user_scope_registry`, `app:alert_trigger_table`, `app:validation_queue` per index above. Read path only — writes only `atlas_raise_alert` dispatch events (logged to `app:audit_log`, not a state key of its own).

### Insurance DocAnalyst (+ Intake & Classification, + Enrichment & Posting)

| Key | Scope & Lifetime | Description |
| :--- | :--- | :--- |
| `app:document_store` | Application, persistent | Sole writer (Flow A). Assigns `ingestion_id` at `atlas_upload_document`. |
| `app:validation_queue` | Application, persistent | Sole writer. Low-confidence/missing fields queued for human review. |
| `app:contract_requirement_inputs` | Application, persistent | Sole writer, Flow G only (§11a). Validated required-limit data extracted from customer contracts, lender agreements, JV partner contracts, and government concession agreements — never `app:policy_registry`. |
| `app:policy_registry` | Application, persistent | **Sole writer across the whole architecture** (rule 1 above), Flow H only, Posting Convergence gated. |
| `user:extraction_confidence_config` | User, persistent, configured | Per-field confidence thresholds and overrides. |
| `[no prefix]` | Session | `ingestion_id`, `document_class`, `intake_status`, `record_type` (`POLICY_FIELD_SET`/`CONTRACT_REQUIREMENT`), `extraction_draft`, `field_confidence_map`, `queued_exceptions`, `questionnaire_draft`, `validation_status` (`PENDING`/`CONFIRMED`), `validated_record`, `enrichment_result`, `posted_version_id`, `recalc_trigger_set`. |
| `temp:extraction_raw` | Temporary, discarded after turn | Raw OCR/NLP output before confidence scoring. |
| `temp:fx_lookup` | Temporary, discarded after turn | Flow H's FX resolution before normalisation. |

Reads `app:fx_rates`, `app:risk_indices`, `app:entity_site_master` (Flow H enrichment inputs).

### RiskScanner (MVP baseline; Stretch/V2 for impact scoring & appetite comparison, §6 there)

| Key | Scope & Lifetime | Description |
| :--- | :--- | :--- |
| `app:news_signals` | Application, persistent | Sole writer. Classified, entity-linked emerging-risk signals. |
| `user:news_relevance_config` | User, persistent, configured | Tuned by dismissed-signal history (FR6.9). |
| `[no prefix]` | Session | `news_batch`, `signal_draft`, `signal_review_status` (`PENDING`/`CONFIRMED`/`DISMISSED`). |

Reads `app:entity_site_master` for entity-linking. No `temp:` key.

## Deterministic Agent State (grouped)

| Component | Key(s) | Notes |
| :--- | :--- | :--- |
| CoverageAnalyst — Coverage & Ratio, Risk Scoring, Contract Compliance functions | Session (shared pattern, one instance per function): `computation_inputs`, `computed_snapshot`, `config_version_id` | All three read `app:config_versions` and write `app:kpi_snapshot_store`; Contract Compliance additionally writes `app:contract_requirements_register` and `app:exclusions_register`, and reads `app:contract_requirement_inputs` (required-limit input for all four counterparty types, written by Insurance DocAnalyst Flow G). |
| CoverageAnalyst — Config Change-Control function | Shares `config_version_id` with the three functions above | Sole writer of `app:config_versions`. No unique session key of its own — it writes the version the engine functions subsequently reference. |
| InsuranceCustodian — Reporting & Export function | `temp:render_buffer` | No persistent session key; reads `user:reporting_templates`. |
| InsuranceCustodian — Audit & Access Log function | — | No session-state key at all; owns `app:audit_log` directly (rule 2 above). |

## `user:` Keys — User Scope, Persistent, Configured

Never agent-written. `user:assistant_response_rules` (Orchestrator) · `user:notification_preferences` (Orchestrator, Alerts function) · `user:extraction_confidence_config` (Insurance DocAnalyst) · `user:news_relevance_config` (News) · `user:reporting_templates` (InsuranceCustodian, Reporting & Export function).

## `temp:` Keys — Discarded After Turn

`temp:grounding_payloads` (Orchestrator) · `temp:extraction_raw` (Insurance DocAnalyst) · `temp:fx_lookup` (Insurance DocAnalyst, Flow H) · `temp:driver_breakdown` (CoverageAnalyst, Risk Scoring function) · `temp:conflict_candidates` (CoverageAnalyst, Contract Compliance function) · `temp:render_buffer` (InsuranceCustodian, Reporting & Export function).

## Convergence Formulas

$$\text{Validation Convergence} = \left( \text{validated\_record} \neq \emptyset \right) \land \left( \text{validation\_status} = \text{CONFIRMED} \right) \land \left( \text{mandatory fields unconfirmed} = \emptyset \right)$$
Gates `atlas_submit_validation` — a field is never fact, or fed to a KPI, until this holds (§9.1).

$$\text{Posting Convergence} = \text{Validation Convergence} \land \left( \text{enrichment\_result} = \text{SUCCESS} \right) \land \left( \text{posted\_version\_id} \neq \emptyset \right) \land \left( \text{audit entry written} \right)$$
Gates `atlas_post_record` — sole trigger for Engine recompute.

$$\text{Snapshot Convergence} = \left( \text{computed\_snapshot} \neq \emptyset \right) \land \left( \text{config\_version\_id} \neq \emptyset \right) \land \left( \text{as\_of\_date bound} \right)$$
Gates every Engine write to `app:kpi_snapshot_store` — no snapshot writes without a bound config version (§10.3).

$$\text{Answer Convergence} = \left( \text{access\_scope} \neq \emptyset \right) \land \left( \text{grounding\_results} \neq \emptyset \right) \land \left( \text{citation\_set} \neq \emptyset \right)$$
Gates the Orchestrator's answer — unmet, it returns the FR8.5 fallback rather than guess.

$$\text{Signal Convergence} = \left( \text{signal\_draft} \neq \emptyset \right) \land \left( \text{signal\_review\_status} \in \{ \text{CONFIRMED}, \text{DISMISSED} \} \right)$$
Gates whether a News signal may feed `app:news_signals` as a Risk Scoring input — never auto-applies (FR6.9).
