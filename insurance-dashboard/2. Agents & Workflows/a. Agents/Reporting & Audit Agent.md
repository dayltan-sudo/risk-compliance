# System Instruction: Reporting & Audit Agent

> **Deterministic, MVP (inferred) + day-one NFR. No LLM in the loop, no judgement calls (§02).** Template-fill/render is deterministic document generation; audit logging is a pass-through interceptor every write goes through. Merged into one subagent because both are read-only-over-everything-else output surfaces: one renders current state to a document, the other is the permanent record of every state change any component ever made — the audit lineage report (§4) is, in fact, this agent reading its own other half. Formerly two separate workflow specs — **Reporting & Export**, **Audit & Access Log**.
>
> **Companion docs:** Redaction guardrail — [`../d.%20Reference/Atlas%20Reference%20-%20RBAC%20%26%20Access%20Scoping.md`](../d.%20Reference/Atlas%20Reference%20-%20RBAC%20%26%20Access%20Scoping.md). Output shapes — [`../c.%20State/Atlas%20-%20Output%20Templates.md`](../c.%20State/Atlas%20-%20Output%20Templates.md). Versioning guarantees this backs — [`../c.%20State/Atlas%20-%20Data%20Lifecycle%20%26%20Versioning%20Reference.md`](../c.%20State/Atlas%20-%20Data%20Lifecycle%20%26%20Versioning%20Reference.md). State schema — [`../c.%20State/Atlas%20-%20Google%20ADK%20State%20Reference.md`](../c.%20State/Atlas%20-%20Google%20ADK%20State%20Reference.md). Trigger context — [`Atlas Assistant Orchestrator.md`](Atlas%20Assistant%20Orchestrator.md) §11.

## 1. Core Mandate & Operational Objectives
Two functions:

1. **Reporting & Export (§3)** — generates four output types (Board/leadership insurance pack, renewal forecast, coverage-gap register, audit lineage document) on demand or on a schedule, to PDF or Excel (§12.2). Reads from the grounding engines' current state; never computes a KPI, risk score, or compliance status itself — that belongs to the Coverage, Risk & Compliance Engines Agent.
2. **Audit & Access Log (§4)** — the immutable, time-stamped log of every data change, validation action, export, and access event across Atlas (§13). Every other component writes here via `atlas_write_audit` — no exceptions, no component decides for itself whether an event is worth logging. No judgement to exercise: records what happened, when, and by whom.

The two functions are not independent: one of Reporting & Export's four output types (the audit lineage document) is a direct read of §4's own log, and every render §3 produces triggers a §4 write. Packaging them as one subagent removes a call that would otherwise cross a component boundary for no reason.

## 2. State Management
See [`Atlas - Google ADK State Reference.md`](../c.%20State/Atlas%20-%20Google%20ADK%20State%20Reference.md) for the full schema.

**Reads (Reporting & Export):** `app:kpi_snapshot_store`, `app:contract_requirements_register`, `app:exclusions_register`, `app:policy_registry`, `app:document_store`, `app:user_scope_registry` (for redaction), `app:audit_log` (lineage output only). `user:reporting_templates` for saved layout preferences.

**Writes:** `temp:render_buffer` during generation (discarded after the turn). `app:audit_log` — **this agent is the sole owner** of this key; every other component in the architecture writes to it via `atlas_write_audit`, none of them read each other's entries directly, only through this agent's read path (§4.3).

**No session-state keys of its own beyond the temp buffer** — this agent operates entirely through the `app:` keys above plus `user:reporting_templates`.

## 3. Reporting & Export
You generate four output types on demand or on a schedule, to PDF or Excel (§12.2).

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
Trigger: `atlas_generate_report`, sole caller this agent, on demand or scheduled.

**Release status — inferred, not PRD-sourced.** §6 of the PRD carries no explicit release tag for Reporting & Export — §12.2 (channels, scheduled reports, export formats) has no MoSCoW/Release column at all, unlike the numbered FR sections. Its MVP placement is the Architecture Plan's own inference (§10, Architecture Plan), reasoned from two things: the content is meaningless without the Coverage, Risk & Compliance Engines Agent already feeding it, and the §3 "Decision speed" success metric — reducing time to produce a Board/audit insurance pack from days to hours — implies the pack is wanted from go-live, not deferred to V2. Treat this placement as inferred if it is ever challenged.

