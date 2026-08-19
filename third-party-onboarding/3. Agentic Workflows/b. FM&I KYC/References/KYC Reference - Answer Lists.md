# KYC Reference — Answer Lists

Standalone reference extracted from `4. Properties/b. FM&I KYC/2. FM&I Functional Spec Standard v1.1 ok.xlsx`, sheet **`Reference Lists`** — confirmed 22 Jul 2026. Resolves 4 of the 6 baseline-identity fields previously flagged `NOT SOURCED IN THIS WORKBOOK` in [`KYC Reference - Baseline Identity Properties.csv`](KYC%20Reference%20-%20Baseline%20Identity%20Properties.csv). Country fields are resolved separately — see the note at the bottom.

**Maintenance note:** this is a point-in-time copy of the `Reference Lists` sheet. Regenerate if the Functional Spec workbook is updated to a newer version.

---

## Third Party Legal Structure
Property: `Third Party Legal Structure`

| Value |
| :--- |
| Person |
| Entity |

## Gender
Property: `Gender`

| Value |
| :--- |
| Male |
| Female |
| Unknown |

## MASKYC Customer Type
Property: `MASKYC Customer Type`

| Value |
| :--- |
| Regulated Financial Institution |
| Listed or Public Company |
| Government Body (i.e. Ministry, Statutory Board, Agency) |
| Supranational Organisation (including multilateral development banks) |
| Investment Fund or Other Pooled Investment Vehicle |
| Private Company |
| Trust |
| Charity or Foundation or Non-Profit Organisation |

## MASKYC Fund or Listed Vehicle
Property: `MASKYC Fund or Listed Vehicle`

**Fund (30 entries):**
ADCF C Private Limited · Alpha Asia Macro Trends Fund III Private Limited · Alpha Asia Separate Account, LP · Alpha DC Fund Private Limited · Aspark LP · BVK Separate Mandate · China Sustainable Urban Renewal Fund, LP · KAIF NPS Sidecar LP · KDCF II Parallel Fund A, LP · KDCF II Reco Springer Co-Investment Pool, LP · KDCF II Sherwin, LP · KEAF II Lux Fund SCSp · KEAF Lux Fund SCSp · KEAF Sullivan Fund, LP · KEAF UNP Fund, LP · Keppel Asia Infrastructure Fund, LP · Keppel Asia Macro Trends Fund IV Private Limited · Keppel Core Infrastructure Fund, LP · Keppel Credit Fund III (US), LP · Keppel Data Centre Fund II, LP · Keppel Data Centre Fund III, LP · Keppel Education Asset Fund II, LP · Keppel Education Asset Fund, LP · Keppel Infrastructure Fund, LP · Keppel Lotus Vietnam Venture VCC · Keppel Reco Springer DC III, LP · Keppel Sustainable Urban Renewal Fund, LP · Keppel Urban Living Investment Fund, LP · Keppel Vietnam Fund, LP · Keppel-MMP Indonesia Logistics Fund Private Limited · Keppel-Pierfront Private Credit Fund II, LP · Keppel-Private Credit Fund III, LP · Pierfront Capital Mezzanine Fund Pte. Ltd. · Vespa Sidecar LP · Victoria Trans SG 1 LP · Victoria Trans SG 2 LP

**Listed Vehicles (5 entries):**
Keppel REIT · Keppel DC REIT · Keppel Infrastructure Trust · KORE US REIT · Prime US REIT

*(This list names specific live investment vehicles, not a generic category picklist — expect it to change over time as funds close/launch. Flag to whoever owns the workbook if a case names a vehicle not on this list, rather than assuming the list is exhaustive or current.)*

---

## Country fields — resolved separately, reusing the TPA reference

`Person Country of Residence` and `Entity Registered Country` are **not** in this `Reference Lists` sheet — they're on their own `CountriesTerritories 2025` sheet in the same workbook (columns `CODE` / `REGION`, 252 entries). That data is byte-identical to `3. Agentic Workflows/a. TPA/TPA Reference - Countries Territories 2025.md`'s existing 252 entries (same codes, same names, same order) — confirmed by direct comparison, 22 Jul 2026. Per the platform-reuse principle already applied elsewhere (e.g. `app:user_bu_registry`), **`KYC DocReviewer` reuses that TPA file directly** rather than duplicating it — see [`../../a. TPA/TPA Reference - Countries Territories 2025.md`](..%2F..%2Fa.%20TPA%2FTPA%20Reference%20-%20Countries%20Territories%202025.md).

---

## Person ID Type / Entity ID Type — resolved, sourced from RCTP itself (22 Jul 2026)

