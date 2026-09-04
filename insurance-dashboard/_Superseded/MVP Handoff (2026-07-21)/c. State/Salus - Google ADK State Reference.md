# Salus — Google ADK State Reference

> Reference doc, Google ADK 2.0. Consolidated state schema for all twelve Salus components — three in `a. Agents/` (two agents + one hybrid), nine deterministic workflows in `b. Workflows/`. Each component file links here instead of repeating its schema.
>
> **Companion docs:** [`Salus - Data Lifecycle & Versioning Reference.md`](Salus%20-%20Data%20Lifecycle%20%26%20Versioning%20Reference.md) · [`Salus - Output Templates.md`](Salus%20-%20Output%20Templates.md)

## Cross-Agent Key Index

All `app:` keys — application scope, persistent.

| Key | Written By | Read By |
| :--- | :--- | :--- |
| `app:entity_site_master` | *(integration — HR/entity master)* | Enrichment & Posting, Orchestrator, News |
| `app:document_store` | Intake & Classification | Field Extraction, Enrichment & Posting, Reporting & Export |
| `app:validation_queue` | Field Extraction & Validation Routing | Field Extraction, Orchestrator (status read), Alerts |
| `app:policy_registry` | Enrichment & Posting **only** | Orchestrator, all three Engines, Reporting & Export |
| `app:kpi_snapshot_store` | Coverage & Ratio, Risk Scoring, Contract Compliance Engines | Orchestrator, Alerts, Reporting & Export |
| `app:contract_requirements_register` | Contract Compliance Engine | Orchestrator, Alerts, Reporting & Export |
| `app:exclusions_register` | Contract Compliance Engine | Orchestrator, Alerts, Reporting & Export |
| `app:config_versions` | Config Change-Control **only** | All three Engines, Orchestrator |
| `app:fx_rates` | *(integration — FX service; append-only)* | Enrichment & Posting, Coverage & Ratio Engine |
| `app:risk_indices` | *(integration — nat-cat/country-risk/sanctions/carrier ratings)* | Risk Scoring Engine, Enrichment & Posting |
| `app:alert_trigger_table` | *(configured — §12.1)* | Alerts & Notification |
| `app:news_signals` | News & Sector Intelligence Agent | Risk Scoring Engine (optional weighted input, FR6.6), Orchestrator |
| `app:user_scope_registry` | *(integration — Entra ID/SSO)* | Orchestrator (access gate), Reporting & Export, Audit & Access Log |
| `app:audit_log` | **Every component** (append-only) | Auditor, Treasury, R&C, Group Insurance per §4.2 |

`app:kpi_snapshot_store` backs the formal **KPI / Risk Score Snapshot** entity; `app:config_versions` backs the formal **Configuration Version** entity — field lists: [`Salus - Data Lifecycle & Versioning Reference.md`](Salus%20-%20Data%20Lifecycle%20%26%20Versioning%20Reference.md).

**Two structural rules, no exceptions:**
1. `app:policy_registry` has exactly one writer — Enrichment & Posting. No Engine, no Orchestrator path, no other workflow ever writes it.
2. `app:audit_log` is append-only. Every component writes to it via `salus_write_audit` (no exceptions), but **no component has an UPDATE or DELETE path** to it — enforced structurally, not by convention.

## Agent & Hybrid State Schemas

### Salus Assistant Orchestrator

| Key | Scope & Lifetime | Description |
| :--- | :--- | :--- |
| `user:assistant_response_rules` | User, persistent, configured | Response-composition and citation rules. |
| `[no prefix]` | Session | `assistant_state`, `page_context`, `resolved_intent`, `access_scope`, `grounding_results`, `citation_set`, `answer_status`. |
| `temp:grounding_payloads` | Temporary, discarded after turn | Raw grounding-service responses before citation composition. |

Reads `app:policy_registry`, `app:kpi_snapshot_store`, `app:contract_requirements_register`, `app:exclusions_register`, `app:news_signals`, `app:user_scope_registry` per index above. Read path only.

### Field Extraction & Validation Routing

| Key | Scope & Lifetime | Description |
| :--- | :--- | :--- |
| `app:validation_queue` | Application, persistent | Sole writer. Low-confidence/missing fields queued for human review. |
| `user:extraction_confidence_config` | User, persistent, configured | Per-field confidence thresholds and overrides. |
| `[no prefix]` | Session | `ingestion_id`, `document_class`, `extraction_draft`, `field_confidence_map`, `queued_exceptions`, `questionnaire_draft`, `validation_status` (`PENDING`/`CONFIRMED`), `validated_record`. |
| `temp:extraction_raw` | Temporary, discarded after turn | Raw OCR/NLP output before confidence scoring. |

