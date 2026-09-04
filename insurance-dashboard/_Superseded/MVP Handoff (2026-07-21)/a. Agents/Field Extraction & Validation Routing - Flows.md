# Field Extraction & Validation Routing — Full Flow Diagrams

Companion to [`Field Extraction & Validation Routing.md`](Field%20Extraction%20%26%20Validation%20Routing.md) §3, which carries only the flow summary table.

---

### Flow A: Extraction Over a Classified Document
Triggered once Intake & Classification hands off a document with `document_class` resolved.
```
[Entry: document_store record + document_class]
                 │
                 ▼
[Node 1: Model Selection] ──► Selects extraction model per document_class
                               (slip / wording / schedule / endorsement /
                               debit note / renewal)
                 │
                 ▼
[Node 2: OCR / NLP / IDP Extraction] ──► Extracts the §8.2 field set over the
                                          document's actual (often bespoke,
                                          broker-specific) layout
                 │
                 ▼
[Node 3: Confidence Scoring] ──► Per-field confidence score
                 │
                 ▼
[Node 4: Source-Location Pointer] ──► Per-field pointer to exact page/region
                                       in the source (FR3.6)
                 │
                 ▼
[Output: extraction_draft + field_confidence_map] ──► Writes session state;
                    hands off to Flow B for routing (PROVISIONAL — not posted)
```

---

### Flow B: Confidence-Threshold Routing
Triggered immediately after Flow A produces `field_confidence_map`.
```
[Entry: extraction_draft + field_confidence_map]
                 │
                 ▼
[Node 1: Per-Field Threshold Check] ──► Reads user:extraction_confidence_config
                                         (admin threshold + per-field overrides)
                 │
        ┌────────┴────────┐
        ▼                  ▼
[confidence ≥ threshold] [confidence < threshold, OR
        │                  mandatory field missing]
        ▼                  ▼
[Node 2a: Pre-Accept]   [Node 2b: salus_queue_exception] ──► Writes
        │                  app:validation_queue entry: reason code + owner
        │                  │
        └────────┬─────────┘
                 ▼
[Output: routed draft] ──► All fields now either pre-accepted or queued;
                            hands off to Flow D for human confirmation
```

---

### Flow C: Manual Questionnaire — Maker-Checker (No Source Document, FR3.9)
Triggered when no broker/policy document, JV asset register, or P&C schedule exists for an asset. No OCR confidence exists to threshold against, so this flow substitutes a mandatory second-person check.
```
[Entry: Assigned user determines no source document exists]
                 │
                 ▼
[Node 1: Preparer Completes Questionnaire] ──► Enters every mandatory
                                                 §8.2 field (e.g. declared
                                                 value, TIV) in-system
                 │
                 ▼
[Node 2: salus_submit_questionnaire] ──► Precondition: all mandatory §8.2
                                          fields completed. Writes entries
                                          to questionnaire_draft, tagged
                                          'manual entry — no source document'.
                                          No confidence score generated.
                 │
                 ▼
[Node 3: Mandatory Checker Review] ──► A DIFFERENT authorized user (never
                                        the preparer) reviews each field
                                        against its supporting rationale
                                        (JV register ref, verbal confirm
                                        source) and confirms or corrects it
                                        directly — preparer cannot self-
                                        confirm their own questionnaire
                 │
                 ▼
[Node 4: Validation Convergence Met] ──► Once every mandatory field is
                                          checker-confirmed, same test as
                                          extracted data (§6)
                 │
                 ▼
[Output: questionnaire_draft, checker-confirmed] ──► Hands off to Flow D
```

---

### Flow D: Human Validation & Confirmation
Triggered by either Flow B's routed draft or Flow C's `questionnaire_draft`. Node 1a (confidence confirm/adjust) is an addition to this existing step, not a new flow.
```
[Entry: Pre-accepted fields + queued exceptions + questionnaire_draft]
                 │
                 ▼
[Node 1: Reviewer Confirms or Corrects] ──► Human confirms pre-accepted
                                             fields, resolves each queued
                                             exception, confirms questionnaire
                                             entries
                 │
                 ▼
[Node 1a: Confidence Confirm/Adjust (NEW)] ──► For any field, reviewer may
                                                open its source-location
                                                pointer (FR3.6) and
                                                explicitly confirm or adjust
                                                the confidence level itself,
                                                not only the field's value
                                                — ties to Low-confidence
                                                extraction alert (§12.1 #3)
                 │
                 ▼
[Node 2: Mandatory-Field Check] ──► Verifies no mandatory field (§8.2)
                                     remains unconfirmed
                 │
        ┌────────┴────────┐
        ▼                  ▼
   [Unresolved]        [All resolved]
        │                  ▼
   [validation_status  [Node 3: Validation Convergence Check]
    stays PENDING]          │
                             ▼
                   [Node 4: salus_submit_validation] ──► Writes
                            validated_record; validation_status = CONFIRMED
                             │
                             ▼
                   [Output: validated_record] ──► Handoff to Enrichment &
                            Posting — NOT posted to app:policy_registry here
```

---

### Flow E: Document Reprocessing (FR3.8, Could/V2)
Triggered by re-running a document (e.g. after model improvement) or a corrected re-upload.
```
[Entry: Existing ingestion_id + new/updated source document]
                 │
                 ▼
[Node 1: Re-Extraction] ──► Re-enters at Flow A against the same
                             ingestion_id
                 │
                 ▼
[Node 2: New Draft Version] ──► Produces a new extraction_draft version;
                                 prior version retained, not overwritten
                                 (FR3.7)
                 │
                 ▼
[Node 3: Re-Route] ──► Re-enters Flow B; previously-confirmed fields are
                        not silently carried over as confirmed — each
                        version passes its own threshold check
                 │
                 ▼
[Output: New draft version] ──► Re-enters Flow D for fresh human
                                 confirmation
```
