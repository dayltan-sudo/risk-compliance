# Salus Reference — Risk Score Drivers

> **Reference, §10.** The full §10 driver table, scoring approach, outputs, and configuration change control. Computed by [`../b.%20Workflows/Risk%20Scoring%20Engine.md`](../b.%20Workflows/Risk%20Scoring%20Engine.md). **Companion docs:** engine — [`../b.%20Workflows/Risk%20Scoring%20Engine.md`](../b.%20Workflows/Risk%20Scoring%20Engine.md). Underlying KPIs — [`Salus Reference - KPI Formulas.md`](Salus%20Reference%20-%20KPI%20Formulas.md).

## Driver table (§10)
Default weights are proposed; all configurable (FR4.5) and every score is explainable (FR4.4).

| Driver | What it measures | Default weight | Source |
| :--- | :--- | :--- | :--- |
| Coverage gap severity | Size of coverage shortfall vs. requirement, by line (§7.1) | 28% | Coverage & Ratio Engine (KPI) |
| Uninsured / under-insured TIV | Value at risk not covered | 18% | Coverage & Ratio Engine (KPI) |
| Natural-catastrophe exposure | Flood / quake / windstorm index for the location | 14% | `app:risk_indices` (external) |
| Political / sanctions / country risk | Country-risk rating and sanctions exposure | 10% | `app:risk_indices` (external) |
| Adverse claims history | Claims frequency × severity | 9% | Coverage & Ratio Engine (KPI) |
| Carrier credit quality & concentration | Sub-investment-grade and single-carrier reliance | 8% | Coverage & Ratio Engine (KPI) |
| Emerging risk signal (news-driven) | Sector/geography news signals affecting the asset (§6.6) | 8% | `app:news_signals` (external, V2) |
| Mandatory-cover non-compliance | Missing statutory/board-mandated covers | 5% | Coverage & Ratio Engine (KPI) |

Weights sum to 100%. Five drivers are KPIs Coverage & Ratio Engine already computes; only nat-cat, political/country risk, and the news signal are externally sourced with their own refresh cadence — see [`Risk Scoring Engine.md`](../b.%20Workflows/Risk%20Scoring%20Engine.md) §4.

The emerging-risk-signal weight (8%) links the V2 News & Sector Intelligence capability (§6.6) into the score. It is configurable and may be set to zero for entities or lines with sparse news coverage — the composite score still computes on the remaining seven drivers, re-normalised is not required since weights are additive.

## §10.1 Scoring approach
1. Normalise each driver to a 0–100 sub-score using a defined band (e.g. coverage gap % mapped to a curve).
2. Weighted-sum the sub-scores to a composite 0–100 score.
3. Assign a band: Low (0–39) / Medium (40–69) / High (70–84) / Critical (85–100) — thresholds configurable.
4. Recompute whenever underlying data changes (MVP); recompute on weight change is a separate, V2 capability (FR4.5).

## §10.2 Outputs
- Ranked "Top exposures" table (highest score first), filterable by insurance line and dimension.
- Geographic heat map shaded by composite score.
- Per-row driver breakdown explaining what pushed the score up and by how much (FR4.4).

## §10.3 Configuration change control
KPI thresholds (FR2.5), risk-score weights (FR4.5), and risk-appetite thresholds are all configurable post-launch via Config Change-Control (Should/V2). Because these settings directly affect what leadership, auditors, and the Board see as "high risk," changes carry an owner and a paper trail:

- **Change process:** proposed changes are logged with rationale, reviewed by an owner (TBC), and approved before taking effect; approval is captured in `app:audit_log`.
- **Versioning:** each change creates a new dated version in `app:config_versions`. **Historical KPI and risk-score values retain the weights/thresholds in effect when they were calculated** — a later reweighting never silently rewrites history. This is the Snapshot Convergence rule Risk Scoring Engine enforces on every write.
- **Review cadence:** weights and thresholds reviewed at least annually, or earlier on a material change in the risk environment (new peril category, regulatory requirement).
