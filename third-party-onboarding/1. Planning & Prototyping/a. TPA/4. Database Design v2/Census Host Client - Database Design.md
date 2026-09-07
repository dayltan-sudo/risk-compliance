# Census TPA Database Design & Workflow Integration

**v2 — rewritten against Prompts v3** (`orchestrator.md`, `extractor.md`, `screener.md`) and PRD v10.
Supersedes the v1 draft, which was written against v2 prompts (and had drifted from those too — see §0).

---

## 0. What changed from v1, and why

v1 modeled a pipeline (DocAnalyst → TPADocReviewer → confirm → Screener → Custodian → stage to RCTP) and a permission model (Business Unit, role-gated review) that v3 removed — most of it was already gone by PRD v7/v2, so v1 was never fully reconciled to the prompts it claimed to follow.

**Deleted outright** — no longer exist in any v3 source:

| Item | Why |
|---|---|
| `business_unit` column, `ix_tpa_records_bu_status`, Flow G | `orchestrator.md` §1: "Business Unit does not exist in this product — not as a permission, not as a field, not as a column" |
| `staged_third_party_id`, `staged_at`, statuses `staged`/`active`, RCTP staging | PRD §12: export concept cut entirely; no external system exists |
| `ownership_complexity` enum, OpsManager triage, "if COMPLEX unravel first" | Never existed even in v2 — v2's orchestrator already ran screening "ALWAYS — unconditional; there is no complexity gate" |
| `rejected` status | v3 has three statuses only: `draft` / `screening` / `committed`. The gate blocks; it never rejects |
| Custodian, DocAnalyst, TPADocReviewer agent references | PRD §8: three agents. Extractor merges the former DocAnalyst + TPADocReviewer; Custodian is deferred to Phase 2 |
| The old 7 ADK tools, incl. `delete_tpa_records` | `orchestrator.md` §7.2 refuses record deletion/history alteration outright — this isn't a rename, it's a hard integrity constraint: **no hard-delete path exists at any layer** |
| `pgvector` | nothing in v3 uses embeddings |
| Sub-entity (shared address/parent) matching | narrative-only in v1 — never had schema support, and v3 explicitly forbids it (`orchestrator.md` Flow A: "Corporate-secretarial firms register hundreds of unrelated companies to one address") |
| `app_name = "sentinel_rnc"` value | codename rename Sentinel → Census; the column concept survives if a multi-process shell is still wanted (PRD §8 references TPA + FM&I KYC as siblings) |

**Structural rewrites driven by v3, not just renames** — see §§3–5 for full detail:

1. **Screening now runs before the confirmation gate**, not after (`orchestrator.md` §4: `Extractor → Screener → GATE`). Screening results must persist against an in-progress record, which forces the record row to exist from extraction onward (§0.1).
2. **Risk scoring and the derived expiry date (field 25) have no representation at all** in v1 — both are now first-class, stored, auditable data (§3.1, §5.1).
3. **The confirmation gate's log is user-visible product surface** (the record's "history tab"), not an audit side-effect — v1 had no table for it at all (§3.6).
4. **Amendments must never overwrite history** (`orchestrator.md` Flow E), which v1's "Replace" write strategy directly violates.
5. **A draft's parked/retrying screening state belongs to the record, not the session** (`orchestrator.md` §7.1 rule 6) — "another user opening that entity sees the parked draft."
6. **Party data has exactly one store** (`extractor.md` §6) — fields 21, 22, 23, 24 render from `tpa_parties`; they are never separately written to `tpa_fields`.

### 0.1 Key design decisions

These were open questions with more than one defensible answer; resolutions below are binding for the rest of this document.

| # | Decision | Resolution | Rationale |
|---|---|---|---|
| D1 | Where do pre-gate drafts and screening results live? | A `tpa_records` row is created at extraction with `status = 'draft'`. No separate drafts table for the record itself. | One stable identity from extraction onward; matches "the parked state is the record's, not the session's"; avoids a migration step at the highest-risk moment (commit). |
| D2 | How is amendment/renewal history modeled? | `version_no` on `tpa_fields` and `tpa_parties` rows. Every version writes a **complete** row set (all applicable fields/parties), not a diff. `tpa_screening_results` stays append-only, outside the version boundary, linked by run. | Makes the renewal delta and history tab plain relational queries instead of JSON diffing; a re-screen supersedes rather than versions. |
| D3 | Do extracted values live on `tpa_records` too? | No. `tpa_records` keeps only identity/routing columns (name, company number, tax ID, country code, legal structure) as a projection refreshed at each checkpoint. `tpa_fields` is the single source of truth for extracted values. | Avoids a three-way copy (record column / `tpa_fields` / `tpa_parties`) with no precedence rule — `extractor.md` §6 forbids exactly this pattern for party data. |
| D4 | How is scored reference data (countries, services, interaction lists) modeled? | Versioned reference tables (`countries`, `answer_list_items`), keyed by `rubric_version`. Records store the country **code** plus the `rubric_version` used to score them. | The country reference file is explicitly year-versioned and instructs regenerating scores "if R&C revises the scoring rubric" — un-versioned copies make historical scores unreproducible after a rubric change. |
| D5 | What replaces `entity_type` ENUM(Person\|Entity)? | Nothing stored — derive Person vs. Entity from field 11 (`Third Party Legal Structure`) where the distinction matters. | No v3 field carries this discriminator directly; a separate column can drift from the actual extracted answer. |
| D6 | Document retention vs. PRD §13 ("not retained beyond what the task needs") | Retain for the life of the record. | §9.5's citation preview ("open full document") requires the source to resolve on a committed record indefinitely. **Flag §13's wording to the PRD owner** — it likely meant "not retained if the draft is discarded," not "purged after commit." |
| D7 | Is the human-facing "reference" (PRD §9.7) the same as `internal_record_id`? | Separate. `internal_record_id` (UUID) is the stable PK; `reference` is a short human-facing code. | A UUID is a poor thing to display, search, or say out loud. |
| D9 | Does `expired` survive as a status? | No. Overdue is derived from `expiry_date` on read, cached via `temporal_recomputed_at`. | v3 defines three statuses only (`orchestrator.md` Flow C); a fourth status nothing in the prompts describes would be unenforceable against them. |

