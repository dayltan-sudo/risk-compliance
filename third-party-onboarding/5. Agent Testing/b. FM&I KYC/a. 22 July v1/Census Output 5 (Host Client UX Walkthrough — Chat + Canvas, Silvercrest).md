# Census Test Run 5 — Host Client UX Walkthrough

**A different axis from `Census Output 1–4`.** Every prior round tested whether the agent *orchestration logic* is correct — routing, gates, convergence formulas, precedence rules. This round tests something those never touched: **whether what the agents produce actually reads as a working chat + canvas experience**, checked directly against the two governing PRDs — [`Census Host Client - Product Requirements Document.md`](../../../1.%20Planning%20%26%20Prototyping/a.%20TPA/Census%20Host%20Client%20-%20Product%20Requirements%20Document.md) (the shell: three-pane layout, confidence-indicator behaviour, product principles, failure-state copy) and its FM&I KYC sibling (the process-specific journeys, §7.1–§7.12). Every prior test's human-in-the-loop step was written as `[SIMULATED — human-in-the-loop]` and left abstract ("Requester confirms"). This round writes out **what the chat pane and canvas pane would literally say**, for one full case plus several targeted vignettes, and checks each moment against the PRD's actual requirements — not just "does the backend logic work," but "would a Requester sitting in front of this chatbot understand what to do."

**Primary case: Silvercrest Asset Management** (reusing `Census Output 2/3`'s fully-developed case — Enhanced tier, known gaps, known CTC failure) so this round can focus entirely on presentation, not re-derive facts already validated four times over. Supplementary vignettes reuse Meridian (Q5 recommendation flag) and the fuzzy-match/BU-denial cases already established in `Census Output 4`, cited rather than re-simulated.

Convention: **Chat pane** = conversational, short, plain language (PRD §5). **Canvas pane** = the persistent structured view the Requester actually works in. Both panes are shown wherever the PRD implies both are in play — this is deliberate; a prior round would have just written "presented to the Requester" and moved on.

---

## 0. Sign-in & BU confirmation *(first exercise of TPA PRD §6, in a KYC context)*

**Chat pane**, on the Requester's first write action this session:
> You're signed in as **Priya Nathan**, Requester, Keppel Capital. Is that right?
> `[Yes, that's right]` `[No — flag to R&C]`

`[SIMULATED]` Priya confirms. Per TPA PRD §6 ("a UX safety net for honest mistakes — the actual access boundary is enforced server-side"), this is a UI-level confirmation only; nothing about the actual BU-scoping enforcement changes based on it.

**Finding:** this step is TPA-shell behaviour, reused verbatim per both PRDs' explicit statement that the shell isn't re-specified for KYC. It's never been simulated in any KYC round until now — worth confirming, not fixing, since nothing KYC-specific applies here.

---

## 1. Starting a fresh case — name-required-before-proceeding

`[SIMULATED]` Priya clicks a **"Start KYC"** quick-action chip — no company name typed yet.

**Chat pane:**
> Which company or customer is this for?
> *(Type a name, or pick from your recent cases below.)*
> `Meridian Trust Services Pte. Ltd. — Wave 2, in progress` `Silvercrest Asset Management Pte. Ltd. — Wave 2, in progress`

This is the KYC PRD's explicit cross-reference to TPA PRD §7.2/§7.3's name-required rule ("same rule as TPA PRD §7.2/§7.3"). Priya types "Silvercrest."

**Finding — documentation gap, not a logic bug:** `KYC Orchestrator - Flows.md`'s Flow A diagram opens at `[Entry: Company/Customer Name typed or selected by user]` — it assumes the name already exists at entry and never itself describes the chip-without-a-name prompt the PRD requires. Functionally this is almost certainly fine (it's explicitly meant to inherit TPA's shell behaviour by reference, exactly as the PRD states), but every other cross-cutting shared behaviour in these files gets a one-line pointer where it actually applies (e.g. `KYC Custodian.md`'s repeated "mirrors `Custodian.md`" notes) — Flow A doesn't have the equivalent one-liner for this specific rule. Cheap fix: one line in Flow A's diagram intro, "entry assumes the shell's name-required-before-proceeding prompt (TPA PRD §7.2/§7.3) has already resolved to a name."

---

## 2. Wave 1 — Document Intake & Confirmation

