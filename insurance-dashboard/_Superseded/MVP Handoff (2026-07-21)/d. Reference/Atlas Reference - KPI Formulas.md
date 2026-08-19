# Atlas Reference — KPI Formulas

> **Reference, §7.** The full PRD §7 KPI specification, reproduced faithfully. Computed by [`../b.%20Workflows/Coverage%20%26%20Ratio%20Engine.md`](../b.%20Workflows/Coverage%20%26%20Ratio%20Engine.md) on FX-normalised values with full lineage (FR2.1–FR2.4). **Companion docs:** engine — [`../b.%20Workflows/Coverage%20%26%20Ratio%20Engine.md`](../b.%20Workflows/Coverage%20%26%20Ratio%20Engine.md). Risk drivers built on these — [`Atlas Reference - Risk Score Drivers.md`](Atlas%20Reference%20-%20Risk%20Score%20Drivers.md).

All thresholds below are proposed defaults for sponsor confirmation, configurable per KPI per FR2.5 (Should/V2 — fixed at MVP).

## §7.1 Coverage adequacy
| Ratio | Formula | Target / threshold |
| :--- | :--- | :--- |
| Insurance-to-Value (ITV) | Sum Insured ÷ Total Insurable Value | ≈100%; flag <90% under / >110% over |
| Limit-to-PML | Policy Limit ÷ Probable Maximum Loss | ≥1.0; flag if limit < PML |
| Coverage Gap % | (Required − Placed) ÷ Required | 0%; flag any positive gap |
| BI Adequacy | BI Sum Insured ÷ Annual Gross Profit (+ indemnity period vs. restoration time) | ≥100% and period ≥ restoration |
| Peril Sublimit Adequacy | Peril Sublimit ÷ Peril PML | ≥1.0 per modelled peril |
| Mandatory Cover Compliance % | Compliant entities/sites ÷ total in scope | 100% |

## §7.2 Risk retention
| Ratio | Formula | Target / threshold |
| :--- | :--- | :--- |
| Retention / Deductible Ratio | Deductible (or SIR) ÷ Sum Insured | Within risk-appetite band [TBC] |
| Aggregate Retained Exposure | Σ retained layers / SIRs across programme | ≤ risk appetite [TBC] |
| Aggregate Limit Erosion | Claims paid vs. aggregate ÷ Aggregate limit | Alert at >70% eroded |

## §7.3 Cost efficiency
| Ratio | Formula | Target / threshold |
| :--- | :--- | :--- |
| Rate on Line (RoL) | Premium ÷ Limit | Benchmark vs. prior year |
| Premium Rate | Premium ÷ Sum Insured (per mille) | Benchmark by line/region |
| Premium-to-Revenue | Total Premium ÷ Revenue | Track trend |
| Total Cost of Risk (TCOR) % | (Premiums + Retained losses + Risk-mgmt costs + Fees) ÷ Revenue | Minimise; track trend |
| YoY Premium Change % | (Premium − Prior premium) ÷ Prior premium | Explain variances |

## §7.4 Claims / loss experience
| Ratio | Formula | Target / threshold |
| :--- | :--- | :--- |
| Loss Ratio | Incurred Claims ÷ Earned (or Paid) Premium | Monitor; alert >100% |
| Claims Frequency | Number of claims ÷ exposure unit | Track by line/site |
| Claims Severity | Total claim cost ÷ Number of claims | Track by line/site |
| Open vs. Closed / Settlement time | Counts and average days to settle | Track ageing |

## §7.5 Concentration & counterparty risk
| Ratio | Formula | Target / threshold |
| :--- | :--- | :--- |
| Carrier Concentration | % of sum insured / premium per insurer | Alert if single carrier > [25%] |
| Carrier Credit Quality | Exposure-weighted avg rating; % sub-investment-grade | Flag sub-investment-grade exposure |
| Broker Concentration | % of premium per broker | Monitor |
| Geographic Concentration | TIV/Sum insured per country; % in high-risk countries | Monitor concentration |
| Line-of-Business Concentration | Exposure split by insurance line | Monitor |

## §7.6 Programme continuity & governance
| Ratio | Formula | Target / threshold |
| :--- | :--- | :--- |
| Renewal Pipeline | Policies & sum insured expiring in 30/60/90 days | All actioned ≥60 days pre-expiry |
| Coverage Continuity / Lapse Risk | Entities/sites with gaps in continuous cover | Zero lapses |
| Data Completeness & Confidence | % policies with all mandatory fields captured & validated | ≥90% |

## §7.7 Contractual compliance
| Ratio | Formula | Target / threshold |
| :--- | :--- | :--- |
| Contractual Requirement Coverage Ratio | Placed Limit ÷ Contractually Required Limit (per requirement) | 100%; flag <100% Gap, 90–100% At-risk |
| Open Contractual Gaps | Count and S$ value of requirements below 100% of required limit | Zero open gaps |

Computed by [`Contract Compliance Engine.md`](../b.%20Workflows/Contract%20Compliance%20Engine.md), not this engine — listed here for §7 completeness only.

## §7.8 Exclusion & conflict detection
| Ratio | Formula | Target / threshold |
| :--- | :--- | :--- |
| Exclusion Conflict Count | Count of exclusions flagged as conflicting with an open Contract Requirement | Zero open conflicts |
| Full-Exclusion Share | Full exclusions ÷ total exclusions tracked | Monitor; investigate concentration by peril |

Also computed by [`Contract Compliance Engine.md`](../b.%20Workflows/Contract%20Compliance%20Engine.md) — listed here for §7 completeness only.