**Left open** (see §11): the instrumentation event store (PRD §15) is not schema'd here — it's a named dependency, not a table in this design. The exact `draft` → `screening` display-status boundary is an inference, not a literal PRD statement — flagged for product confirmation.

---

## 1. Architecture Overview

```
┌───────────────────────────────────────────────────────────────────────────┐
│                        PostgreSQL (pg15)                                    │
├───────────────────────────────────────────────────────────────────────────┤
│  ┌───────────────────────┐   ┌───────────────────────────────────────────┐ │
│  │  ADK Session Tables    │   │  TPA Domain Tables (Alembic)              │ │
│  │  (auto-managed)        │   │                                           │ │
│  │  • sessions            │   │        tpa_records  (one row per entity   │ │
│  │  • events              │   │        lifecycle; exists from extraction) │ │
│  └───────────────────────┘   │              │ 1:N                        │ │
│                               │  ┌───────────┼───────────┬─────────────┐  │ │
│                               │  ▼           ▼           ▼             ▼  │ │
│                               │ tpa_fields  tpa_parties  tpa_screening  tpa_documents │ │
│                               │  │(+selections)│(self-FK)│  _runs        │  │ │
│                               │  │            │           │_results     │  │ │
│                               │  └──── version_no ────────┘             │  │ │
│                               │                                          │ │
│                               │  tpa_confirmation_log (+ field_changes, │ │
│                               │  screening_decisions children)          │ │
│                               │                                          │ │
│                               │  countries, answer_list_items (reference,│ │
│                               │  versioned by rubric_version)            │ │
│                               └───────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────────────┘
```

**Technology Stack:** SQLAlchemy 2.x async (`asyncpg`) · Alembic · PostgreSQL 15+ · `create_async_engine(pool_size=5, max_overflow=10)`.

---

## 2. Entity-Relationship Diagram

```
┌────────────────────────────────────────────────────────────────────┐
│                            tpa_records                              │
│──────────────────────────────────────────────────────────────────  │
│ PK  id                        UUID                                  │
│     reference                 VARCHAR(50)  UNIQUE  ← human-facing   │
│     created_by_user_id        VARCHAR(255)         ← Cognito user   │
│     session_id                VARCHAR(255)  nullable ← provenance   │
│     flow_type                 ENUM(onboarding|renewal)               │
│     status                    ENUM(draft|screening|committed)        │
│     entity_legal_name         VARCHAR(500)                           │
│     entity_company_number     VARCHAR(255)  nullable                 │
│     entity_tax_id             VARCHAR(255)  nullable                 │
│     entity_registered_country_code VARCHAR(20) FK → countries        │
│     legal_structure            VARCHAR(255)  nullable  (field 11)    │
│     risk_score_interaction/services/country/total  INT               │
│     risk_tier / risk_tier_at_extraction  ENUM(LOW|MEDIUM|HIGH)        │
│     risk_tier_provisional      BOOLEAN                                │
│     rubric_version              VARCHAR(20)                          │
│     expiry_date / expiry_derived_date / expiry_base_date  DATE       │
│     expiry_overridden           BOOLEAN                              │
│     screening_state             ENUM(5 values)                       │
│     screening_attempt_count / first_failed_at / last_error           │
│     has_open_items              BOOLEAN                              │
│     open_items                  JSONB                                │
│     ownership_layers_resolved   INT                                  │
│     current_version_no          INT                                  │
│     historical_ref              UUID FK → tpa_records.id (self)      │
│     created_at / updated_at / extraction_completed_at                │
│     first_committed_at / last_confirmed_at / temporal_recomputed_at  │
└──────────────────────────────────────────────────────────────────────┘
     │ 1:N            │ 1:N              │ 1:N            │ 1:N
     ▼                ▼                  ▼                ▼
┌───────────┐  ┌──────────────┐  ┌────────────────┐  ┌─────────────┐
│tpa_fields │  │tpa_parties   │  │tpa_screening_   │  │tpa_documents│
│(+ version_│  │(+ version_no,│  │runs → results   │  │             │
│no)        │  │ layer, self- │  │(+ version_no,   │  │             │
│           │  │ FK parent)   │  │ supersedes)     │  │             │
└───────────┘  └──────────────┘  └────────────────┘  └─────────────┘
     │
     ▼
┌────────────────────────┐
│tpa_field_selections     │  ← multi-select children (fields 14, 15, 18)
└────────────────────────┘

┌──────────────────────────────┐
│ tpa_confirmation_log          │──1:N──▶ tpa_confirmation_log_field_changes
│ (one row per gate pass)       │──1:N──▶ tpa_confirmation_log_screening_decisions
└──────────────────────────────┘

┌─────────────┐   ┌──────────────────┐
│ countries    │   │ answer_list_items │   reference, keyed by (rubric_version, code)
└─────────────┘   └──────────────────┘
```

---

## 3. Table Definitions

### 3.1 `tpa_records` — Master Record

