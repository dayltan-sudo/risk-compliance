# DJ RCTP MCP Server — Project Handover

**To:** Keppel Data / AI team  ·  **From:** Da'yl Tan, Senior Manager, Risk & Compliance
**Date:** 23 June 2026  ·  **Status:** Handover for build — core design settled; open confirmations in Part C
**Governing policy:** RC003-05 *Dealing With TPAs Due Diligence* (with RC002, RC006, RC007, RC019)

> **What this is.** A handover pack for you to build an MCP server that lets an AI chatbot help onboard Third Party Associates (TPAs) into the Dow Jones RiskCenter Third Party Platform (RCTP), with access-control guardrails. **R&C owns the policy and design decisions captured here; you own the build.** This document gives you the context, the decisions already made (so they aren't re-litigated), the build scope and order, the detailed reference design, and the items still to confirm.

---

# PART A — Orientation

## A1. The project in one page

**What:** An MCP (Model Context Protocol) server wrapping the **Dow Jones RCTP API v0.2 (Beta)**. An AI chatbot ("the workflow") uses it to **pre-populate TPA onboarding and renewal fields** — extracting values from documents (contracts, ACRA Bizfiles, registers of directors/shareholders, DDQs) and writing them into Dow Jones — so onboarding is faster for everyone.

**Why guardrails:** The server talks to Dow Jones with **one shared, over-privileged service account**. Every user also has their *own* direct Dow Jones login with scoped Business-Unit (BU) rights. So the guardrails are an **anti-escalation control**: a user must not be able to do *more* through the chatbot than their own direct access already allows. Plus RC003 compliance (validation, screening, audit).

**Non-negotiable principles (carry these through the whole build):**
- **Dow Jones is the single source of truth.** Never mirror records/properties/monitoring; re-read on demand.
- **The server never writes a risk score.** It writes property *inputs*; Dow Jones computes the band, which is read back.
- **Validation is server-side**, at chokepoints the model cannot route around — never in tool descriptions or prompts.
- **Fail closed.** No positive entitlement → no access.
- **No deletion via the API** (see C / Non-goals).

## A2. The handover package

| # | Artifact | What it gives you |
|---|---|---|
| 1 | **This document** | Design, decisions, build scope, acceptance, open items. |
| 2 | `TPA_MCP_Tool_Register.xlsx` | The tool / resource / prompt catalogue, doc→property map, state model, API-volume model. |
| 3 | `RCTP List of Properties (in-use) v2.xlsx` (sheet FULL) | 576 fields; **309 in use** after excluding the EDD / EDD - ESG tags (267, confirmed not in use). |
| 4 | **`TPA Property Mapping (draft).xlsx`** | Field-by-field mapping: in-scope?, operation, tool, source document, high-risk-to-edit?, notes. **The build's data contract for what to write and from where.** |
| 5 | `rctp-mcp-server` (reference scaffold) | TypeScript worked example: auth flow, base URLs, v0.2 JSON:API envelope, all tools. **Authored but never compiled** — validate and build from it, don't treat as a release. |
| 6 | RC003-05 policy (SharePoint) | The governing methodology (risk scoring, screening baseline, renewal cycles). |

## A3. Where to start — build sequencing

**Phase 0 — Unblock (before coding the guardrails):**
- Confirm host identity forwarding (C1) — this sets the transport and enforcement layer.
- R&C to finish the property-mapping "amber" review (artifact 4) and supply the high-risk-to-edit list.

**Phase 1 — Core (the MVP):**
1. Auth (OAuth service-account) + the RCTP client (base URL, v0.2 media type, JSON:API envelope, pagination, 401-retry).
2. The tool layer (lookups, reads, create-staged, property writes, table writes, screening) — per the register and the reference scaffold.
3. The **access-control guardrails**: identity → entitlements join (B), role + BU authorisation (B/D), field-level write policy (D), fail-closed everywhere (B), and audit logging (F).
4. Server-side value validation (coded-value resolution, read-only protection).

**Phase 2 — Later:**
- The risk-status webhook listener (E — the one stateful edge) and any details-cache. *(Approval / activation / screening-adjudication are native Dow Jones UI, not MCP — see E.)*

## A4. Decisions already made (do not re-open without R&C)

| Topic | Decision |
|---|---|
| Language | TypeScript (MCP SDK). |
| Transport | Determined by the host-identity answer (C1); stdio vs streamable HTTP. |
| Deletion | **None via API.** No delete tool. Removal is manual in Dow Jones by an authorised person. |
| Create | Staged (`is_active=false`) — **activation is a native Dow Jones UI step (no API)**. |
| Scoring | Dow Jones computes; server writes inputs only, reads band back. |
| Identity | Chatbot authenticates each user via their **AD (Entra) login**; forwarding to be confirmed (C1). |
| Topology | Chatbot is the **only path to the server**; users' direct Dow Jones logins bypass it and are out of scope. |
| Identity ↔ entitlement join key | **Email** (= DJ username = SSO login), case-normalised, fail-closed on no match. |
| Entitlements source | Periodic **human-generated export** from RCTP user-admin (no API), uploaded as the role/BU table. |
| Roles | **Requester** (everyone, default) and **R&C** (small curated allowlist). One role per user. |
| Screening | **Risk-tiered per RC003 §4.2.2** (Low/Medium/High — see D4), not a flat count. |
| Audit retention | 5 years from end-of-relationship (confirm), append-only/immutable, Singapore residency (confirm). |
| Caching | Immutable third-party **ID only**; never cache mutable details/status. |
| Approval / activation | **Native Dow Jones UI — no API.** The MCP does not approve, reject, or activate; a human does it in the SaaS. (The earlier MCP maker–checker is retired — see E.) |
| Renewal | **Delta refresh** — updates only the *changed* properties from the latest documents (contract / ACRA / registration); re-screens only new/changed parties. RC003 §4.6 cadence (Low 5y / Med 3y / High 1y). Reuses the same write path; see the register's "Tools (task layer)" sheet, `tpa_renew_from_documents`. |

---

# PART B — Reference design: access control

## B1. Identity and entitlements are two separate sources

| Concern | Question | Source | Liveness |
|---|---|---|---|
| **Identity** | *Who is calling now?* | The host (Entra/SSO), passed to the server as a verified token/claim | Live |
| **Entitlements** | *What may they do?* | The DJ RCTP user-admin export (role + BU), uploaded periodically | Snapshot |

Only entitlements are constrained by Dow Jones (no API). Identity comes from the host. **Two logins are involved:** the *user's* login to the host governs authorisation; the *server's* service-account login executes the Dow Jones call. Dow Jones never sees the individual user.

## B2. Live identity — host passthrough  *(one confirmation outstanding — C1)*

The server needs a **verified** user identity. An identity supplied as a *tool argument* is spoofable and unacceptable. Mechanisms, by host:
- **A — Host forwards the Entra token** (HTTP): server validates signature/audience/issuer/expiry and reads the identity. Standard.
- **B — One server instance per user** (stdio): host launches a process carrying that user's identity.
- **C — In-house platform as identity broker**: host authenticates via Entra SSO and injects a signed identity assertion. Most control.

**Decision:** the chatbot authenticates via AD login and is expected to forward verified identity (A or C). **Confirm (C1):** the host can forward "this is Jane" to the back-end, not just "this is the chatbot." Running the server as one fixed user is rejected.

## B3. Identity reconciliation — the join key

Match host identity to the export on **email** (= DJ username; Keppel login is SSO-by-email, so UPN and mail coincide). **Normalise case** (lowercase + trim). **No match → fail closed.** Accounts in only one system (DJ-only service account, new joiner not yet exported) are denied until reconciled. *Confirm (C8): no users have a login email differing from their DJ username.*

## B4. Entitlements export — data contract

| Item | Spec |
|---|---|
| Source | Human-generated RCTP user-admin report (no API). |
| Format | CSV or XLSX (pick one; CSV preferred for a deterministic loader). |
| Key column | `email` (normalised). |
| Required | `email`, `role` (identifies R&C; others default Requester), `business_units` (permitted BU IDs). |
| Multi-BU | Delimited list in one cell **or** one row per (user, BU) — choose and keep consistent. |
| Optional | `display_name`, `status`, `bu_owner` (for Phase-2 routing). |
| Upload | Secure upload; **atomic swap** only after validation; keep prior version for rollback. |
| Load validation | Schema check, de-dup on `email`, reject malformed. **On failure keep the last good table — never fall open.** |
| Versioning | Persist each load + timestamp; stamp it on every access decision (F). |
| Cadence | Periodic, named owner, automated reminder (C5). |

## B5. BU scoping — half-live

Check: `record.business_unit_id ∈ user.permitted_BUs(export)` **and** `role permits the field` (D). The **record's BU is read live** from Dow Jones (accurate); only the user's permitted-BU set comes from the snapshot — so staleness is trusted for one half only.

## B6. Fail-closed & user-confirmation

- **Fail closed:** a user not in the latest export, or whose identity can't be verified, gets minimum/no write rights.
- **User confirmation** (showing the user their BU/role and asking them to confirm, escalating "not my BU" to R&C) is a **UX catch for honest mistakes only — not an access control.** The export is the boundary.

## B7. Enforcement layer & trust boundary

- **Authentication originates at the host** (only it sees the login); the server *verifies* what the host passes.
- **Authorization is enforced at the trust boundary** = wherever the service-account credential is held. The client may *assist* (only offering what a user can do) but client-side checks are UX only.
- **The LLM/agent deciding what to call is never a security boundary** (it can be jailbroken).

**Selected topology:** chatbot is the only path to the server; direct DJ logins bypass it. Host-level enforcement is viable — **recommended: defense in depth**, server remains the authoritative boundary and re-enforces every check, locked to accept only the chatbot. Regardless of topology, **always enforce at the server:** value validation, never-write-a-score, read-only protection.

---

# PART D — Reference design: roles, fields, screening

## D1. Roles

| Role | Who | Default |
|---|---|---|
| **Requester** | First line — initiates onboarding, supplies extracted data | Everyone |
| **R&C** | Second line — owns DD, screening, risk, approvals | Small curated allowlist |

One role per user; R&C granted solely via the authoritative export/allowlist.

## D2. Role → property-tag write matrix (draft — needs R&C sign-off)

Three buckets: **system-owned** (no human writes), **Requester writes** (high-risk-to-edit fields get tighter logging; **approval is the native SaaS step**), **R&C-only**. The authoritative, field-level version is **`TPA Property Mapping (draft).xlsx`** — use that for the build; the tag table below is the summary.

| Property Tag | Fields | Requester | R&C |
|---|---:|---|---|
| Scoring | 1 | read | read only (system-owned) |
| Risk Status | 10 | read | read only (system-owned) |
| RCTP | 124 | write | write |
| MAS ONB / non-MAS OB | 5 | write | write |
| Association Names screening | 7 | write | write |
| CDD (IntDD) / CDD Typing | 79 | read only | write |
| MAS RA / non-MAS RA | 33 | read only | write |
| MAS EDD / EDD Custom / Training EDD | 37 | read only | write |
| Custom | 12 | mixed (see mapping) | write |
| Migration | 1 | — | read only (system) |

## D3. Field-level write policy + the property mapping

Enforce at a single guard (`assertWritable`) that **all** write tools call — `dj_update_property`, `dj_batch_update_properties`, **and** `dj_update_table_field`. Order (fail-closed):
1. **System-owned:** reject if `is_read_only` or `is_scored`.
2. Role/tag policy (per the mapping file) for the caller's role.
3. BU scope (B5).
4. **High-risk-to-edit** (D5): apply **tighter logging / extra confirmation** (approval itself is the native SaaS UI step — not an MCP action).
5. Value validation (coded-value resolution, regex/schema).

> The Dow Jones `is_key_risk` / `is_red_flag` flags describe *scoring content*, **not** edit-sensitivity — they are **not** approval triggers. Edit-sensitivity is the curated D5 list only.

**The mapping (`TPA Property Mapping (draft).xlsx`) is the build's data contract.** Of the 309 in-use fields it proposes (22 flagged for R&C confirmation): **~89 in-scope (write)** — the automation core (entity/person identity, director/shareholder/UBO/parent tables, contract fields, scoring inputs, screening names, internal reference); **~193 "review" (amber)** — mostly DDQ/CDD/EDD/ESG assessment answers needing R&C's call on auto-fill vs manual; **10 read-back**; **17 system**. Build the green core first; the amber bucket is the scoping conversation to have with R&C.

## D4. Screening scope — confirmed from RC003-05 §4.2.2 (risk-tiered)

Screening (`dj_add_monitored_entity`) scales with the TPA risk rating:

| Risk rating | Parties screened |
|---|---|
| **Low** | TPA entity; CEO (or equivalent) |
| **Medium** | + board of directors; ultimate parent entity (if any) |
| **High** | + Ultimate Beneficial Owners |

Also per RC003: never engage TPAs subject to ongoing sanctions (or whose majority-owning UBOs are sanctioned), regardless of rating. **Cost implication:** the register's volume model must use these tiers, not a flat per-case count.

## D5. High-risk-to-edit property list (R&C-curated)

Fields whose **edit** ripples into workflows — e.g. **Third Party Expiry Date** (drives renewal reminders) and **Third Party Status**. **Distinct** from the DJ risk flags. Maintained by R&C as an explicit list (a column in the properties workbook). Drives **tighter logging / extra confirmation** (approval is the native SaaS UI step — there is no MCP approval). *R&C to supply the initial list (C4).*

---

# PART J — Reference design: tool design & granularity

How to carve the RCTP workflow into MCP tools — **how many tools, and where the boundaries fall**. This is a build-design decision, not just an API-wrapping exercise: get it wrong and the model either drowns in a noisy tool menu or can't steer a workflow it needs to branch.

## J1. Core principle — the consumer is an LLM, not a developer

Tool granularity follows **different logic than normal software decomposition**, because the consumer is an LLM, not a human developer. The decision criterion is **not** "how micro should each step be" — it is:

> **Does the model need to make a decision between these steps?**

If the model has nothing to decide between two steps, they belong in one tool. If it does, they belong in separate tools.

## J2. The two failure modes

**Too many small tools —**
- **Context cost.** Every tool's name, description, and schema is injected into the model's context *on every turn*; a large menu is noise that crowds out the task.
- **Selection errors.** More similar-looking tools means more chances the model picks the wrong one.
- **Orchestration shifts to the model.** Exposing atomic steps forces the LLM to sequence them across multiple round-trips, with more chances to derail. **A fixed, deterministic sequence is the worst thing to make the model orchestrate** — reliable in code, fragile in the model.

**One monolithic tool —**
- **Hidden control flow** the model can't steer when the branching depends on its own judgment.
- **Coarse, ambiguous interface** — a sprawling schema that's hard to call correctly.
- **Poor observability and error recovery** — the model just sees "it failed," with no handle to retry a specific step.

## J3. The decision rule

| If the steps are… | Then… |
|---|---|
| A **fixed, deterministic chain** (e.g. geocode → fetch → format) | **One tool** — hide the orchestration inside the handler where it's reliable. |
| **Branching on model judgment** or on newly surfaced information | **Separate tools** — so the model can insert reasoning between them. |

**Useful test:** *would a competent human assistant think of this as one action or several?* "Book me a flight" is **one** tool even if it is six internal API calls; "search flights" and "book a flight" are **two**, because a human reviews the results before committing.

## J4. Two refinements

1. **Collapse on parameter, split on intent.** When the only difference between operations is a *parameter*, collapse them — `get_report(period)` beats three separate daily/weekly/monthly tools. When the difference is an *intent* (create vs. delete), split them.
2. **Design around outcomes, not your API surface.** Mirroring REST endpoints 1:1 as tools is an **anti-pattern**: your internal API was decomposed for programmers; tools should be decomposed for the **model's task / outcome**.

## J5. Applied to this build

- `dj_batch_update_properties` correctly **collapses** many field writes into one parameterised call — the model has no decision to make *between* writing one field and the next, so it should not orchestrate them one-by-one.
- Dedup-then-create stays **two** tools — `dj_search_third_parties` then `dj_create_third_party` — so the model (and the human) can review possible duplicates before committing: the "search vs. book" pattern.
- The reference lookups (`dj_get_business_units`, `dj_get_owner_groups`, `dj_get_processes`) are cached as **Resources** rather than called in a fixed sequence per onboarding — the model is not made to orchestrate a deterministic lookup chain it has no decisions to make within (see F1).

---

# PART E — Approval, activation & screening adjudication (native Dow Jones UI — no API)

**Confirmed by R&C: there is no API to approve/reject a change, activate a staged record, or fetch screening-hit data.** So the MCP does **not** implement a maker–checker / approval workflow — the earlier propose → route → approve/reject design (the `dj_propose/list/approve/reject_change` tools, pending store, SoD, and callback-trust) is **retired**.

How it actually works:
- **Approval & activation** of a record happen in the **Dow Jones UI**, through the platform's own workflow (which routes to R&C). The MCP's job ends at populating/proposing data and producing review aids (`tpa_review_pack`, `tpa_exception_report`).
- **Screening:** the MCP can *submit* monitored entities (`dj_add_monitored_entity`), but **hits are adjudicated in the DJ UI** — there is no API to fetch them.
- **High-risk-to-edit** fields (§D5) therefore drive **tighter logging / extra confirmation**, not an MCP approval gate.
- The only Phase-2 item that remains is the **risk-status webhook** (`tpa_handle_risk_change`) — an inbound notification surfaced to R&C.

---

# PART F — Cost, audit, failure, non-goals

## F1. Cost / API-quota controls *(separate workstream from access control)*

- **Quota assumption:** 15,000 calls/period (confirm — C6). Current load ~10,500/yr ≈ **70% before growth** — thin headroom.
- **Pricing:** quota-based (not per-monitored-entity).
- **Levers (biggest first):** cache reference lookups as Resources (~5 live lookups → 0); batch property writes; **scope screening per the D4 tiers** (largest consumer); cache the immutable third-party ID; a quota counter + alert at ~80%; dedup on create.
- **Caching policy:** immutable **ID only**. Never cache mutable details/status (violates "never mirror"). The live BU read (B5) may be cached alongside the ID since `business_unit_id` is stable.

## F2. Audit, logging & retention

- **Log every write/change attempt — allowed *and* denied:** user (email/UPN), role, BU decision, **export timestamp relied on**, field, before/after. Append-only. Distinct from ops telemetry. (Approval/activation are recorded in the Dow Jones platform's own audit, not the MCP's.)
- **Retain 5 years from end-of-relationship** (AML/RC003 standard — confirm C7). The archive/age-out job must key off relationship-end, **not** a fixed calendar age (a flat 5-year purge would delete records for still-active relationships). Archive/back up ~5-yearly.
- **Store:** append-only / immutable (WORM), Singapore residency (defaults — confirm C7); may feed the SIEM. Contains PII — control accordingly.

## F3. Failure modes (every failure → deny / least-privilege)

| Failure | Behaviour |
|---|---|
| Host/identity unavailable | Deny writes; reads not requiring identity may stay read-only. |
| Entitlements table missing/corrupt/failed load | Keep last good table; if none, deny all writes + alert. |
| Entra / token validation unreachable | Deny (cannot verify). |
| Dow Jones API down/timeout | Actionable error; no partial writes; `internal_reference` idempotency on retry. |
| Export older than cadence | Alert; optionally tighten to read-only beyond a max-staleness threshold. |
## F4. Non-goals / scope boundary

- Governs **only the MCP / chatbot path**. Does not replace Dow Jones's native controls for users with **direct RCTP logins** (all users have these).
- Does **not** reduce API consumption (that's F1).
- Does **not** compute/write risk scores (Dow Jones owns scoring).
- **No deletion via the API.**
- **Approval, activation, and screening-hit adjudication are native Dow Jones UI** — out of scope for the MCP (no API).
- It **enforces** RC003 policy; it does not **define** it.

---

# PART C — What's still open (confirm before / during build)

1. **Host identity passthrough & topology (gating).** Confirm the host can forward a verified AD identity to the back-end (B2), and lock the server to the chatbot. Sets transport + enforcement layer.
2. **Confirm the native approval/activation workflow** covers the high-risk-to-edit fields (approval is the SaaS UI step — no MCP approval to design).
3. **Identity source role-vs-identity.** Does the source return role directly, or only identity mapped via the export? (The DJ export is the role authority regardless.)
4. **Role-matrix sign-off + high-risk-to-edit list.** R&C to ratify D2/the mapping file, finish the amber review, and supply the D5 list.
5. **Export operations.** Cadence + owner + automated reminder; confirm the B4 columns and multi-BU representation.
6. **Dow Jones quota/terms** (F1); decide whether `business_unit_id` is cached with the ID.
7. **Audit retention basis & store** — 5 years from end-of-relationship, immutable, Singapore residency (F2).
8. **Email join key** holds for all users (B3).
9. **Five Swagger/Postman-only payload details** (in the scaffold README): monitored-entity request body, v0.2 error-code ranges, file→table-row link, webhook signing, status read-back path.
10. **Compile the scaffold** and confirm the `FormData`/`Blob` upload and MCP SDK signatures.

---

# PART G — Acceptance criteria (definition of done)

Build against a **non-prod DJ tenant** with seeded users across roles/BUs and test records in known BUs.

**Positive:** Requester writes a permitted field in own BU → succeeds; R&C writes an R&C-only field → succeeds.
**Negative (deny):** Requester writes R&C-only field; any user writes a non-permitted BU; user not in export; identity supplied only as a tool argument; write to read-only/`is_scored` field.
**Identity & staleness:** email join resolves with case-normalisation; no-match denied; offboarded user (off latest export) denied.
**Audit:** every allowed *and* denied attempt logs all F2 fields incl. export timestamp.
**Cost:** quota counter increments; alert fires at threshold.
**Phase 2:** the risk-status webhook surfaces a Dow Jones status change to R&C.

---

# PART H — Risks (by severity)

1. **Identity passthrough unconfirmed (MED, gating).** Chatbot authenticates via AD; confirm forwarding (C1).
2. **Entitlement staleness (MED-HIGH).** Snapshot export, no invalidation (webhook deferred). Mitigated by fail-closed + cadence + half-live BU check.
3. **"BU/role changes are rare" asserted, not evidenced (MED).** Validate change frequency.
4. **Cost controls unbuilt (MED).** ~70% of a 15k ceiling; no quota counter/screening-scope policy yet.
5. **Approval / activation / adjudication are out-of-API (by design).** Handled in the Dow Jones UI; the MCP does not implement them (E). Confirm the native workflow covers the high-risk-to-edit fields.
6. **Self-attestation must stay secondary (LOW).** Confirm-BU UX is a safety net, not the boundary.

---

*Handover pack — a build and governance aid, not legal advice. The API-enforceable RC003 controls (validation, read-only/score protection, audit) are enforced server-side; approval, activation, and screening adjudication are completed in the Dow Jones UI. The authoritative RC003 text resides on SharePoint; confirm detail against the current copy (RC003-05, effective 1 June 2026).*
