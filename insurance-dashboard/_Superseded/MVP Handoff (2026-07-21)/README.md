# Salus — MVP Implementation Handoff

Everything needed to build the first cut of **Salus** (Keppel Global Insurance Monitoring System). No prior context assumed — this folder is a complete, buildable subset of a larger design; nothing here references material you don't have.

## What Salus is

A group-wide platform consolidating every insurance policy across Keppel's legal entities, countries, and sites into one dashboard. It ingests broker/policy documents, extracts key terms with human-in-the-loop validation, computes coverage and risk ratios, tracks third-party contractual insurance obligations against what's actually placed, flags policy exclusions that undermine those obligations, and answers natural-language questions over live data — all fully traceable back to source documents for audit.

## Scope: what's in, what's deliberately out

This is **MVP only** — 10 of 12 designed components, plus every shared schema/reference doc they depend on. Excluded entirely: **News & Sector Intelligence Agent** and **Config Change-Control**, both V2. A few MVP docs also carry inline notes flagging a V2-only sub-feature (e.g. "configurable thresholds are V2," "auto-recalc-on-change is V2") — those notes tell you what *not* to build yet; don't skip them.

One consequence worth flagging up front: the three calculation engines (below) read a `config_version_id`, but the workflow that lets someone *propose and approve* a new one (Config Change-Control) isn't in this build. At MVP, treat thresholds/weights as the fixed defaults in the KPI Formulas reference — no change-approval UI yet.

## How this folder is organized

| Folder | Contents |
| :--- | :--- |
| `a. Agents/` | The 2 components needing an LLM, plus 1 hybrid. `- Flows.md` companions carry full flow diagrams. |
| `b. Workflows/` | The 8 deterministic components — standard software engineering, no LLM. |
| `c. State/` | Shared schema: state keys and their owners, data lifecycle/versioning/retention rules, worked output examples. |
| `d. Reference/` | Formulas, field lists, and tables the workflows compute against. |

**Read order:** this doc → `Salus - Google ADK State Reference.md` → `Salus - Data Lifecycle & Versioning Reference.md` → each component doc in build-sequence order (below).

## The 10 MVP components

| Component | Type | Does | Doc |
| :--- | :--- | :--- | :--- |
| Intake & Classification | Workflow | Accepts uploads, virus-scans, detects document type | [doc](b.%20Workflows/Intake%20%26%20Classification.md) |
| Field Extraction & Validation Routing | Hybrid | OCR/IDP extraction + human review queue | [doc](a.%20Agents/Field%20Extraction%20%26%20Validation%20Routing.md) |
| Enrichment & Posting | Workflow | FX/geocode enrichment, versioned write, triggers recalculation | [doc](b.%20Workflows/Enrichment%20%26%20Posting.md) |
| Coverage & Ratio Engine | Workflow | Computes the §7 KPIs (ITV, coverage gap, TCOR, etc.) | [doc](b.%20Workflows/Coverage%20%26%20Ratio%20Engine.md) |
| Risk Scoring Engine | Workflow | Composite 0–100 risk score, driver breakdown | [doc](b.%20Workflows/Risk%20Scoring%20Engine.md) |
| Contract Compliance Engine | Workflow | Requirement-vs-placed status + exclusion override | [doc](b.%20Workflows/Contract%20Compliance%20Engine.md) |
| Salus Assistant Orchestrator | Agent | Conversational Q&A over live data, with citations | [doc](a.%20Agents/Salus%20Assistant%20Orchestrator.md) |
| Alerts & Notification | Workflow | Trigger-table evaluation, recipient/channel routing | [doc](b.%20Workflows/Alerts%20%26%20Notification.md) |
| Reporting & Export | Workflow | Board pack, renewal forecast, gap register, PDF/Excel | [doc](b.%20Workflows/Reporting%20%26%20Export.md) |
| Audit & Access Log | Infra | Immutable log every component writes to | [doc](b.%20Workflows/Audit%20%26%20Access%20Log.md) |

## Agent vs. workflow — why the split matters

Only 2 components (+1 hybrid) need an LLM; they need prompt design, an evaluation harness, and human-in-the-loop review before go-live. The other 8 are deterministic — build and test them like ordinary software. This is deliberate, not an oversight: the calculation engines especially need exact, reproducible lineage (every KPI traces to its inputs, formula, and timestamp), which is an argument *against* putting a model near the math.

## Five guardrails every component must obey

1. **Validation gate** — a field stays `unconfirmed`, excluded from every KPI, until a human validates it.
2. **Never silently overwrite** — every change is a new version; prior values stay retrievable with an audit entry.
3. **Entity/site scoping** — filter the *request* by the caller's role/entity before it reaches data, not the response after.
4. **News is advisory only** — N/A in this MVP build (News agent is V2), but if any signal-like data reaches the Risk Scoring Engine later, it must never auto-change coverage/KPI data.
5. **Role-based PII redaction** — **deferred by sponsor decision** (21 Jul 2026): in-scope documents aren't expected to carry named-individual data. Flag before adding any line (D&O, GPA, workmen's comp) where that assumption breaks.

## Build sequence

| Order | Build |
| :--- | :--- |
| 1 | Intake & Classification → Field Extraction & Validation Routing → Enrichment & Posting |
| 2 | Coverage & Ratio, Risk Scoring, Contract Compliance engines |
| 3 | Alerts & Notification, Reporting & Export, Audit & Access Log |
| 4 | Salus Assistant Orchestrator — needs 1–3 built first; it has nothing to query otherwise |

## Decisions settled 21 Jul 2026 — build against these, not earlier drafts

| Area | Decision |
| :--- | :--- |
| Manual questionnaire (no source doc) | Maker-checker: a *different* user must confirm every field before it posts. New tool `salus_submit_questionnaire`. |
| Alert releases | Renewal due + Low-confidence extraction → MVP. Coverage gap, Carrier downgrade, Aggregate erosion, New high-risk hotspot → V2. |
| Low-confidence extraction | Reviewer can open the source document and confirm/adjust a field's confidence level, not just its value. |
| KPI / risk-score storage | Formal entities: **KPI / Risk Score Snapshot** and **Configuration Version** — field lists in the Data Lifecycle reference. |
| Data retention | Regulatory retention: indefinite for now. Claims: tracked until settlement, even past policy expiry. |

## Still open — ask before building around it

**PII redaction ownership** is deferred, not resolved (guardrail 5 above). Everything else from the original open-items list is settled.

## Questions

Route to Dayl / the R&C sponsor. Full doc set (including V2 components) lives one level up in `2. Agents & Workflows/`.