One row per third-party entity lifecycle, **created at extraction** (D1) and mutated in place through commit and every subsequent amendment/renewal. Holds current state only — the timeline lives in `tpa_confirmation_log` and in versioned child rows.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID | PK | `internal_record_id` in orchestrator state — stable across every amendment |
| `reference` | VARCHAR(50) | UNIQUE, NOT NULL | Short human-facing code (D7) |
| `created_by_user_id` | VARCHAR(255) | NOT NULL, indexed | Cognito user who started the flow |
| `session_id` | VARCHAR(255) | nullable | Provenance only — never an identity or scoping key (drafts are keyed to user, not session) |
| `flow_type` | ENUM(`onboarding`,`renewal`) | NOT NULL | |
| `status` | ENUM(`draft`,`screening`,`committed`) | NOT NULL, default `draft` | Coarse, user-visible. See §5.1 for how this rolls up from `screening_state` |
| `entity_legal_name` | VARCHAR(500) | NOT NULL | Field 4/9 — identity projection, refreshed at extraction and at each gate confirmation |
| `entity_company_number` | VARCHAR(255) | nullable, indexed | Field 1 |
| `entity_tax_id` | VARCHAR(255) | nullable, indexed | For Flow A exact-match key |
| `entity_registered_country_code` | VARCHAR(20) | FK → `countries.code`, nullable | Field 3 — the *only* country term in the risk score (extractor §5) |
| `legal_structure` | VARCHAR(255) | nullable | Field 11 — used to derive Person vs. Entity display (D5) |
| `risk_score_interaction` | INT | nullable | Field 18, highest-of-selections (§3.2/§5.1) |
| `risk_score_services` | INT | nullable | Field 20 |
| `risk_score_country` | INT | nullable | Lookup on `entity_registered_country_code` only |
| `risk_score_total` | INT | nullable | Sum of the three above |
| `risk_tier` | ENUM(`LOW`,`MEDIUM`,`HIGH`) | nullable | The **confirmed** tier — governs screening scope and expiry |
| `risk_tier_at_extraction` | ENUM(`LOW`,`MEDIUM`,`HIGH`) | nullable | For the closing summary's "tier at extraction → at confirmation" |
| `risk_tier_provisional` | BOOLEAN | default `false` | True while any of the three scoring inputs is blank/needs-checking |
| `rubric_version` | VARCHAR(20) | nullable | Which `countries`/`answer_list_items` edition scored this record |
| `expiry_date` | DATE | nullable | Effective value the app reads (may equal derived, or the override) |
| `expiry_derived_date` | DATE | nullable | Computed from tier + `expiry_base_date`, always kept current even after an override |
| `expiry_base_date` | DATE | nullable | **Original** onboarding commit date. Immutable across amendments; only a renewal resets it |
| `expiry_overridden` | BOOLEAN | default `false` | |
| `expiry_override_reason` | TEXT | nullable | Required when `expiry_overridden` |
| `screening_state` | ENUM(`NOT_STARTED`,`RUNNING`,`COMPLETE`,`PARKED_RETRYING`,`PARKED_UNAVAILABLE`) | NOT NULL, default `NOT_STARTED` | Orthogonal to `status` (§5.1) |
| `screening_attempt_count` | INT | default 0 | No cap — retried indefinitely |
| `screening_first_failed_at` | TIMESTAMPTZ | nullable | |
| `screening_last_attempt_at` | TIMESTAMPTZ | nullable | |
| `screening_last_error` | TEXT | nullable | |
| `has_open_items` | BOOLEAN | default `false` | Recomputed at every gate confirmation and amendment |
| `open_items` | JSONB | nullable | `[{type, field_number \| party_id, description}]` |
| `ownership_layers_resolved` | INT | nullable | Layer 0 = direct owners |
| `current_version_no` | INT | NOT NULL, default 1 | Points to the current row-set in `tpa_fields`/`tpa_parties` |
| `historical_ref` | UUID | FK → `tpa_records.id`, nullable | Prior record for a renewal chain |
| `created_at` / `updated_at` | TIMESTAMPTZ | NOT NULL, auto | |
| `extraction_completed_at` | TIMESTAMPTZ | nullable | |
| `first_committed_at` | TIMESTAMPTZ | nullable | Original onboarding commit — expiry's base date. Never changes on amendment |
| `last_confirmed_at` | TIMESTAMPTZ | nullable | Most recent gate pass (initial, amendment, or renewal) |
| `temporal_recomputed_at` | TIMESTAMPTZ | nullable | Last background recompute of day-derived fields (PRD §9.7) |

No `delete()` operation is exposed at the service layer — record integrity is non-negotiable (`orchestrator.md` §7.2).

**Indexes:**

| Index | Columns | Purpose |
|---|---|---|
| `ix_tpa_records_reference` | `reference` (unique) | Human lookup |
| `ix_tpa_records_created_by_user` | `created_by_user_id` | Roster / "your third parties" |
| `ix_tpa_records_status` | `status` | Filtered listing |
| `ix_tpa_records_screening_state` | `screening_state` | Surfacing parked drafts in the roster |
| `ix_tpa_records_company_number` | `entity_company_number` | Flow A exact-match key |
| `ix_tpa_records_tax_id` | `entity_tax_id` | Flow A exact-match key |
| `ix_tpa_records_name_country` | `(entity_legal_name, entity_registered_country_code)` | Flow A's second key: name + country |
| `ix_tpa_records_name_trgm` | `entity_legal_name` (GIN, `pg_trgm`) | Candidate generation for the Jaro-Winkler ≥90% comparison, done in application code over the trigram-narrowed candidate set — Postgres has no native Jaro-Winkler operator |
| `ix_tpa_records_expiry_date` | `expiry_date` | Third Parties index sort/filter, overdue flagging |
| `ix_tpa_records_open_items` | `has_open_items` | Third Parties index filter (PRD §9.7) |

### 3.2 `tpa_fields` — Extracted Fields with Provenance

