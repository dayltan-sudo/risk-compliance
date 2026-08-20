# Atlas — MVP Build Phase Plan

Agent names per `2. Agents & Workflows/`: Atlas Orchestrator, RiskScanner, Insurance DocAnalyst, CoverageAnalyst, InsuranceCustodian.

## MVP 1.1 — Foundation
| Component | Function |
| :--- | :--- |
| Atlas Orchestrator | Chat interface, prompt iteration (sandbox — not yet grounded on live data) |
| RiskScanner | News & sector intelligence, MVP baseline tier |
| InsuranceCustodian | Audit & Access Log |

Deliverable: chat interface + prompts + knowledge base, with a working audit trail.

## MVP 1.2 — Document pipeline
| Component | Function |
| :--- | :--- |
| Insurance DocAnalyst | Intake & Classification → Extraction → Confidence Routing → Human Validation |

**MVP 1 output:** field extraction with coordination and news enrichment.

## MVP 2 — Workflow
| Component | Function |
| :--- | :--- |
| Insurance DocAnalyst | Enrichment & Posting (FX, geocode, risk, entity/site mapping) |
| CoverageAnalyst | Coverage & Ratio, Risk Scoring, Contract Compliance |
| InsuranceCustodian | Reporting & Export (Template Fill) — confirm scope with sponsor before build |

## MVP 3 — Alerts & governance
| Component | Function |
| :--- | :--- |
| Atlas Orchestrator | Alerts & Notification (MVP triggers: Renewal due, Low-confidence extraction, Contractual requirement gap, Exclusion conflict) |
| CoverageAnalyst | Config Change-Control |

## V2
RiskScanner Stretch tier (impact scoring, appetite comparison, weighted risk-score input), remaining alert triggers, auto-recalc (FR7.6), reweight recompute (FR4.5), bulk/multi-language reprocessing (FR3.8).
