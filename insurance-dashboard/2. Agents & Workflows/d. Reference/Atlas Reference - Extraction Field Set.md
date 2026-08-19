# Atlas Reference — Extraction Field Set

Reproduces PRD §8.2's policy data dictionary verbatim. Used by [`Field Extraction & Validation Routing.md`](../a.%20Agents/Field%20Extraction%20%26%20Validation%20Routing.md) (which now also owns intake/classification and enrichment/posting, formerly separate workflows) to define what `atlas_extract_fields` must extract and score at Flow B, and what its Flow H writes a field-level source-location pointer for (FR3.6) once posted.

M = Mandatory, O = Optional. SOV = Statement of Values. Typical source shows the document type ingestion mapping expects; see [`../a.%20Agents/Field%20Extraction%20%26%20Validation%20Routing.md`](../a.%20Agents/Field%20Extraction%20%26%20Validation%20Routing.md) §11 for the six policy-side document classes this table covers, and §11a for the four contract-requirement classes covered by the separate table below.

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

## Contractual Requirement Field Set (All Four Counterparty Types)
A separate field set, extracted only from the four contract-requirement classes (Intake & Classification §5a) — never from the six policy-side classes above, and not merged into the §8.2 table. Feeds Contract Compliance Engine's required-limit input (`app:contract_requirement_inputs`) rather than `app:policy_registry`, for all four counterparty types: Customer/Tenant, Lender, JV Partner, Government/Concession.

| Group / field | Type | M/O | Typical source |
| :--- | :--- | :--- | :--- |
| **Requirement identifiers** — counterparty name, counterparty type (`Customer/Tenant` / `Lender` / `JV Partner` / `Government/Concession`), agreement name, clause/section reference | Text / enum | M | Customer contract, lender agreement, JV partner contract, government concession agreement |
| **Linkage** — asset/site, entity, coverage line the requirement applies to | Text / enum | M | Same four |
| **Required terms** — required limit per coverage line, required deductible/SIR ceiling (if specified), currency | Money | M | Same four |
| **Term validity** — obligation effective date, expiry/renewal date | Date | M | Same four |
| **Governance & lineage** — source doc type, extraction confidence, validated-by, validated-on | Meta | M | System |

Mandatory-field convergence, confidence thresholding, and the human validation gate all apply identically to this field set regardless of counterparty type — see [`Field Extraction & Validation Routing.md`](../a.%20Agents/Field%20Extraction%20%26%20Validation%20Routing.md) §11a.

## Notes
- **SOV** = Statement of Values — the asset schedule a broker or insured provides listing sites, occupancy, and declared values; the primary source for the Exposure/asset row alongside the policy schedule itself.
- **Exposure/asset fallback (FR3.9):** when no schedule or SOV exists for an asset, the assigned user completes the in-system manual questionnaire (§9.1) to capture this row's mandatory fields directly. Manual entries are tagged 'manual entry — no source document' and pass through the same validation gate, versioning, and audit trail as extracted fields — see [`Field Extraction & Validation Routing.md`](../a.%20Agents/Field%20Extraction%20%26%20Validation%20Routing.md) §5.
- **Governance & lineage** is never itself sourced from a broker document — it is system-generated metadata attached during extraction (confidence, source pointer) and validation (validated-by, validated-on), not a field extracted from document text.
- Every field in this table, once posted, is versioned rather than overwritten on change (FR3.7); a field stays `unconfirmed` and excluded from KPI calculation until a human validates it (§9.1).