One row per record-version per applicable field number (1–20, 25). **Fields 21, 22, 23, 24 never get rows here** — they render from `tpa_parties` (§3.3).

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID | PK | |
| `tpa_record_id` | UUID | FK → `tpa_records.id` CASCADE, indexed | |
| `version_no` | INT | NOT NULL | D2 — a full row set is written per version |
| `field_number` | SMALLINT | NOT NULL | 1–20 or 25 |
| `value` | TEXT | nullable | Scalar value. Multi-select fields (14, 15, 18) additionally populate `tpa_field_selections` |
| `confidence` | ENUM(`confident`,`needs_checking`) | nullable | Two states only (extractor §4) — not high/medium/low |
| `needs_confirmation` | BOOLEAN | default `false` | Set when a Judgment field is left blank pending human input |
| `source_match` | ENUM(`agrees`,`differs`,`no_source`,`derived`) | nullable | Set at extraction, re-evaluated on amendment; Flow D **reads this stored value, never re-derives it** |
| `field_class` | ENUM(`factual`,`judgment`,`split`,`derived`) | NOT NULL | `split` = field 24's dual rule; `derived` = field 25 only |
| `mandatory` | BOOLEAN | NOT NULL | Per the field-25-strong schema (extractor §4) |
| `confirmed` | BOOLEAN | default `false` | |
| `edited` | BOOLEAN | default `false` | |
| `edited_at` | TIMESTAMPTZ | nullable | |
| `document_id` | UUID | FK → `tpa_documents.id`, nullable | The cited document |
| `citation_locator` | TEXT | nullable | e.g. `p.5, Contract X, Clause 3`. Never a fabricated page number |
| `snippet` | TEXT | nullable | Verbatim text proving the extraction |

**Constraint:** a populated `value` requires either (`document_id` + `citation_locator`) or (`field_number = 25` and `source_match = 'derived'`) — "a field with no citation is not populated" (extractor §4), enforced via CHECK + application validation.

**Indexes:** `ix_tpa_fields_record_version_field` on `(tpa_record_id, version_no, field_number)`.

**Write strategy:** Append, versioned. Never Replace/delete — an amendment writes `version_no + 1` rows for every applicable field, confirmed or not, so history reads as a plain join on `version_no`.

#### `tpa_field_selections` — multi-select children (fields 14, 15, 18)

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `tpa_field_id` | UUID FK → `tpa_fields.id` CASCADE | |
| `answer_list_item_id` | FK → `answer_list_items` (composite), nullable | |
| `selection_text` | VARCHAR(500) NOT NULL | |
| `group_label` | VARCHAR(100), nullable | Field 18 only — "Government Officials/Entities" vs. "Non-Government third parties" |
| `score` | INT, nullable | Denormalized copy of the answer list's score at selection time, so a later rubric revision doesn't retroactively change a stored score |

Field 18's risk contribution is `MAX(score)` across its selections, not the sum (extractor §5) — computed at write time into `tpa_records.risk_score_interaction`.

### 3.3 `tpa_parties` — Ownership, Directors, Screening Targets

The **single store** for all party data (extractor §6). Fields 21 (Other Associated Entities), 22 (Shareholders), 23 (Directors), and 24 (UBOs) are rendered from this table by filtering `party_type` — never separately written to `tpa_fields`.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID | PK | |
| `tpa_record_id` | UUID | FK → `tpa_records.id` CASCADE, indexed | |
| `version_no` | INT | NOT NULL | Full party set written per version |
| `layer` | INT | NOT NULL, default 0 | Layer 0 = base entity's direct owners/officers |
| `parent_party_id` | UUID | FK → `tpa_parties.id`, nullable, self-referential | The holding entity one layer up |
| `party_type` | ENUM(`base_entity`,`ceo`,`director`,`shareholder`,`ubo`,`ultimate_parent`,`associated_entity`) | NOT NULL | `base_entity`/`ceo`/`ultimate_parent` added for v3 screening scope (§3.4) |
| `legal_name` | VARCHAR(500) | NOT NULL | |
| `is_natural_person` | BOOLEAN | NOT NULL | |
| `country_code` | VARCHAR(20) | FK → `countries.code`, nullable | Residence or incorporation |
| `year_of_birth` | INT | nullable | Field 10 — natural persons only. A year, not a date (screener §6) |
| `direct_percent` | FLOAT | nullable | As stated in the register |
| `ultimate_percent` | FLOAT | nullable | Product of intermediate percentages down the chain |
| `role` | VARCHAR(255) | nullable | |
| `confidence` | ENUM(`confident`,`needs_checking`) | nullable | |
| `document_id` | UUID | FK → `tpa_documents.id`, nullable | |
| `citation_locator` | TEXT | nullable | |
| `is_ubo_conclusion` | BOOLEAN | nullable | The Judgment half of field 24 — true only where the chain resolves to this person |
| `chain_unresolved` | BOOLEAN | default `false` | |
| `unresolved_reason` | ENUM(`nominee`,`trust`,`undisclosed_holder`) | nullable | The layer that broke |
| `human_supplied` | BOOLEAN | default `false` | A user-stated UBO at the gate, not extracted (orchestrator §5) |

**Indexes:** `ix_tpa_parties_record_version_type` on `(tpa_record_id, version_no, party_type)`; `ix_tpa_parties_record_layer` on `(tpa_record_id, version_no, layer)`.

**Write strategy:** Append, versioned — same as `tpa_fields`. **The disclosure floor is 25% ultimate ownership, flat** — a branch stops resolving once `ultimate_percent` would fall below it, and the stopped branch is still recorded (extractor §6). The floor governs resolution depth only, not screening scope.

### 3.4 `tpa_screening_runs` and `tpa_screening_results`

