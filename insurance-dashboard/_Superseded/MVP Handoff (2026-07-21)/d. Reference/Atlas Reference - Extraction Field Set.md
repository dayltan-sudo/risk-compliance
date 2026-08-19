# Atlas Reference — Extraction Field Set

Reproduces PRD §8.2's policy data dictionary verbatim. Used by [`Field Extraction & Validation Routing.md`](../a.%20Agents/Field%20Extraction%20%26%20Validation%20Routing.md) to define what `atlas_extract_fields` must extract and score, and by [`Enrichment & Posting.md`](../b.%20Workflows/Enrichment%20%26%20Posting.md) to know which fields carry a field-level source-location pointer (FR3.6) once posted.

M = Mandatory, O = Optional. SOV = Statement of Values. Typical source shows the document type ingestion mapping expects; see [`../b.%20Workflows/Intake%20%26%20Classification.md`](../b.%20Workflows/Intake%20%26%20Classification.md) §5 for the six document classes.

| Group / field | Type | M/O | Typical source |
| :--- | :--- | :--- | :--- |
| **Identifiers** — policy no., endorsement no., status, version, master/programme ref | Text / enum | M | Schedule, slip |
| **Parties** — insured entity, additional insureds, carrier(s) + line share %, lead/follow, carrier rating, broker, broker contact | Text / % | M | Slip, schedule |
| **Line of business / policy type** | Enum (§17) | M | Slip, wording |
| **Period** — inception, expiry, BI indemnity period | Date / months | M | Schedule |
| **Coverage** — sum insured / limit (per-occurrence + aggregate), sublimits per peril, basis of valuation, currency | Money / enum | M | Schedule, wording |
| **Retention** — deductible / excess / SIR (per peril) | Money | M | Schedule |
| **Premium** — gross, net, taxes & levies, payment terms, currency | Money | M | Debit note, slip |
| **Exposure/asset** — site, country, city, geocode, asset class/occupancy, declared value (TIV), PML/MFL | Text / money | M | Schedule, SOV; or manual questionnaire (§9.1) if unavailable |
| **Coverage scope** — perils insured, key exclusions, territorial limits, governing law/jurisdiction | Text | M | Wording |
| **Conditions** — warranties, conditions precedent, key endorsements | Text | O | Wording, endorsement |
| **Claims** — claims under policy, paid amounts, outstanding reserves | Money | O | Claims bordereaux |
| **Governance & lineage** — source doc type, extraction confidence, validated-by, validated-on | Meta | M | System |

## Notes
- **SOV** = Statement of Values — the asset schedule a broker or insured provides listing sites, occupancy, and declared values; the primary source for the Exposure/asset row alongside the policy schedule itself.
- **Exposure/asset fallback (FR3.9):** when no schedule or SOV exists for an asset, the assigned user completes the in-system manual questionnaire (§9.1) to capture this row's mandatory fields directly. Manual entries are tagged 'manual entry — no source document' and pass through the same validation gate, versioning, and audit trail as extracted fields — see [`Field Extraction & Validation Routing.md`](../a.%20Agents/Field%20Extraction%20%26%20Validation%20Routing.md) §5.
- **Governance & lineage** is never itself sourced from a broker document — it is system-generated metadata attached during extraction (confidence, source pointer) and validation (validated-by, validated-on), not a field extracted from document text.
- Every field in this table, once posted, is versioned rather than overwritten on change (FR3.7); a field stays `unconfirmed` and excluded from KPI calculation until a human validates it (§9.1).
