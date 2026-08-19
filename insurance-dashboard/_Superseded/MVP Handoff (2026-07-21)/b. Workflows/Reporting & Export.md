# Workflow Specification: Reporting & Export

> **Workflow, MVP (inferred).** Template fill, render to PDF/Excel — deterministic document generation, no judgement calls. Produces the Board/leadership insurance pack, renewal forecast, coverage-gap register, and audit lineage report (§12.2).
>
> **Companion docs:** trigger context — [`Alerts & Notification.md`](Alerts%20%26%20Notification.md). Redaction guardrail — [`../d. Reference/Atlas Reference - RBAC & Access Scoping.md`](../d.%20Reference/Atlas%20Reference%20-%20RBAC%20%26%20Access%20Scoping.md). Output shapes — [`../c. State/Atlas - Output Templates.md`](../c.%20State/Atlas%20-%20Output%20Templates.md).

## 1. Core Mandate & Operational Objectives
You generate four output types — Board/leadership insurance pack, renewal forecast, coverage-gap register, and audit lineage document — on demand or on a schedule, to PDF or Excel (§12.2). You read from the grounding engines' current state; you never compute a KPI, risk score, or compliance status yourself — that belongs to the Coverage & Ratio, Risk Scoring, and Contract Compliance Engines.

**Capabilities:** template-fill each output type from `app:kpi_snapshot_store`, `app:contract_requirements_register`, `app:exclusions_register`, `app:policy_registry`, and `app:audit_log` (lineage output only); render to PDF/Excel; apply role-based PII redaction and export restriction before output leaves the system (§13); dispatch on demand (`atlas_generate_report`) or on a configured schedule.

## 2. State Management
Full schema: [`../c. State/Atlas - Google ADK State Reference.md`](../c.%20State/Atlas%20-%20Google%20ADK%20State%20Reference.md). Reads `app:kpi_snapshot_store`, `app:contract_requirements_register`, `app:exclusions_register`, `app:policy_registry`, `app:document_store`, `app:user_scope_registry` (for redaction), `app:audit_log` (lineage output only). Writes `temp:render_buffer` during generation (discarded after the turn) and an `atlas_write_audit` entry on every export. Reads `user:reporting_templates` for saved layout preferences.

## 3. Release Status — Architecture Plan's Own Inference
§6 of the PRD carries **no explicit release tag** for this component — §12.2 (channels, scheduled reports, export formats) has no MoSCoW/Release column at all, unlike the numbered FR sections. Its MVP placement in this doc set is the Architecture Plan's own inference (§10, Architecture Plan), reasoned from two things: the content is meaningless without the MVP-2 engines (Coverage & Ratio, Risk Scoring, Contract Compliance) already feeding it, and the §3 "Decision speed" success metric — reducing time to produce a Board/audit insurance pack from days to hours — implies the pack is wanted from go-live, not deferred to V2. Treat this placement as inferred, not PRD-sourced, if it is ever challenged.

## 4. Deterministic Execution Flow
```
[Entry: atlas_generate_report — on demand or scheduled]
                 │
                 ▼
[Node 1: Source Read] ──► Pulls current KPI/risk/compliance snapshots,
                           requirement & exclusion registers, policy records
                 │
                 ▼
[Node 2: Role-Based Redaction] ──► Masks named-individual PII per caller's
                                    role; restricts source-doc export (§13)
                 │
                 ▼
[Node 3: Template Fill & Render] ──► Board pack / renewal forecast /
                                      coverage-gap register / audit
                                      lineage → PDF or Excel
                 │
                 ▼
[Output: rendered file] ──► Delivered on demand or per schedule;
                             writes audit entry
```

## 5. PII Redaction & Export Restriction — Unowned Guardrail
Policy documents (D&O, GPA, workmen's compensation) carry named individuals' personal data (§13). Every generated output applies role-based masking, and export of underlying source documents is restricted to authorised roles only. **This guardrail has no single owner across the architecture** (§08, Architecture Plan) — the Orchestrator's composed answers, the ingestion pipeline's stored records, and this component's generated outputs each apply it independently, with no shared redaction service named in either source document. Flag this as an open item: until an owner is assigned, this component's redaction logic and the Orchestrator's redaction logic risk drifting apart on the same underlying rule.

**Scope decision (sponsor, 21 Jul 2026):** deferred, not resolved. In-scope Atlas source documents are not expected to carry named-individual personal data in practice; this guardrail stays flagged rather than assigned an owner. Revisit before onboarding any line (e.g. D&O, GPA, workmen's compensation) where that assumption doesn't hold.

## 6. MCP Task-Tool Bindings
| Tool | Sole caller | Precondition |
| :--- | :--- | :--- |
| `atlas_generate_report` | Reporting & Export | On demand or scheduled |
| `atlas_get_lineage` | Atlas Assistant Orchestrator, Reporting & Export | Record ID in scope (audit lineage output) |
| `atlas_write_audit` | Every component | Every export |

## 7. Failure & Denial Handling
| State | Behaviour |
| :--- | :--- |
| Caller role lacks source-document export rights | Output generates with redacted/omitted source-document sections; caller notified which sections were withheld |
| Source snapshot stale or mid-recompute | Generation waits for Snapshot Convergence on the affected engine, or renders with an "as-of" timestamp older than expected — never silently mixes partial and current data |
| Scheduled run fails (render error, source unavailable) | No partial file delivered; failure logged; retried on next scheduled window, not immediately in a loop |
| Requested output type has no data for the period | Renders an empty-state document explicitly, not a blank/broken file |
| Export requested by a role with no read access to the underlying register | Denied outright — not redacted, refused |
