# Atlas Reference: Alert Triggers

> PRD §12.1's alert table reproduced faithfully, annotated with traceable FR/release where the PRD provides one. §12.1 itself carries **no per-row MoSCoW/release column** — only three of the nine rows trace to a numbered FR elsewhere in the document. The remaining six carry a release only because the sponsor assigned one directly on 21 Jul 2026 — not because a PRD requirement was located for them.
>
> **Companion docs:** routing logic — [`../a. Agents/Atlas Assistant Orchestrator.md`](../a.%20Agents/Atlas%20Assistant%20Orchestrator.md) §11 (Alerts & Notification, formerly a standalone workflow, now that agent's Flow F/G). State schema — [`../c. State/Atlas - Google ADK State Reference.md`](../c.%20State/Atlas%20-%20Google%20ADK%20State%20Reference.md).

## 1. Alert Table (PRD §12.1)
All nine alerts, trigger condition, default recipients — as written in the PRD, with a Traceable FR / Release column added by this reference.

| # | Alert | Trigger condition | Default recipients | Traceable FR | Release |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | Renewal due | Policy expiring in 90 / 60 / 30 days | Entity Champion, Group Insurance | *none in §12.1* | **MVP** (sponsor decision) |
| 2 | Coverage gap | ITV < threshold or positive coverage gap detected | R&C Manager, Group Insurance | *none in §12.1* | **V2** (sponsor decision) |
| 3 | Low-confidence extraction — see §1.1 | Document fields fall below confidence threshold | Assigned validator | *none in §12.1* | **MVP** (sponsor decision) |
| 4 | Carrier downgrade | Carrier credit rating falls below threshold | Group Insurance | *none in §12.1* | **V2** (sponsor decision) |
| 5 | Aggregate erosion | Aggregate limit eroded beyond threshold | Group Insurance, R&C Manager | *none in §12.1* | **V2** (sponsor decision) |
| 6 | New high-risk hotspot | Entity/site enters High/Critical band | R&C Manager | *none in §12.1* | **V2** (sponsor decision) |
| 7 | Emerging risk / appetite breach | News-driven signal implies exposure beyond risk appetite or coverage | R&C Manager, Group Insurance | **FR6.8** | Must/**V2** |
| 8 | Contractual requirement gap | Placed limit falls below a third-party contractual requirement, or within its at-risk tolerance | Group Insurance Lead, R&C Manager, Entity Risk Champion | **FR7.5** | Must/**MVP** |
| 9 | Exclusion conflict | A policy exclusion undermines an open Contract Requirement | Group Insurance Lead, R&C Manager, Entity Risk Champion | **FR9.5** | Must/**MVP** |

### 1.1 Alert #3 cross-reference
Low-confidence extraction's human validation step also lets the reviewer confirm or adjust the extracted field's confidence level, not just its value — mechanism owned by [`../a. Agents/Field Extraction & Validation Routing.md`](../a.%20Agents/Field%20Extraction%20%26%20Validation%20Routing.md) (Flow E, Node 1a).

**Reading this table:** rows 8 and 9 remain the only triggers directly traceable to a Must/MVP functional requirement. Row 7 is traceable but to a V2 requirement — it cannot fire before `app:news_signals` exists, which depends on the News & Sector Intelligence Agent. Rows 1–6 have a trigger condition and recipients specified in §12.1 but no corresponding FR row anywhere in §6 — no functional requirement was found for them, and none should be inferred. Their Release values are explicit **sponsor decisions dated 21 Jul 2026**, assigned directly against this table rather than traced to a PRD requirement. See [`../a. Agents/Atlas Assistant Orchestrator.md`](../a.%20Agents/Atlas%20Assistant%20Orchestrator.md) §11 for how the Alerts function itself is scoped in light of this.

## 2. Channels & Reporting (PRD §12.2)

### 2.1 Notification channels
In-app, email, and Microsoft Teams — configurable per alert type and per user (`user:notification_preferences`).

### 2.2 Scheduled reports
| Report | Content |
| :--- | :--- |
| Board/leadership insurance pack | Group-wide coverage, risk, and cost summary for leadership/Board review |
| Renewal forecast | Policies and sum insured expiring in upcoming windows |
| Coverage-gap register | Open coverage gaps, contractual requirement gaps, and exclusion conflicts |
| Audit lineage report | Calculation lineage and audit-trail extract for a given record or period |

Produced by the Reporting & Export function of [`../a. Agents/Reporting & Audit Agent.md`](../a.%20Agents/Reporting%20%26%20Audit%20Agent.md) §3; this function's own MVP placement is likewise inferred, not PRD-tagged — see that section.

### 2.3 Export formats
PDF and Excel; distributed on demand or on schedule. Role-based PII redaction and source-document export restriction apply to every export regardless of format (§13) — see [`../d. Reference/Atlas Reference - RBAC & Access Scoping.md`](Atlas%20Reference%20-%20RBAC%20%26%20Access%20Scoping.md).

## 3. Cross-Reference to Upstream Registers
Each trigger reads from the register or engine that owns the underlying condition:

| Alert | Reads |
| :--- | :--- |
| Renewal due | `app:policy_registry` |
| Coverage gap | `app:kpi_snapshot_store` (Coverage & Ratio Engine) |
| Low-confidence extraction | `app:validation_queue` |
| Carrier downgrade | `app:risk_indices` |
| Aggregate erosion | `app:kpi_snapshot_store` |
| New high-risk hotspot | `app:kpi_snapshot_store` (Risk Scoring Engine) |
| Emerging risk / appetite breach | `app:news_signals` |
| Contractual requirement gap | `app:contract_requirements_register` |
| Exclusion conflict | `app:exclusions_register` |
