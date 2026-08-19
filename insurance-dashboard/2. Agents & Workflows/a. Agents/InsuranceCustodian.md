# System Instruction: InsuranceCustodian

> **Deterministic, mixed release. No LLM in the loop, no judgement calls (§02).** Two functions: Reporting & Export (template-fill/render, **V2**) and Audit & Access Log (**MVP**, the log every other write goes through). Packaged together because the audit lineage report — one of Reporting's four outputs — is a direct read of Audit's own log.
>
> **Companion docs:** Redaction guardrail — [`../d.%20Reference/Atlas%20Reference%20-%20RBAC%20%26%20Access%20Scoping.md`](../d.%20Reference/Atlas%20Reference%20-%20RBAC%20%26%20Access%20Scoping.md). Output shapes — [`../c.%20State/Atlas%20-%20Output%20Templates.md`](../c.%20State/Atlas%20-%20Output%20Templates.md). Versioning guarantees this backs — [`../c.%20State/Atlas%20-%20Data%20Lifecycle%20%26%20Versioning%20Reference.md`](../c.%20State/Atlas%20-%20Data%20Lifecycle%20%26%20Versioning%20Reference.md). State schema — [`../c.%20State/Atlas%20-%20Google%20ADK%20State%20Reference.md`](../c.%20State/Atlas%20-%20Google%20ADK%20State%20Reference.md). Trigger context — [`Atlas Orchestrator.md`](Atlas%20Orchestrator.md) §11.

## 1. Core Mandate & Operational Objectives
1. **Reporting & Export (§3, V2)** — generates four output types (Board/leadership insurance pack, renewal forecast, coverage-gap register, audit lineage document) on demand or schedule, to PDF or Excel (§12.2). Reads current state from the grounding engines; never computes a KPI, risk score, or compliance status.
2. **Audit & Access Log (§4, MVP)** — immutable, time-stamped log of every data change, validation action, export, and access event (§13). Every other component writes here via `atlas_write_audit`, unconditionally. No judgement to exercise: records what happened, when, by whom.

## 2. State Management
See [`Atlas - Google ADK State Reference.md`](../c.%20State/Atlas%20-%20Google%20ADK%20State%20Reference.md) for the full schema.

**Reads (Reporting & Export):** `app:kpi_snapshot_store`, `app:contract_requirements_register`, `app:exclusions_register`, `app:policy_registry`, `app:document_store`, `app:user_scope_registry` (redaction), `app:audit_log` (lineage output only). `user:reporting_templates` for saved layout preferences.

**Writes:** `temp:render_buffer` during generation (discarded after the turn). `app:audit_log` — **sole owner** of this key; every other component writes to it via `atlas_write_audit`, none read each other's entries directly, only through this agent's read path (§4.3).

**No session-state keys of its own beyond the temp buffer.**

## 3. Reporting & Export — V2
Generates four output types on demand or schedule, to PDF or Excel (§12.2). No explicit §6 PRD release tag.

### Flow A: Report Generation
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
                             writes audit entry (§4 Flow B)
```
Trigger: `atlas_generate_report`, sole caller this agent, on demand or scheduled. Rendered output unavailable until V2; the audit lineage output's underlying log (§4) is populated from MVP regardless.

**PII redaction & export restriction — unowned guardrail.** Policy documents (D&O, GPA, workmen's comp) carry named individuals' personal data (§13). Every generated output applies role-based masking; source-document export restricted to authorised roles. **No single owner across the architecture** — the Orchestrator's answers, Insurance DocAnalyst's stored records, and this agent's outputs each apply it independently. Sponsor decision (21 Jul 2026): deferred — in-scope documents aren't expected to carry named-individual data in practice; revisit before onboarding D&O, GPA, or workmen's-comp lines.

**Failure & denial handling:**

| State | Behaviour |
| :--- | :--- |
| Caller role lacks source-document export rights | Output generates with redacted/omitted source-document sections; caller notified which sections were withheld |
| Source snapshot stale or mid-recompute | Generation waits for Snapshot Convergence on the affected engine, or renders with an "as-of" timestamp older than expected — never silently mixes partial and current data |
| Scheduled run fails (render error, source unavailable) | No partial file delivered; failure logged; retried on next scheduled window, not immediately in a loop |
| Requested output type has no data for the period | Renders an empty-state document explicitly, not a blank/broken file |
| Export requested by a role with no read access to the underlying register | Denied outright — not redacted, refused |

## 4. Audit & Access Log — MVP
Every other component writes to you unconditionally; none read each other's audit entries directly, only through your read path.

### Flow B: Append-Only Audit Write
```
[Entry: atlas_write_audit — from any component]
                 │
                 ▼
[Node 1: Event Capture] ──► Actor, action, target record, timestamp
                 │
                 ▼
[Node 2: Append] ──► Insert-only write to app:audit_log — no UPDATE/
                      DELETE path exists at the permissions layer
                 │
                 ▼
[Output: audit entry, permanent] ──► Retained indefinitely; readable
                                      per §4.3's access scope
```

**Structural immutability.** No role, including Admin, holds `UPDATE`/`DELETE` grants on `app:audit_log` in normal operation — enforced at the database/permissions layer, not by convention.

### 4.3 Read Access — Broader Than Auditors Alone
| Role | Access |
| :--- | :--- |
| Group Insurance | Read |
| R&C Manager | Read |
| Treasury | Read |
| Auditor | Read |
| Admin | Full access |
| Entity Risk Champion | None |

Every read is itself an access event and is logged.

**Retention.** Indefinite under normal operation (§13) — does not prune. Nothing purged short of a formal records-disposal process outside Atlas's own operation.

**Failure & denial handling:**

| State | Behaviour |
| :--- | :--- |
| A component fails to call `atlas_write_audit` on a write | Treated as a defect in the calling component, not a tolerated gap |
| Attempted `UPDATE`/`DELETE` against `app:audit_log` | Rejected at the database/permissions layer regardless of caller role, including Admin |
| Read requested by Entity Risk Champion | Denied — §4.2 grants no audit-trail access to this role |
| Read requested by an unrecognised or unscoped role | Denied by default — least-privilege; no implicit read |
| Log write during a downstream outage (e.g., notification delivery fails) | Audit entry for the attempt is still written |

## 5. MCP Task-Tool Bindings
| Tool | Function | Release | Sole caller | Precondition |
| :--- | :--- | :--- | :--- | :--- |
| `atlas_generate_report` | Reporting & Export | V2 | This agent | On demand or scheduled |
| `atlas_get_lineage` | Reporting & Export (reads) | V2 | Atlas Orchestrator, this agent | Record ID in scope (audit lineage output, or Orchestrator citations) |
| `atlas_write_audit` | Audit & Access Log | **MVP** | Every component | Every write, validation, export, and access event — no exceptions |
