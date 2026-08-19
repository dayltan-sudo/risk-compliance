# Atlas Reference — RBAC & Access Scoping

> **Reference · guardrail** — PRD §4.2 role-capability matrix and §4.1 personas, reproduced faithfully; source of truth for role-based access across all twelve components. Not a description of any single component's behaviour.
>
> **Companion docs:** access-scope gate — [`Atlas Assistant Orchestrator.md`](../a.%20Agents/Atlas%20Assistant%20Orchestrator.md)§8. State schema — [`Atlas - Google ADK State Reference.md`](../c.%20State/Atlas%20-%20Google%20ADK%20State%20Reference.md). Audit read access — [`Reporting & Audit Agent.md`](../a.%20Agents/Reporting%20%26%20Audit%20Agent.md)§4.3 (Audit & Access Log function).

## 1. Personas (§4.1)
Six in-scope personas back the matrix in §2. (Broker (external) — V2 is a seventh §4.1 persona, out of scope here: it has no access to Group data and sits outside this matrix.)

| Persona | Primary jobs-to-be-done |
| :--- | :--- |
| Group Insurance Lead | Own the programme; monitor adequacy and cost; configure KPI definitions and thresholds; drive placement strategy |
| R&C Manager | Monitor compliance and coverage gaps; review risk hotspots; export packs for leadership and audit |
| Entity Risk Champion | Upload local policy/broker documents; validate extracted data for their entity; confirm asset values |
| Treasury / Finance | Review premium spend, total cost of risk, and FX-normalised figures; reconcile to GL |
| Internal Auditor | Trace numbers to source documents; review audit trail and access logs |
| System Administrator | Manage users, roles, reference data, integrations, and KPI/score configuration |

## 2. Role-Capability Matrix (§4.2)
`R` = Read · `W` = Create/Edit · `V` = Validate extractions · `C` = Configure · `A` = Admin · `—` = no access. Access is always scoped by entity/BU per the user's assignment.

| Capability | Grp Ins | R&C Mgr | Entity Champ | Treasury | Auditor | Admin |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| View dashboards & KPIs | R | R | R* | R | R | R |
| Upload documents | W | W | W* | — | — | W |
| Validate extracted data | V | V | V* | — | — | V |
| Edit policy records | W | W | W* | — | — | W |
| Configure KPIs / risk weights | C | C | — | — | — | C |
| Manage users & integrations | — | — | — | — | — | A |
| View audit trail | R | R | — | R | R | A |
| Manage third-party contractual requirements | W | W | W* | R | R | W |
| Manage insurance exclusions | W | W | W* | R | R | W |

**\*** Entity Risk Champion access is restricted to their assigned entity/site only — every `*`-marked cell above is entity/site-scoped, not Group-wide, even though the letter grant matches other roles.

## 3. Scope Mechanics — `app:user_scope_registry` → `access_scope`
`app:user_scope_registry` is integration-sourced (Entra ID / SSO), application-scoped, persistent — the authoritative record of each user's role and assigned entity/site, provisioned outside Atlas. Three readers only: **Atlas Assistant Orchestrator** (access gate), **Reporting & Export**, **Audit & Access Log**. No component writes to it.

The Orchestrator resolves this registry entry into its own session key, `access_scope`, at the point a query needs gating — a caller-specific, per-session binding of role + entity/site, not a cached copy of the registry itself. `access_scope` is one of three terms in Answer Convergence (see the Orchestrator doc §5): an answer cannot compose without it resolved.

## 4. Scope-the-Request Rule (Guardrail 3)
Filter the *request* by the caller's role and assigned entity/site before it reaches a grounding service — not the response after the fact (§4.2). An out-of-scope answer is never generated in the first place; it is not filtered, redacted, or hidden post-hoc at the UI layer. This binds every grounding-service query the Orchestrator issues (Coverage & Ratio Engine, Risk Scoring Engine, Contract Compliance Engine, News & Sector Intelligence) and every export Reporting & Export generates.

## 5. Role-Based PII Redaction & Source-Document Export (§13)
Policy documents (D&O, GPA, workmen's compensation) carry named individuals' personal data. Two distinct controls apply on top of the matrix in §2, per §13 "Personal data handling":

- **Redaction/masking** — any surface that can expose document content (Orchestrator composed answers, posted records, Reporting & Export packs) applies role-based redaction for non-essential viewers, independent of whether that role otherwise holds `R` on the underlying capability.
- **Source-document export restriction** — export of the underlying source document (as opposed to extracted/derived fields) is restricted to authorised roles only.

The PRD does not enumerate which specific roles count as "authorised" for source-document export beyond this general statement — treat that enumeration as an open item, not an inferred fact. Ownership is likewise unresolved: no component in the architecture plan owns this end-to-end (arch §08, guardrail 5) — flagged here as unimplemented, not a described behaviour of any listed component.

**Scope decision (sponsor, 21 Jul 2026):** deferred, not resolved. In-scope Atlas source documents are not expected to carry named-individual personal data in practice; this guardrail stays flagged rather than assigned an owner. Revisit before onboarding any line (e.g. D&O, GPA, workmen's compensation) where that assumption doesn't hold.
