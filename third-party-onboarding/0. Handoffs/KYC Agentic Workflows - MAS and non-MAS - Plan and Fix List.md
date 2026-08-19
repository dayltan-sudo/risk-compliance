# KYC Agentic Workflows (MAS-regulated & non-MAS) — Plan & Fix List

**Owner:** Da'yl Tan, Senior Manager, Risk & Compliance — Keppel
**Date:** 23 June 2026  ·  **Status:** Working notes — **later phase** (runs after TPA establishes the shared platform). Pick the Fix List (§7) back up next time.
**Scope:** MAS-regulated KYC and non-regulated KYC agentic workflows. The TPA workflow is in the companion doc *"TPA Agentic Workflow - Implementation Plan and Fix List"*.

> **Sequencing:** TPA is built first and **establishes the shared guardrail + capability platform**. KYC **reuses that platform** and adds its own bespoke orchestration — so this is the second wave, not a parallel rebuild.

---

## 1. How to resume

Re-read §2–§4 for context, then work the **Fix List (§7)** (checkboxes = to-do). Nothing here is built yet; this is direction, and it depends on the TPA platform existing first.

## 2. Goal & bottleneck (KYC)

- **Goal:** cut **requester** and **reviewer** time, by having an LLM read/interpret documents and pre-fill / draft what it can.
- **#1 bottleneck (your assessment):** **checking documents + the back-and-forth chasing missing / non-CTC documents** from the customer. (This is *customer-facing* — a risk class TPA didn't have.)

## 3. Shared principles (reused from the TPA platform)

- **Governance spine:** LLM produces a **verifiable first draft**; the **human maker who checks before the API call is accountable**; **native maker–checker** routes to R&C on top.
- **Risk posture:** autonomous only on **high-confidence factual gaps**; every **regulated judgment** is surfaced for human review.
- **Architecture:** reuse the TPA-built **guardrail + capability layer** (identity, access control, BU scoping, audit, maker-checker, document read → extract → check → draft → validated-API-write); only the **KYC orchestration** is bespoke.

## 4. KYC-specific process facts (established)

- **Document sequencing:** send the **base required-document set upfront** (definitely required regardless of CDD type), then chase the **enhanced set** after standard-vs-enhanced CDD typing is determined.
- **CDD type** is determined via a questionnaire that depends on a human resolving **name-screening hits** first — so the enhanced-doc chase is necessarily *later-stage*.
- **Screening-hit resolution is out of scope** — not a major time sink, and there is **no API** to extract or resolve hits.
- **CTC handling:** no certification stamp → high-confidence gap, list to the customer to rectify; stamp present → agent extracts *who certified it* and **flags for human review** (certifier eligibility under MAS rules is a regulated judgment, not auto-decided).

## 5. What held up (sound)

- Bottleneck correctly located (document chase), and realistic about its late-stage sequencing.
- Screening-hit resolution correctly out of scope (no API, not the bottleneck).
- The CTC posture (act on factual gaps; surface eligibility judgments).
- Reuse-the-platform architecture (no full rebuild).

## 6. Cracks / open risks (by severity)

1. **No measured baseline (MED-HIGH).** Confirm where the KYC time actually goes (chase cycles vs checking) before building.
2. **Document classification is the unproven backbone (MED-HIGH).** The missing-doc list depends on the agent correctly recognising which checklist item each uploaded document satisfies. A false **"present"** (thinks a requirement is met when it isn't) hides a gap — the dangerous direction. Needs accuracy testing + a confidence threshold.
3. **Customer-facing emails — new external-comms risk (MED).** Always human-reviewed before send; accuracy matters (asking for a doc already provided erodes trust); data-protection / customer-comms standards apply.
4. **Non-regulated KYC is unscoped (LOW-MED).** A distinct process with its own parties, sequence, and required docs — give it its own scoping before assuming it mirrors MAS KYC.

## 7. Fix list — the to-do (pick up here)

- [ ] **Codify the required-docs checklists** (Excel, per CDD type) — the KYC twin of the TPA property mapping. Split into **base set** (upfront) and **enhanced set** (post-typing). *This is the key reference dependency.*
- [ ] **Measure the KYC baseline** (≈10 cases): chase cycles, time-to-complete-documents — confirm the bottleneck before building.
- [ ] **Build the document-checking + missing-doc detector** against the codified checklist; output present / missing / non-CTC per item.
- [ ] **Build CTC triage:** no-stamp → auto-list to customer; stamp present → certifier extracted + flagged for eligibility review.
- [ ] **Build the two-wave rectification email drafts** (base upfront, enhanced after typing) — **human-gated before send**, every time.
- [ ] **Write the agent's confidence/action policy:** autonomous only on high-confidence factual gaps; surface all judgments; never mark a requirement "satisfied" without a verifiable source.
- [ ] **Run an accuracy eval** on document classification + CTC detection against real, messy documents before trusting the output.
- [ ] **Scope non-regulated KYC separately** (parties, sequence, required docs) — don't assume it mirrors MAS KYC.

## 8. Edge cases worth building (high benefit)

- **Two-wave document chase** — base set upfront, enhanced after CDD typing; auto-draft both rectification emails for human review.
- **CTC triage** — no-stamp → customer rectification; stamp-present → certifier surfaced for eligibility check.
- **Discrepancy flagging** — when a document contradicts the questionnaire/registry, surface it for the reviewer.
- **Provenance / citation** — every present/missing/CTC verdict links to its source so the reviewer/maker can spot-check.

## 9. Where we left off / next time

This is the **second wave**, gated on the TPA platform existing. **Highest-leverage first move: codify the required-docs checklists** (Fix #1) — without that authoritative reference, the missing-doc detection can't be reliable. Then measure the baseline and define the confidence/action policy. Resume from the Fix List.

---

*Working notes — a design and governance aid, not legal advice. Governed by RC003-05 and related R&C / MAS AML-CFT requirements; confirm against the current SharePoint copies.*
