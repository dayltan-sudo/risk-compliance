# Salus Assistant Orchestrator — Full Flow Diagrams

Companion to [`Salus Assistant Orchestrator.md`](Salus%20Assistant%20Orchestrator.md) §3, which carries only the flow summary table.

---

### Flow A: Intent & Page-Context Routing
Triggered by a typed free-text question or a suggested-prompt selection, on any page.
```
[Entry: User question (typed or suggested prompt) + current page_context]
                 │
                 ▼
[Node 1: NL Intent Classification] ──► Candidate intent(s) over coverage, sites,
                                        renewals, risk scores, contractual
                                        requirements (FR8.3)
                 │
                 ▼
[Node 2: Page-Context Prior] ──► Reweights candidates using page_context (PRD §11
                                  view in focus) — a prior, not a hard filter; same
                                  question from two views can still reach the same
                                  grounding service with different default framing
                 │
                 ▼
[Node 3: Grounding-Service Target Selection] ──► Resolves one or more of: Coverage
                                                  & Ratio Engine, Risk Scoring Engine,
                                                  Contract Compliance Engine, News &
                                                  Sector Intelligence (V2), or the
                                                  ingestion-status read
                 │
                 ▼
[Output: resolved_intent] ──► Written to session state; handed to Flow B
```

---

### Flow B: Access-Scope Gate
Triggered immediately after Flow A resolves an intent, before any grounding call.
```
[Entry: resolved_intent + caller identity]
                 │
                 ▼
[Node 1: Load Scope Entry] ──► Reads app:user_scope_registry for the caller
                 │
                 ▼
[Node 2: Resolve access_scope] ──► Binds role + assigned entity/site (§4.2)
                 │
                 ▼
[Node 3: Filter the Request] ──► Attaches the scope filter to the outbound query
                                  itself — scoping the request, not the response
                                  (guardrail 3) — before it reaches any grounding
                                  service
                 │
                 ▼
          ◇ In scope? ◇
           │yes      │no
           ▼          ▼
     [Output:    [Denial — plain-language,
   access_scope]  no grounding call made (§10)]
                 │
                 ▼
            Flow C
```

---

### Flow C: Grounding Fan-Out
Triggered by Flow B passing the gate.
```
[Entry: Scope-filtered query + grounding-service target(s)]
                 │
                 ▼
[Node 1: Dispatch salus_query_grounding] ──► One call per targeted service:
                                              Coverage & Ratio Engine, Risk Scoring
                                              Engine, Contract Compliance Engine,
                                              News & Sector Intelligence (V2 only,
                                              advisory — guardrail 4)
                 │
                 ▼
[Node 2: Ingestion-Status Read] ──► If intent concerns document/validation status,
                                     reads app:validation_queue (Field Extraction &
                                     Validation Routing) directly — no second cache
                 │
                 ▼
[Node 3: Collect Responses] ──► Buffers raw payloads in temp:grounding_payloads;
                                 empty/errored service responses excluded
                 │
                 ▼
[Output: grounding_results] ──► Handed to Flow D (or Flow E if empty)
```

---

### Flow D: Answer Composition & Citation Assembly
Triggered by Flow C returning at least one non-empty result.
```
[Entry: grounding_results]
                 │
                 ▼
[Node 1: Select Best-Fit Result(s)] ──► Matched against resolved_intent
                 │
                 ▼
[Node 2: Citation Assembly] ──► salus_get_lineage per cited record; builds
                                 citation_set (FR8.4) — no answer without one
                 │
                 ▼
[Node 3: Compose Answer] ──► NL answer bound to grounding_results + citation_set
                              only, never model prior knowledge
                 │
                 ▼
          ◇ Answer Convergence met? ◇
     (access_scope ∧ grounding_results ∧ citation_set)
           │yes                    │no
           ▼                        ▼
   [Output: answer_status       [Route to Flow E]
    = ANSWERED, shown to user]
```

---

### Flow E: No-Answer Fallback
Triggered when Answer Convergence is unmet — empty `grounding_results` or empty `citation_set`.
```
[Entry: Answer Convergence unmet]
                 │
                 ▼
[Node 1: Set answer_status = NO_ANSWER]
                 │
                 ▼
[Node 2: Return FR8.5 Fallback] ──► States explicitly that no answer is available —
                                     never guesses, never fabricates a citation
                 │
                 ▼
[Output: Fallback message shown to user]
```

---

### Flow F: Action Items Rail Population
Triggered on page load and on underlying data change, independent of any user question.
```
[Entry: page_context + trigger event]
                 │
                 ▼
[Node 1: Access-Scope Filter] ──► Same gate as Flow B — applied to candidate items
                                   before display, not after
                 │
                 ▼
          ◇ page_context ∈ {Group Overview, Global Map}? ◇
           │yes                              │no
           ▼                                  ▼
[Node 2a: Full Group-Wide List]      [Node 2b: Page-Scoped List]
Coverage gaps, expiring policies,    Items relevant to the current
low-confidence records, contractual  view/module only (FR1.5)
requirement gaps, exclusion
conflicts — unfiltered by page
           │                                  │
           └──────────────┬───────────────────┘
                           ▼
              [Output: Action Items rail populated]
```
