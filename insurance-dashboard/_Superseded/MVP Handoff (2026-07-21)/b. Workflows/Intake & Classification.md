# Workflow Specification: Intake & Classification

> **Workflow, MVP.** Deterministic — virus-scan/store/ID is plumbing; document-type detection is one bounded classifier call, not multi-step reasoning or tool choice. Not an agent (§02). Absorbs §9 stages 1–2. **Companion docs:** downstream — [`Field Extraction & Validation Routing.md`](../a.%20Agents/Field%20Extraction%20%26%20Validation%20Routing.md). Field set — [`../d.%20Reference/Atlas%20Reference%20-%20Extraction%20Field%20Set.md`](../d.%20Reference/Atlas%20Reference%20-%20Extraction%20Field%20Set.md). State schema — [`../c.%20State/Atlas%20-%20Google%20ADK%20State%20Reference.md`](../c.%20State/Atlas%20-%20Google%20ADK%20State%20Reference.md).

## 1. Core Mandate & Operational Objectives
You are the entry point of the document ingestion pipeline. You accept single and bulk uploads of PDF (native and scanned), image, Word, and Excel documents (FR3.1); virus-scan and store each immutably; and assign an `ingestion_id` per document, including within a bulk batch. You then detect document type — slip, wording, schedule, endorsement, debit note, renewal (FR3.2) — so [Field Extraction & Validation Routing](../a.%20Agents/Field%20Extraction%20%26%20Validation%20Routing.md) can select the right extraction model. The classification step is one bounded classifier call with a fixed output set; it has no ambiguity to resolve and no tool to choose between, which is why this component is a workflow, not an agent (§02).

You never extract fields, never route to human review, and never post data. Your output is a stored document plus a resolved `document_class` — nothing more.

**Open item:** policy documents (D&O, GPA, workmen's comp) can carry named individuals' personal data, and `app:document_store` is one of the surfaces that exposes document content (§13). No component in the pipeline currently owns role-based redaction/masking or export restriction on the raw store — flagged, not resolved, here.

**Scope decision (sponsor, 21 Jul 2026):** deferred, not resolved. In-scope Atlas source documents are not expected to carry named-individual personal data in practice; this guardrail stays flagged rather than assigned an owner. Revisit before onboarding any line (e.g. D&O, GPA, workmen's compensation) where that assumption doesn't hold.

## 2. State Management
See [`Atlas - Google ADK State Reference.md`](../c.%20State/Atlas%20-%20Google%20ADK%20State%20Reference.md) for the full schema. You write `app:document_store`. Session keys: `ingestion_id`, `document_class`, `intake_status`.

## 3. Deterministic Execution Flow
```
[Entry: Document upload — single or bulk (PDF, scanned image, Word, Excel)]
                 │
                 ▼
[Node 1: Virus Scan] ──► Fails closed; infected or unreadable files rejected,
                          never reach the store
                 │
                 ▼
[Node 2: Immutable Store + Ingestion ID] ──► Writes to app:document_store;
                                              assigns ingestion_id (one per
                                              document, even inside a bulk batch)
                 │
                 ▼
[Node 3: Document-Type Classification] ──► One bounded classifier call:
                                            slip / wording / schedule /
                                            endorsement / debit note / renewal
                                            (FR3.2) — no multi-step reasoning
                 │
                 ▼
[Node 4: Classified?] ──No──► [Exception queue: reason code
                 │             "classification failed" (§9.1)]
                Yes
                 ▼
[Output: document_class resolved, intake_status = READY] ──► Handoff to
                    Field Extraction & Validation Routing, which selects the
                    extraction model per document_class
```
Trigger: `atlas_upload_document` (entry point, no precondition). `atlas_classify_document` (sole caller Intake & Classification; precondition: virus scan passed, `ingestion_id` assigned).

## 4. Format & Bulk Handling (FR3.1)
| Format | Handling |
| :--- | :--- |
| PDF — native | Passed through as-is to downstream extraction |
| PDF — scanned image | Flagged for OCR at the extraction stage; no OCR performed here |
| Image (common formats) | Same as scanned PDF |
| Word | Passed through; text-native |
| Excel | Passed through; typically the source for SOV/schedule-type uploads |

Bulk upload accepts multiple documents in one submission; each proceeds through Nodes 1–3 independently — one bad file in a batch does not block the rest.

## 5. Document-Type Classification (FR3.2)
Six output classes: **slip, wording, schedule, endorsement, debit note, renewal**. The class selects which extraction model Field Extraction & Validation Routing applies — different document types carry different field densities and layouts against the §8.2 field set (e.g. a schedule carries Period/Coverage/Retention fields; a debit note carries Premium fields). Classification failure or low confidence routes the document to the exception queue with a reason code and an assigned owner (§9.1) rather than guessing a class.

## 6. Failure & Denial Handling
| State | Behaviour |
| :--- | :--- |
| Virus scan fails | File rejected and quarantined; no `ingestion_id` assigned, no store write |
| Unsupported file format | Rejected at intake; reason code returned to uploader |
| Classification fails or low-confidence | Routed to exception queue with reason code + owner (§9.1); `document_class` left unresolved |
| Bulk batch partial failure | Each document succeeds or fails independently; no batch-wide rollback |
| Re-upload of a previously ingested document | New `ingestion_id` issued here; deduplication and version continuity are handled downstream at Field Extraction (FR3.8), not at intake |

Every write logs to `app:audit_log` (`atlas_write_audit`, no exceptions).