**Chat pane**, after Flow A resolves `MATCH_FOUND` (Silvercrest already exists, staged, Wave 2 confirmed per `Census Output 2`):
> Found it — **Silvercrest Asset Management Pte. Ltd.**, `KYC-SILVERCREST-001`, currently at **Wave 2**. Want to pick up where this left off?
> `[Resume at Wave 2]` `[View full status]`

*(This is Flow A's registry-match resume path, first exercised with literal copy — the mechanism itself was already confirmed working in `Census Output 4`, Test 3b.)*

Since Wave 1 is already long-settled for Silvercrest, this section instead role-plays **what Wave 1 looked like the first time**, reconstructed from `Census Output 2`'s data, to check the confirmation-gate copy that no prior round wrote out literally.

**Chat pane**, after document upload and processing:
> I've matched your 7 documents against the 9 Wave 1 checklist items. Two items are open — take a look in the canvas before confirming.

**Canvas pane:**

| Item | Status | Confidence | Source | Mandatory |
| :-- | :-- | :-- | :-- | :-- |
| 1.1 Certificate of Incorporation | Present | High | Certificate of Incorporation, p.1 | Yes |
| 1.3 Certificate of Change of Name | Missing | — | — | No *(where applicable — ACRA confirms no prior name)* |
| 2.3 Board resolution/POA | **Missing** | — | — | **Yes** |
| 2.6 Government ID (Evelyn Tan Su Min) | **Non-CTC** — self-certification | High | Passport bio-data copy | **Yes** |
| *(5 more items, all Present)* | | | | |

**— Wave 2 (locked — unlocks after CDD Typing) —**
*Contents depend on the resolved tier: Standard = 8 items, Enhanced = adds 3 more. Not requestable yet.*

**Chat pane, confirmation prompt:**
> Two mandatory items are still open (2.3, 2.6) and the ID copy has a certification issue. You can confirm this draft as-is — the gaps carry forward as open items, they don't need to be resolved to stage the case. `[Confirm Wave 1]` `[Not yet — let me check something]`

`[SIMULATED]` Priya confirms.

**Chat pane, handoff:**
> **Wave 1 is staged in RCTP as `KYC-SILVERCREST-001`.** It's not complete — 2.3 and 2.6 are still open, and CDD Typing hasn't started. Go to the canvas to continue with CDD Typing, or come back anytime — this case will be right here.

**Findings:**
1. **The locked Wave 2 placeholder is a real product requirement (FM&I KYC PRD §5 — "a locked 'Wave 2 (unlocks after CDD typing)' section... not a flat list") that no agent file currently instructs anyone to produce.** `KYC DocReviewer.md`/`KYC Orchestrator.md` describe what data goes in Wave 1's draft, but nothing tells `KYC Orchestrator` to also render a locked Wave 2 stub alongside it at this stage. This is worth a one-line addition to `KYC Orchestrator.md` §5 (Output Archetype) — the data doesn't change, but without an instruction, whoever builds the actual client has to infer this PRD requirement exists at all from a document the agent files never cite.
2. **No literal honest-handoff message exists anywhere in the KYC agent files**, unlike TPA's explicit scripted line (`TPA Orchestrator.md`/PRD §7.2 step 6: *"Your onboarding draft is staged in RCTP as [reference]. It has not been submitted..."*). `KYC Orchestrator.md` never states the equivalent line for `kyc_open_case`/`kyc_submit_cdd_typing`/`kyc_submit_wave2_documents`. The confirmation-gate copy above is my own construction, modelled on TPA's pattern and the KYC PRD's own principles — not something derivable from the current `.md` files as written. **This is the single most concrete, fixable gap this round found** — recommend adding an explicit handoff-message template to `KYC Orchestrator.md` §5 or the Output Templates doc, one per write-back (`kyc_open_case`, `kyc_submit_cdd_typing`, `kyc_submit_wave2_documents`), mirroring TPA's scripted pattern exactly.

---

## 3. CDD Typing — Screening Gate & Questionnaire

**Chat pane**, case status while waiting:
> **Waiting on screening resolution.** This case can't move to CDD Typing until name screening on Silvercrest and its connected parties clears — that's handled outside this chat. Check back, or I'll let you know once it clears.

*(Verbatim to the content-free status label both PRDs specify — "no hit data, scores, or match detail ever appears here — purely an unlock gate." Confirmed correctly minimal.)*

`[SIMULATED]` gate clears. **Chat pane:**
> Screening cleared. **CDD Typing is now open** — 19 questions, grouped below. Most are quick yes/no; a few are pre-filled with a suggestion based on what's already on file, clearly marked as a suggestion, not an answer.

**Canvas pane** *(grouped, per TPA PRD §5's field-volume guidance — About Silvercrest / Q1–4 factual vs. Risk Factors / Q5–19 judgment, not one flat 19-row list)*:

**About Silvercrest (Q1–4)**
| Q | Question | Value |
| :-- | :-- | :-- |
| 1 | Listed entity | No |
| **2** | **MAS-regulated FI** | **Suggested: No** *(confidence: Medium — no CMS licence documentation on file; verify before answering)* |
| 3 | SG Government Entity | No |
| 4 | Pension/superannuation scheme | No |

**Risk Factors (Q5–19)** *(collapsed by default — "19 mostly-No questions" is exactly the field-volume problem TPA's guidance exists for; expand to review)*
| Q | Question | Value |
| :-- | :-- | :-- |
| 5–11, 13–19 | *(various)* | No |
| **12** | **Higher-risk business/sector per SG NRA** | *(Requester to answer — fund management sector)* |

**Chat pane, on submit:**
> **Resolved tier: Enhanced.** Q12 was the trigger — fund management is flagged as a higher-risk sector in Singapore's National Risk Assessment. This unlocks Wave 2 (22 items) and skips straight past Simplified, regardless of Q2's answer.

**Findings:**
1. **The "suggested, not confirmed" and screening-derived-recommendation flags read very differently as UI copy than as instruction-file prose**, and this matters: `KYC DocReviewer.md`'s rule ("labelled 'suggested, not confirmed — verify before answering'") is a good instruction for an LLM but the wrong literal string for a UI — a canvas form field showing that whole phrase inline next to every Medium-confidence Q1–4 answer would be noisy at scale. Recommend the client render it as a distinct visual state (e.g. a dashed border + a small "suggested" tag with the confidence/basis in a tooltip or expandable note) rather than literal inline prose — the *meaning* the agent files specify is right, the *presentation* needs a UI pattern, not a sentence, and nothing currently tells whoever builds the client that.
2. **Confirmed working: field-volume grouping transfers correctly by inference from the TPA PRD**, even though nothing KYC-specific states it. 19 CDD-typing questions is squarely in TPA's "30–50 fields ⇒ grouping" range (well, under it alone, but combined with Wave 1/2's ~20 checklist items across a single case's full lifecycle, the *combined* review surface clears that threshold easily — see the Review Pack section below). Worth the same one-line pointer suggested for the locked-Wave-2 finding: `KYC Orchestrator.md` §5 could cite TPA PRD §5's field-volume guidance explicitly rather than leaving it to be inferred.

**Supplementary — the Q5/Q11 screening-derived flag's literal copy** *(not re-run here; reusing `Census Output 4`'s Meridian case)*: that round already confirmed no party name/match score/hit detail leaks into the draft. Rendered as UI copy, it would read: *"Q5 (PEP/adverse-media exposure) — **recommended answer: Yes**, based on the screening resolution. This is a recommendation, not a confirmed answer — review and select the correct response yourself."* Same "suggested, not literal" presentation problem as Finding 1 above applies here too — worth solving once, for both mechanisms together, rather than twice.

---

## 4. Wave 2 — Document Chase

**Chat pane:**
> Wave 2 is now open — **Enhanced tier, 22 items** (this is the only additional round; nothing further gets requested after this one). 3 of 11 primary items are still open from what's on file.

**Canvas pane** *(excerpt — full ledger in `Census Output 2`)*:
| Item | Status | Confidence |
| :-- | :-- | :-- |
| 3.4 UBO Gov ID | Present — certified | High |
| 3.3 AML/CFT + UBO undertaking | **Missing** | — |
| 3.5 UBO proof of address | **Missing** | — |
| 5.3 UBO SOF/SOW documentary proof | **Missing** | — |

Note the CTC-pass item (3.4) shows **no "CTC valid ✓" indicator** — per both PRDs' explicit "evidence, not verdicts" principle, it shows the certification detail (certifier, date, self-cert check result) and lets the reviewer read it as evidence, not a green check mark implying sign-off. Confirmed the current Output Templates doc already avoids a verdict column here — this round just confirms that discipline survives translation into an actual rendered row, not just the markdown table format used in prior test outputs.

**Chat pane, handoff (same gap as §2 — no scripted line exists in the agent files; constructed here on the same TPA-mirrored pattern):**
> **Wave 2 is staged.** 3.3, 3.5, and 5.3 are still open. This case is now at Case Complete-with-open-items — everything that will ever be requested has been asked for; what's outstanding needs the customer, not another wave.

---

## 5. Review Pack *(R&C)* — Field-Volume Treatment at Full Scale

`[SIMULATED]` R&C reviewer opens Silvercrest's case for review. By this point the full case carries **9 (Wave 1) + 19 (CDD Typing) + 11 (Wave 2) ≈ 39 primary items** — squarely inside TPA PRD §5's "30–50 fields, must not be a flat list" range.

**Canvas pane, as currently specified (`FM&I KYC - Output Templates.md`'s Section 4):** one continuous "Checklist Ledger" table, all waves inline, no grouping, no mandatory-only filter.

**Finding — this is the round's other concrete, fixable gap.** TPA's Review Pack (PRD §7.5, mirrored explicitly by KYC PRD §7.9: "Directly mirrors TPA PRD §7.5/§7.6") inherits TPA PRD §5's grouping + "mandatory-review only" filter requirement by the KYC PRD's own stated intent — but `FM&I KYC - Output Templates.md`'s actual worked example never shows it grouped or filterable, just one flat table, same shape regardless of case size. At 9 items (a Wave-1-only case) that's fine; at Silvercrest's 39, it's exactly the "does not survive 50 rows" problem TPA's guidance was written to prevent. Recommend: group the Review Pack table by wave/section (mirroring the CDD-typing grouping already applied above) and note the mandatory-only filter explicitly in the Output Templates doc, rather than leaving it to be inferred the way the locked-Wave-2 placeholder was.

---

## 6. Failure & Denial States — Literal Copy

Three states from KYC PRD §7.11, exercised with actual copy for the first time (previously only referenced as a table row):

**"Document doesn't match any checklist item"** — Priya uploads an old email thread by mistake.
> **Chat pane:** *Couldn't match "RE_ Silvercrest intro call.eml" to any checklist item — filed as unclassified, not attached to anything. If this was meant to satisfy a specific item, let me know which one.*

**"CDD typing incomplete"** — a colleague tries to open Wave 2 early.
> **Chat pane:** *Wave 2 isn't available yet — it depends on which CDD tier applies, and that's still open. Finish the CDD-Typing questionnaire first; Wave 1 stays exactly as it is in the meantime.*

**"Write denied — BU"** — a Requester outside Keppel Capital tries to open Silvercrest.
> **Chat pane:** *This record belongs to a Business Unit you're not set up for. Flag it to your R&C rep if that's wrong.*
*(Verbatim from TPA PRD §7.10 — confirmed correctly inherited unchanged, no KYC-specific rewording needed or attempted.)*

**Not exercised — "Customer email send failed":** correctly unreachable. No send tool exists (Flow J, KIV) — consistent with every prior round's finding that this stays dormant by design.

**Result: all three reachable failure states read clearly and match the PRD's plain-language requirement (§9 — "no internal error codes or system jargon").** No fixes needed here; this section is confirmation, not a finding.

---

## Summary

| Area | Result |
| :-- | :-- |
| BU confirmation, name-required prompt | Confirmed inherited from shell correctly; one-line pointer missing in Flow A (minor doc gap) |
| Locked Wave 2 placeholder | **Gap — not instructed anywhere in the agent files**, though it's a real PRD requirement |
| Honest handoff message | **Gap — no scripted line exists for any of the three KYC write-backs**, unlike TPA's explicit one |
| Suggested-answer / recommended-flag presentation | Meaning is right; literal inline-sentence presentation doesn't scale as UI copy — needs a visual pattern, not prose, called out for whoever builds the client |
| CDD-typing field-volume grouping | Confirmed works by inference from TPA's guidance; not explicitly cited in KYC files |
| Review Pack grouping/filter at full case scale | **Gap — Output Templates doc shows one flat table regardless of size**, same problem TPA's field-volume guidance was written to prevent |
| CTC status without a verdict indicator | Confirmed holds up under actual rendering, not just markdown-table description |
| Failure/denial-state copy (3 of 4 reachable states) | Confirmed clear and PRD-compliant, no changes needed |

**Two concrete, low-cost fixes worth making** (both additive documentation, not behavior changes — nothing about what data the agents produce needs to change): a scripted handoff-message line per write-back in `KYC Orchestrator.md` §5, and explicit grouping/filter guidance for the Review Pack in `FM&I KYC - Output Templates.md`, mirroring what TPA's own output already does. Want me to make those two edits now, the same way the last two rounds' findings got wired in?