A **run** groups the per-party rows produced by one screening pass. Needed because a retry after failure screens every in-scope party from scratch — "never treat a partial result from the failed attempt as already done" (screener §7 rule 9) — which append-only rows alone can't distinguish from a completed run.

#### `tpa_screening_runs`

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `tpa_record_id` | UUID FK → `tpa_records.id` CASCADE | |
| `version_no` | INT NOT NULL | The working version this run screens against |
| `trigger` | ENUM(`initial`,`identity_edit`,`tier_rise`,`human_supplied_owner`,`retry`) | |
| `tier_at_screening` | ENUM(`LOW`,`MEDIUM`,`HIGH`) NOT NULL | "The tier you screened at is the extracted one; the tier that governs is the one the human confirms" (screener §6) |
| `status` | ENUM(`RUNNING`,`COMPLETE`,`FAILED`,`SUPERSEDED`) | A `FAILED` run's results are void, never authoritative |
| `started_at` / `completed_at` | TIMESTAMPTZ | |
| `failure_reason` | TEXT, nullable | |

#### `tpa_screening_results`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | UUID | PK | |
| `run_id` | UUID | FK → `tpa_screening_runs.id` CASCADE | |
| `tpa_record_id` | UUID | FK → `tpa_records.id` CASCADE | Denormalized for direct queries |
| `party_id` | UUID | FK → `tpa_parties.id` SET NULL, nullable | `SET NULL` — a result survives a party-list rewrite on the next version |
| `party_name` | VARCHAR(500) | NOT NULL | Denormalized, as-screened |
| `nationality` | VARCHAR(255) | nullable | |
| `layer` | INT | nullable | |
| `sources_checked` | JSONB | | e.g. `["sanctions","PEP","adverse_media","web"]` |
| `raw_hit_count` | INT | default 0 | |
| `recommended_status` | ENUM(`CLEARED`,`RESOLVED_FALSE_POSITIVE`,`TRUE_MATCH`,`PENDING_REVIEW`) | NOT NULL | Screener's classification — always a **recommendation** |
| `evidence` | TEXT | NOT NULL | The specific matching/mismatching identifier, independently verifiable |
| `human_confirmed` | BOOLEAN | default `false` | |
| `confirmed_status` | ENUM(same 4 values) | nullable | The human's final call at the gate — may equal or override `recommended_status` |
| `override_rationale` | TEXT | nullable | Required when `confirmed_status ≠ recommended_status` |
| `confirmed_by` | VARCHAR(255) | nullable | |
| `confirmed_at` | TIMESTAMPTZ | nullable | |
| `supersedes_id` | UUID | FK → `tpa_screening_results.id`, nullable | Points to the result this re-screen replaces after an identity edit |
| `escalation_severity` | VARCHAR(50) | nullable | |
| `escalation_message` | TEXT | nullable | |
| `screened_at` | TIMESTAMPTZ | default `now()` | |

`match_score` (v1) is dropped — no v3 output produces a numeric confidence for a screening hit.

**Write strategy:** Append only, always. Never Replace, never delete. Currency is tracked via `run.status` and `supersedes_id`, not by mutating old rows.

### 3.5 `tpa_confirmation_log` — The History Tab

One row per gate pass (initial confirmation, amendment, or renewal) — **not** one row per field, per orchestrator §5: "unchanged fields are not logged individually; record that they were confirmed as prefilled." This is user-visible product surface, readable by any user who opens the record.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `tpa_record_id` | UUID FK → `tpa_records.id` CASCADE | |
| `version_no` | INT NOT NULL | The version this entry produced |
| `event_type` | ENUM(`initial_confirmation`,`amendment`,`renewal`) | |
| `actor_user_id` | VARCHAR(255) NOT NULL | |
| `occurred_at` | TIMESTAMPTZ NOT NULL, default `now()` | |
| `reason` | TEXT, nullable | Required for `amendment` (Flow E: "the reason for the amendment is captured and logged") |
| `risk_tier_before` / `risk_tier_after` | ENUM(`LOW`,`MEDIUM`,`HIGH`), nullable | Populated only when a scoring-field edit moved the tier |
| `expiry_before` / `expiry_after` | DATE, nullable | Populated on any expiry change, override or tier-driven |
| `expiry_override_reason` | TEXT, nullable | |

#### `tpa_confirmation_log_field_changes` (child)
`id`, `confirmation_log_id` FK CASCADE, `field_number`, `prefilled_value`, `confirmed_value` — one row **per field the human actually changed**.

#### `tpa_confirmation_log_screening_decisions` (child)
`id`, `confirmation_log_id` FK CASCADE, `screening_result_id` FK → `tpa_screening_results.id`, `party_name`, `recommended_status`, `confirmed_status`, `override_rationale`.

### 3.6 `tpa_documents`

Every record exists from extraction (D1), so every document always belongs to a record — there is no separate draft-scoped document table.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `tpa_record_id` | UUID FK → `tpa_records.id` CASCADE, NOT NULL | |
| `filename` | VARCHAR(500) NOT NULL | |
| `mime_type` | VARCHAR(100) NOT NULL | Accepted: PDF, DOCX, DOC, XLSX, PNG, JPG, TIFF |
| `size_bytes` | BIGINT NOT NULL | App-layer limit: 25MB/file, 20 files/upload |
| `storage_ref` | VARCHAR(1000) NOT NULL | Object storage key |
| `upload_status` | ENUM(`accepted`,`rejected`) NOT NULL | Per-file — one rejected file never blocks the rest |
| `rejection_reason` | TEXT, nullable | |
| `is_amendment_evidence` | BOOLEAN, default `false` | Attached at Flow E without triggering re-extraction |
| `uploaded_by` | VARCHAR(255) NOT NULL | |
| `uploaded_at` | TIMESTAMPTZ, default `now()` | |