**PII redaction & export restriction — unowned guardrail.** Policy documents (D&O, GPA, workmen's compensation) carry named individuals' personal data (§13). Every generated output applies role-based masking, and export of underlying source documents is restricted to authorised roles only. **This guardrail has no single owner across the architecture** (§08, Architecture Plan) — the Orchestrator's composed answers, Field Extraction & Validation Routing's stored/posted records, and this agent's generated outputs each apply it independently, with no shared redaction service named anywhere. Flag this as an open item: until an owner is assigned, this agent's redaction logic and the Orchestrator's redaction logic risk drifting apart on the same underlying rule.

**Scope decision (sponsor, 21 Jul 2026):** deferred, not resolved. In-scope Atlas source documents are not expected to carry named-individual personal data in practice; this guardrail stays flagged rather than assigned an owner. Revisit before onboarding any line (e.g. D&O, GPA, workmen's compensation) where that assumption doesn't hold.

**Failure & denial handling:**

| State | Behaviour |
| :--- | :--- |
| Caller role lacks source-document export rights | Output generates with redacted/omitted source-document sections; caller notified which sections were withheld |
| Source snapshot stale or mid-recompute | Generation waits for Snapshot Convergence on the affected engine, or renders with an "as-of" timestamp older than expected — never silently mixes partial and current data |
| Scheduled run fails (render error, source unavailable) | No partial file delivered; failure logged; retried on next scheduled window, not immediately in a loop |
| Requested output type has no data for the period | Renders an empty-state document explicitly, not a blank/broken file |
| Export requested by a role with no read access to the underlying register | Denied outright — not redacted, refused |

## 4. Audit & Access Log
You have no judgement to exercise: you record what happened, when, and by whom. Every other component — Field Extraction & Validation Routing (all its flows, including the absorbed intake and enrichment/posting stages), the Coverage, Risk & Compliance Engines Agent (all four functions), the News & Sector Intelligence Agent, and the Orchestrator's access gate and alert dispatch — writes to you; none of them read each other's audit entries directly, only through your read path.

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

**Structural immutability.** Append-only is not a policy on top of a mutable table — it is enforced at the database/permissions layer: no role, including Admin, holds `UPDATE` or `DELETE` grants on `app:audit_log` in normal operation. This is deliberate: FR3.7's "never silently overwrite" and §10.3's point-in-time snapshot guarantee both rely on versioning happening correctly in each individual component; this log is what remains true even if one of those components' own versioning logic is ever wrong or disputed. It does not depend on any other component's correctness to hold.

### 4.3 Read Access — Broader Than Auditors Alone
| Role | Access |
| :--- | :--- |
| Group Insurance | Read |
| R&C Manager | Read |
| Treasury | Read |
| Auditor | Read |
| Admin | Full access |
| Entity Risk Champion | None |

Every read is itself an access event and is logged by this same function — reading the audit trail generates an audit trail entry.

**Retention.** Retained indefinitely under normal operation (§13) — the audit clock, unlike the renewal-cycle and regulatory-retention clocks that govern other state categories, does not prune during normal operation at all. Nothing is purged from `app:audit_log` short of a formal records-disposal process outside Atlas's own normal operation.

**Failure & denial handling:**

| State | Behaviour |
| :--- | :--- |
| A component fails to call `atlas_write_audit` on a write | Treated as a defect in the calling component, not a tolerated gap — every write path is expected to log unconditionally |
| Attempted `UPDATE`/`DELETE` against `app:audit_log` | Rejected at the database/permissions layer regardless of caller role, including Admin |
| Read requested by Entity Risk Champion | Denied — §4.2 grants no audit-trail access to this role |
| Read requested by an unrecognised or unscoped role | Denied by default — least-privilege; no implicit read |
| Log write during a downstream outage (e.g., notification delivery fails) | Audit entry for the attempt is still written; the log is independent of whether the logged action itself succeeded |

## 5. MCP Task-Tool Bindings
| Tool | Function | Sole caller | Precondition |
| :--- | :--- | :--- | :--- |
| `atlas_generate_report` | Reporting & Export | This agent | On demand or scheduled |
| `atlas_get_lineage` | Reporting & Export (reads) | Atlas Assistant Orchestrator, this agent | Record ID in scope (audit lineage output, or Orchestrator citations) |
| `atlas_write_audit` | Audit & Access Log | Every component | Every write, validation, export, and access event — no exceptions |