Reads `app:document_store` (written by Intake & Classification).

### News & Sector Intelligence Agent (V2)

| Key | Scope & Lifetime | Description |
| :--- | :--- | :--- |
| `app:news_signals` | Application, persistent | Sole writer. Classified, entity-linked emerging-risk signals. |
| `user:news_relevance_config` | User, persistent, configured | Tuned by dismissed-signal history (FR6.9). |
| `[no prefix]` | Session | `news_batch`, `signal_draft`, `signal_review_status` (`PENDING`/`CONFIRMED`/`DISMISSED`). |

Reads `app:entity_site_master` for entity-linking. No `temp:` key.

## Deterministic Component State (grouped)

| Component | Key(s) | Notes |
| :--- | :--- | :--- |
| Intake & Classification | Session: `ingestion_id`, `document_class`, `intake_status` | Sole writer of `app:document_store`. Assigns `ingestion_id` at `salus_upload_document`. |
| Enrichment & Posting | Session: `validated_record`, `enrichment_result`, `posted_version_id`, `recalc_trigger_set` · `temp:fx_lookup` | Sole writer of `app:policy_registry` (rule 1 above). Calls `salus_post_record` only on Posting Convergence; triggers all three Engines. |
| Coverage & Ratio, Risk Scoring, Contract Compliance Engines | Session (shared pattern, one instance per engine): `computation_inputs`, `computed_snapshot`, `config_version_id` | All three read `app:config_versions` and write `app:kpi_snapshot_store`; Contract Compliance additionally writes `app:contract_requirements_register` and `app:exclusions_register`. |

Alerts & Notification, Reporting & Export, Config Change-Control, and Audit & Access Log hold no session-state keys — they operate through the `app:` keys above (`app:alert_trigger_table`, `app:config_versions`, `app:audit_log`) plus, for Reporting & Export, `user:reporting_templates` and `temp:render_buffer`.

## `user:` Keys — User Scope, Persistent, Configured

Never agent-written. `user:assistant_response_rules` (Orchestrator) · `user:extraction_confidence_config` (Field Extraction) · `user:news_relevance_config` (News) · `user:notification_preferences` (Alerts) · `user:reporting_templates` (Reporting & Export).

## `temp:` Keys — Discarded After Turn

`temp:grounding_payloads` (Orchestrator) · `temp:extraction_raw` (Field Extraction) · `temp:fx_lookup` (Enrichment & Posting) · `temp:driver_breakdown` (Risk Scoring) · `temp:conflict_candidates` (Contract Compliance) · `temp:render_buffer` (Reporting & Export).

## Convergence Formulas

$$\text{Validation Convergence} = \left( \text{validated\_record} \neq \emptyset \right) \land \left( \text{validation\_status} = \text{CONFIRMED} \right) \land \left( \text{mandatory fields unconfirmed} = \emptyset \right)$$
Gates `salus_submit_validation` — a field is never fact, or fed to a KPI, until this holds (§9.1).

$$\text{Posting Convergence} = \text{Validation Convergence} \land \left( \text{enrichment\_result} = \text{SUCCESS} \right) \land \left( \text{posted\_version\_id} \neq \emptyset \right) \land \left( \text{audit entry written} \right)$$
Gates `salus_post_record` — sole trigger for Engine recompute.

$$\text{Snapshot Convergence} = \left( \text{computed\_snapshot} \neq \emptyset \right) \land \left( \text{config\_version\_id} \neq \emptyset \right) \land \left( \text{as\_of\_date bound} \right)$$
Gates every Engine write to `app:kpi_snapshot_store` — no snapshot writes without a bound config version (§10.3).

$$\text{Answer Convergence} = \left( \text{access\_scope} \neq \emptyset \right) \land \left( \text{grounding\_results} \neq \emptyset \right) \land \left( \text{citation\_set} \neq \emptyset \right)$$
Gates the Orchestrator's answer — unmet, it returns the FR8.5 fallback rather than guess.

$$\text{Signal Convergence} = \left( \text{signal\_draft} \neq \emptyset \right) \land \left( \text{signal\_review\_status} \in \{ \text{CONFIRMED}, \text{DISMISSED} \} \right)$$
Gates whether a News signal may feed `app:news_signals` as a Risk Scoring input — never auto-applies (FR6.9).