Retained for the life of the record (D6) — citations (`tpa_fields.document_id`) and the Review Pack's inline snippet preview resolve against this indefinitely.

### 3.7 `countries` and `answer_list_items` — Versioned Reference Data

| `countries` | Type |
|---|---|
| `rubric_version` | VARCHAR(20), part of PK |
| `code` | VARCHAR(20), part of PK |
| `name` | VARCHAR(255) NOT NULL |
| `risk_score` | INT NOT NULL |

`Not Known` and `None` both score 3 — the fallback for a country you cannot map, never a shortcut past a match you could make (extractor §5).

| `answer_list_items` | Type |
|---|---|
| `rubric_version` | VARCHAR(20), part of PK |
| `list_name` | ENUM(`services_industry`,`interaction_government`,`interaction_non_government`,`org_red_flags`,`txn_red_flags`), part of PK |
| `item_code` | VARCHAR(100), part of PK |
| `label` | TEXT NOT NULL |
| `score` | INT, nullable | Red-flag lists carry no score |

**Open item:** field 11's (`Third Party Legal Structure`) answer list has no source in v3 — no reference file defines its options, unlike v1/v2's `TPA Reference - Predetermined Answer Lists.csv`. Do not invent values; confirm the list with product before populating `answer_list_items` for it.

A record's `rubric_version` records which edition of these tables produced its stored scores. A rubric revision inserts new rows under a new `rubric_version`; old records keep pointing at the version they were scored under.

---

## 4. Enum Type Definitions

```sql
CREATE TYPE tpa_status AS ENUM ('draft', 'screening', 'committed');
CREATE TYPE tpa_flow_type AS ENUM ('onboarding', 'renewal');
CREATE TYPE tpa_risk_tier AS ENUM ('LOW', 'MEDIUM', 'HIGH');
CREATE TYPE tpa_confidence AS ENUM ('confident', 'needs_checking');
CREATE TYPE tpa_source_match AS ENUM ('agrees', 'differs', 'no_source', 'derived');
CREATE TYPE tpa_field_class AS ENUM ('factual', 'judgment', 'split', 'derived');
CREATE TYPE tpa_party_type AS ENUM (
    'base_entity', 'ceo', 'director', 'shareholder', 'ubo', 'ultimate_parent', 'associated_entity'
);
CREATE TYPE tpa_unresolved_reason AS ENUM ('nominee', 'trust', 'undisclosed_holder');
CREATE TYPE tpa_screening_status AS ENUM (
    'CLEARED', 'RESOLVED_FALSE_POSITIVE', 'TRUE_MATCH', 'PENDING_REVIEW'
);
CREATE TYPE tpa_screening_run_status AS ENUM ('RUNNING', 'COMPLETE', 'FAILED', 'SUPERSEDED');
CREATE TYPE tpa_screening_trigger AS ENUM (
    'initial', 'identity_edit', 'tier_rise', 'human_supplied_owner', 'retry'
);
CREATE TYPE tpa_screening_state AS ENUM (
    'NOT_STARTED', 'RUNNING', 'COMPLETE', 'PARKED_RETRYING', 'PARKED_UNAVAILABLE'
);
CREATE TYPE tpa_confirmation_event_type AS ENUM ('initial_confirmation', 'amendment', 'renewal');
CREATE TYPE tpa_document_upload_status AS ENUM ('accepted', 'rejected');
CREATE TYPE tpa_answer_list_name AS ENUM (
    'services_industry', 'interaction_government', 'interaction_non_government',
    'org_red_flags', 'txn_red_flags'
);
```

---

## 5. Workflow Integration

### 5.1 Status model — two orthogonal axes

`status` is coarse and user-visible (PRD §9.4). `screening_state` is the detailed sub-state that drives §7.1's park/retry behavior and is the record's own property, not the session's. **`status` is derived from `screening_state` and whether the gate has been passed** — it is not an independent state machine:

| `status` | Condition |
|---|---|
| `draft` | Before extraction completes, or `screening_state = NOT_STARTED` |
| `screening` | `screening_state ∈ {RUNNING, PARKED_RETRYING, PARKED_UNAVAILABLE}`, gate not yet passed |
| `committed` | Gate passed and `screening_state = COMPLETE` |