Not in the FM&I workbook — found in `RCTP Functional Spec Standard v6.0.xlsx`, sheet `Reference Lists`, blocks `ID Type List - person`, `ID Type List - entity`, and `ID Type List - unknown` (rows 43–170). This is RCTP's own dropdown — the system these values actually get batch-uploaded into — so it's a more authoritative source for this field than the FM&I checklist workbook would have been anyway. **The source workbook itself is deliberately not filed into this project** (it's a large platform-wide spec with far more in it than this one field needs) — the values below are the complete, self-contained extract; nothing here depends on the source file being present or findable.

**⚠️ Read before wiring this in as-is:** each list mixes two different kinds of thing. Most entries are ordinary **identity-document types** (`Passport No.`, `National ID`, `Driving Licence No.`, `Company Identification No.`, `DUNS Number`, `Legal Entity Identifier (LEI)`, `National Tax No.`, etc.) — exactly what `Person ID Type` / `Entity ID Type` are supposed to capture. But a large chunk are **sanctions/watchlist record identifiers** used elsewhere in RCTP (`OFAC Program ID`, `OFAC Unique ID`, `HM Treasury Group ID`, `HM Treasury Regime`, `UK Sanctions List Regime`, `UK Sanctions List Unique ID`, `UN Permanent Reference No.`, `EU Consolidated Electronic List ID`, `OSFI Iran ID`, `OSFI North Korea ID`, `SECO SSID`, and similar) — these describe a hit on a screening list, never a customer's own KYC document. `KYC DocReviewer` should only ever select from the identity-document subset when populating this field from an uploaded document — never a sanctions/watchlist-type value, which would never correctly describe a customer's own ID. Confirm with whoever owns the RCTP spec whether the dropdown is genuinely this one shared list platform-wide (in which case the agent just needs the "never pick a screening-type value" rule below) or whether a KYC-scoped subset should be split out for this field specifically.

**Person ID Type** (29 values, identity-document types **bolded**):
**Driving Licence No.** · **National ID** · **National Tax No.** · **Passport No.** · **Social Security No.** · Central Registration Depository (CRD) · DFAT Reference Number · EU Consolidated Electronic List ID · EU Sanctions Programme Indicator · Federal Bureau of Prisons Register Number · HM Treasury Group ID · HM Treasury Regime · Marijuana Licence Number · MSB Licence Number · National Criminal Identification Code (USA) · National Provider Identifier (NPI) · OFAC Additional Sanctions Information · OFAC Program ID · OFAC Unique ID · OSFI Individuals ID · OSFI Iran ID · OSFI North Korea ID · Others · SECO SSID · UK Sanctions Imposed · UK Sanctions List Regime · UK Sanctions List Regime Type · UK Sanctions List Unique ID · UN Permanent Reference No.

**Entity ID Type** (40 values, identity-document types **bolded**):
**Bank Identifier Code (BIC)** · **Company Identification No.** · **DUNS Number** · **International Securities Identification Number (ISIN)** · **Legal Entity Identifier (LEI)** · **National Tax No.** · Aircraft Construction, Line, Fleet or Serial Number · Aircraft Manufacturer's Serial Number (MSN) · Central Registration Depository (CRD) · DFAT Reference Number · EU Consolidated Electronic List ID · EU Sanctions Programme Indicator · HM Treasury Group ID · HM Treasury Regime · IATA Location ID Code · International Maritime Organization (IMO) Ship No. · Marijuana Licence Number · MSB Licence Number · NACE (European Union Economic Activity Classification System) · North American Industry Classification System (NAICS) · OFAC Additional Sanctions Information · OFAC Program ID · OFAC Unique ID · OSFI Entities ID · OSFI Iran ID · OSFI North Korea ID · Others · Related EU Consolidated Electronic List ID · Related EU Sanctions Programme Indicator · Related HM Treasury Group ID · Related HM Treasury Regime · Related OFAC Program ID · Related OFAC Unique ID · Related UK Sanctions List Regime · Related UK Sanctions List Unique ID · SECO SSID · Standard Industrial Classification (SIC) · UK Sanctions Imposed · UK Sanctions List Regime · UK Sanctions List Regime Type · UK Sanctions List Unique ID · UN Permanent Reference No. · UN/LOCODE Location Code

*(A third block, `ID Type List - unknown`, is a near-superset of both — used where `Third Party Legal Structure` isn't yet resolved. Not reproduced here since Wave 1 always resolves legal structure before this field is populated; pull it from the source workbook directly if a genuine unknown-structure case ever needs it.)*

---

## Still not a picklist — `Person Year of Birth`

Marked `Dropdown with List` in the field contract, but no discrete list exists for it anywhere (checked both workbooks), and none would make sense — it's a year value, not a bounded category. Treat as a plain numeric field (a generated year range, e.g. current year back ~100 years, if a dropdown UI is still wanted) rather than continuing to look for a sourced list that doesn't exist for this kind of field.