> This rollup is an inference from PRD §9.4 and `orchestrator.md` §7.1, not a literally stated rule — confirm the exact `draft`→`screening` transition point (does it flip the instant Extractor hands off to Screener, or only once the user reaches the gate's screening step?) with the product owner before build.

A record can be `draft` (fields not yet confirmed) while `screening_state = PARKED_RETRYING` — screening starts as soon as extraction completes (§5.3), independent of when the human reaches the gate.

There is no `rejected` or `expired` status (D9). Overdue is `expiry_date < today`, computed on read and cached via `temporal_recomputed_at`.

### 5.2 Flow-to-Table Mapping

| Flow | Trigger | Tables written | Agent |
|---|---|---|---|
| **A** — Identity Resolution | User names a company | READ `tpa_records` (exact reg/tax ID, or name+country ≥90% Jaro-Winkler) | Orchestrator |
| **B** — Onboard/Renew | | | |
| ├ Extraction | Documents uploaded | INSERT `tpa_records` (`status='draft'`) + `tpa_fields` + `tpa_parties` (v1) + `tpa_documents` | Extractor |
| ├ Screening (pre-gate) | Extraction completes | INSERT `tpa_screening_runs` + `tpa_screening_results` | Screener |
| ├ Confirmation gate (fields, then screening) | User reviews | New version if edited; UPDATE `tpa_records` (risk/expiry recompute); may trigger a new `tpa_screening_runs` row (identity edit / tier rise) | Orchestrator |
| ├ Commit | Both gate steps confirmed | INSERT `tpa_confirmation_log` (+children); UPDATE `tpa_records` (`status='committed'`, `first_committed_at`, `expiry_*`) | Orchestrator |
| **C** — Record Status | "Where is X?" | READ `tpa_records` | Orchestrator |
| **D** — Review Pack | Record committed | READ `tpa_fields`/`tpa_parties` at `current_version_no`, `tpa_screening_results` | Orchestrator |
| **E** — Amend | Committed record, correction | New version (`current_version_no + 1`) on `tpa_fields`/`tpa_parties`; INSERT `tpa_confirmation_log` (`event_type='amendment'`); may re-screen | Orchestrator |
| **Renewal** (Flow B, `flow_type='renewal'`) | Delta vs. `historical_ref` | New `tpa_records` row, `historical_ref` set; resets `first_committed_at`/`expiry_base_date` | Extractor + Orchestrator |

There is no Flow F/G — due-for-renewal portfolio views and exception reports are Phase 2 (PRD §11), tied to the Custodian agent that doesn't exist yet.

### 5.3 Detailed Sequence — Onboarding

```
USER: "Onboard Acme Corp"
  │
  ▼
FLOW A — Identity Resolution
  • READ tpa_records: exact company_number/tax_id match, OR
    name ≥90% Jaro-Winkler AND same country
  • Result: NO_MATCH → onboarding. MULTIPLE → block, user picks
    or explicitly rejects all ("none of these" = confirmed no-match)
  │
  ▼
EXTRACTOR
  • INSERT tpa_records (status='draft', version 1 identity columns)
  • INSERT tpa_fields (fields 1-20, 25; version_no=1)
  • INSERT tpa_parties (all layers; version_no=1)
  • INSERT tpa_documents (per uploaded file, accepted/rejected)
  • Computes risk_score_*, risk_tier_at_extraction, risk_tier,
    expiry_derived_date (provisional if a scoring input is unconfirmed)
  │
  ▼
SCREENER — runs immediately, BEFORE the human sees anything
  • INSERT tpa_screening_runs (trigger='initial', tier_at_screening=risk_tier)
  • INSERT tpa_screening_results (recommended_status per party in scope)
  • record.screening_state = RUNNING → COMPLETE (or PARKED_* on failure, §5.4)
  │
  ▼
CONFIRMATION GATE — one gate, two steps, one confirmation_log entry
  Step 1: fields + derived expiry — user may edit
    │  edit to field 3, 18, or 20?
    │    → recompute risk_score_*/risk_tier; if tier ROSE, trigger a new
    │      tpa_screening_runs (trigger='tier_rise') for newly in-scope parties
    │      before step 2 unlocks
  Step 2: screening recommendations (unlocked once step 1 confirmed)
    │  identity edit (name/country/YOB) on a screened party?
    │    → INSERT tpa_screening_runs (trigger='identity_edit'), single party;
    │      new tpa_screening_results row with supersedes_id = old result
  │
  ▼
COMMIT (screening_state must = COMPLETE; no blocking gap open — §5.5)
  • If this is version 1 and record was still 'draft': bump version_no if
    the user edited anything at the gate (full row set rewritten)
  • INSERT tpa_confirmation_log (event_type='initial_confirmation') +
    field_changes + screening_decisions children
  • UPDATE tpa_records: status='committed', first_committed_at=NOW(),
    last_confirmed_at=NOW(), expiry_base_date=NOW(),
    expiry_date = expiry_derived_date (or the user's override)
  • Recompute has_open_items / open_items
```

### 5.4 Screening park/retry (`orchestrator.md` §7.1)

```
Screening call fails
  → tpa_records.screening_state = PARKED_RETRYING
  → screening_first_failed_at set (if not already), screening_last_attempt_at bumped,
    screening_attempt_count += 1
  → confirmed fields untouched; user released with "your work is saved"
  → retry indefinitely (no attempt cap)
      succeeds → screening_state = COMPLETE, tpa_screening_runs.status='COMPLETE'
                 (a retry is a FRESH run — screens every in-scope party again,
                 never reuses partial results from the failed run)
      past sustained-failure threshold → screening_state = PARKED_UNAVAILABLE,
                 surfaced in the roster distinctly from an ordinary in-progress draft
Nothing commits while screening_state ≠ COMPLETE.
This is the record's own state — any user opening this entity sees it.
```

### 5.5 Commit-blocking conditions

`tpa_onboard_from_documents` / `tpa_renew_from_documents` / `tpa_amend_record` refuse to run unless:
- Gate passed (all mandatory fields confirmed, no blank mandatory field unflagged)
- `screening_state = COMPLETE`
- No unresolved HIGH-tier UBO chain — i.e. no `tpa_parties` row at HIGH tier with `chain_unresolved = true` and no `human_supplied` resolution in its place (extractor §4, orchestrator §7)

`open_items` on the record should enumerate exactly these gaps so the precondition is queryable, not just enforced in application code.

---

## 6. Service Architecture (Data Access Layer)

```
Agent Tool Layer (ADK) — Orchestrator is the sole caller
  tpa_find_third_party | tpa_onboard_from_documents | tpa_renew_from_documents
  tpa_record_status | tpa_review_pack | tpa_amend_record
        │
        ▼
TPAStoreService (Facade)
        │
   ┌────┼─────────┬─────────────┬──────────────┬───────────────┐
   ▼    ▼         ▼             ▼              ▼               ▼
Record  Field     Party         Screening      ConfirmationLog Document
Service Service   Service       Service        Service         Service
create()          save_version()               save_version()  save_run()
update_status()   get_by_version()              get_by_record()
                                                append()        save()
find_by_identity() (Flow A, two-key match)
list_by_user()
        │
        ▼
async_sessionmaker[AsyncSession]  (core/services/engine.py)
        │
        ▼
PostgreSQL (asyncpg)
```

No service exposes a hard `delete()` for a committed record. `TPAFieldService`/`TPAPartyService` expose `save_version()`, never `replace()` — the old Replace strategy (delete + re-insert) is removed; it both violated "never overwrite history" and orphaned screening results tied to the deleted party rows.

---

## 7. ADK Session State ↔ Database Mapping

| Session state key (`orchestrator.md` §3) | Database | When synced |
|---|---|---|
| `app:portfolio_registry` | `tpa_records` (+ children) | Continuously — this *is* the registry |
| `app:inflight_drafts` | `tpa_records` with `status='draft'` | Record exists from extraction (D1); no separate draft table |
| `identity_resolution_result` | — | Session-only, Flow A output |
| `historical_profile` | `tpa_records.historical_ref` join | Seeded on renewal match |
| `current_tpa_payload` | `tpa_fields`/`tpa_parties` at working `version_no` | After extraction |
| `extracted_parties` | `tpa_parties` at working `version_no` | After extraction; the single store (§3.3) |
| `risk_tier` | `tpa_records.risk_score_*`, `risk_tier`, `risk_tier_provisional` | After extraction; recomputed on scoring-field edit |
| `screening_report` | `tpa_screening_runs` + `tpa_screening_results` | After each run |
| `confirmed_tpa_payload` | `tpa_fields`/`tpa_parties` at the version written on gate pass | After confirmation |
| `confirmation_log` | `tpa_confirmation_log` (+children) | On every gate pass |
| `screening_state` | `tpa_records.screening_state` | Continuously |
| `internal_record_id` | `tpa_records.id` | From creation |

---

## 8. File Locations

| Path | Purpose |
|---|---|
| `agents/core/models/base.py` | Shared `DeclarativeBase` |
| `agents/core/models/tpa_store/tpa_record.py` | `TPARecord` |
| `agents/core/models/tpa_store/tpa_field.py` | `TPAField`, `TPAFieldSelection` |
| `agents/core/models/tpa_store/tpa_party.py` | `TPAParty` |
| `agents/core/models/tpa_store/tpa_screening.py` | `TPAScreeningRun`, `TPAScreeningResult` |
| `agents/core/models/tpa_store/tpa_confirmation_log.py` | `TPAConfirmationLog` + children |
| `agents/core/models/tpa_store/tpa_document.py` | `TPADocument` |
| `agents/core/models/tpa_store/reference.py` | `Country`, `AnswerListItem` |
| `agents/core/models/__init__.py` | Model registry |
| `agents/core/services/engine.py` | Async engine + session factory singleton |
| `agents/core/services/tpa_store/facade.py` | `TPAStoreService` |
| `agents/core/services/tpa_store/*_service.py` | Per-table services (§6) |
| `agents/census/tools/tpa_db.py` | ADK tool functions bound in §6 (renamed from `agents/sentinel_rnc/`) |
| `migrations/versions/*_initial_tpa_tables.py` | Alembic migration |
| `alembic.ini`, `migrations/env.py` | Alembic configuration |

---

## 9. What v1 got right (kept as-is)

- Async SQLAlchemy + Alembic + PostgreSQL stack.
- `ON DELETE SET NULL` on the party→screening FK, now correctly load-bearing since parties are versioned rather than replaced — a superseded party row no longer orphans its screening history on every save.
- Facade + per-table service pattern.
- Provenance fields (`created_by_user_id`, timestamps) throughout.

---

## 10. Internal contradictions this rewrite resolves

1. **v1's Replace strategy vs. "never overwrite history."** Deleting and re-inserting `tpa_fields`/`tpa_parties` on every save is incompatible with Flow E's versioning requirement and §7.2's integrity refusal. Resolved by D2 (append-only, versioned).
2. **v1's `SET NULL` rationale was self-defeating.** It justified surviving "party list updates," but the Replace strategy deleted every party on every save regardless, orphaning results each time and making per-party re-screening (identity edit) untargetable since party IDs churned. Resolved the same way.
3. **Three copies of the same value with no precedence rule** — record columns, `tpa_fields`, and (for 21/23/24) a second copy implied by v1's flat design. Resolved by D3 (drop record-level extracted-value columns) and by treating 21/22/23/24 as pure views onto `tpa_parties`.
4. **Session-scoped storage vs. identity-keyed, cross-device drafts.** v1's `session_id NOT NULL` on the master record conflicted with "resumable from any device, same login" and "the parked state is the record's, not the session's." Resolved by making `session_id` provenance-only and keying everything else off `created_by_user_id` / the record itself.
5. **Post-gate screening vs. v3's actual sequence.** v1 modeled screening as happening after confirmation; v3 runs it immediately after extraction, before the gate. Resolved throughout §5.

---

## 11. Open items for product / follow-up

1. **Instrumentation event store** (PRD §15) — task duration, per-field edited-after-prefill, citation-opened, blank/needs-checking encountered vs. confirmed, record committed. Not modeled here; confirm whether this reuses the ADK `events` table or needs its own store.
2. **`draft` → `screening` display-status boundary** (§5.1) — inferred, not literally specified. Confirm with product.
3. **Field 11 answer list** — no v3 source defines `Third Party Legal Structure`'s options. Do not populate `answer_list_items` for it without a confirmed list.
4. **PRD §13 wording** ("not retained beyond what the task needs") contradicts §9.5's indefinite citation preview on committed records (D6). Recommend correcting §13 to scope this to discarded drafts.
5. **`app_name`/process discriminator** — confirm whether the FM&I KYC sibling process (PRD §8) shares these tables (discriminator column needed) or gets its own schema entirely; this design assumes the latter and carries no `app_name` column.
