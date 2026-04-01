# System Concept: Backlog Synthesizer

## Value Proposition
Transform meeting minutes into confirmed backlog items — cross-referencing against the current backlog, architecture guidelines, and prior meeting history — resolving issues interactively with stakeholders and producing decision memos.

## How It Works
1. User loads a meeting transcript into the system
2. System queries knowledge base for relevant context (architecture, backlog, prior meetings & decisions)
3. System analyzes the transcript, produces candidate stories, cross-references against all context
4. System presents results in UI: candidate stories, conflicts, overlaps, constraint violations, ambiguities
5. User reviews items per meeting — each story has a status and can be reviewed/confirmed/rejected
6. System asks targeted questions to resolve issues (conflicts → architect/PM, priorities → PM, feasibility → architect)
7. Once confirmed, stories are ready to push into backlog via normal process
8. All artifacts logged and stored in knowledge base:
   - Meeting minutes (original transcript)
   - Generated candidate stories with statuses
   - Approval/rejection decisions with rationale
   - Decision memo
   - Decision log (cumulative record across meetings)

## Story Lifecycle

Each story has **checks** (independent issues to resolve) and a **status** (overall progress).

### Story checks
Each generated story is automatically evaluated against multiple checks. Each check has its own resolution:

| Check | Resolved By | Possible Outcomes |
|---|---|---|
| Architecture constraint | Architect | Passed / Violation (modify story or accept risk) |
| Priority conflict | PM | Priority clarified / Deferred |
| Dependency | Dev Lead | Acknowledged / Reordered / Blocked |
| Overlap/duplicate | Dev Lead | Merge / Keep both / Skip |
| Prior decision conflict | PM + Architect | Reaffirm prior / Override with rationale |
| NFR validation | Architect | Feasible / Needs redesign |
| Ambiguity | PM | Clarified / Split into separate stories |
| **New epic proposal** | **PM (mandatory)** | **Approved / Rejected / Merge into existing epic** |

### New epic approval
When the system proposes a new epic, it is a separate explicit check requiring PM approval. The proposal includes:
- Why existing epics don't fit (what's different about these requirements)
- Suggested epic name, goal, and scope
- Which stories from this meeting would belong to it
- Confidence level

Stories grouped under a proposed epic stay in **Pending Decision** until the epic itself is approved. If the epic is rejected, stories are either reassigned to an existing epic or rejected.

New epic creation is a significant scope decision — it affects roadmap structure, planning, and resource allocation. The system flags it explicitly rather than silently creating groupings.

A story may have zero or many checks. Zero checks = no issues found, but **still requires human confirmation**.

### Story status

```
Generated → All Checks Resolved? → Awaiting Confirmation → Confirmed → Ready to Push
                  ↓ no                                          ↓
            Under Review                                    Rejected
            (resolve checks)                           (rationale stored)
```

| Status | Meaning |
|---|---|
| Generated | System produced the story, checks assigned |
| Under Review | Has unresolved checks — waiting on human decisions |
| Awaiting Confirmation | All checks resolved (or none found) — needs final human approval |
| Confirmed | Human explicitly approved |
| Rejected | Human rejected (rationale stored for future context) |
| Ready to Push | Confirmed and queued for backlog integration |

**Every story requires explicit human confirmation** — even if all checks pass automatically. No story moves to Confirmed without a human saying yes.

**Note:** The system does NOT add stories to the actual backlog. It produces confirmed candidates. Pushing to backlog happens through normal planning process outside this system.

### Example

```
Story: "Add Gemini LLM support"
  ├── Architecture check:       ✅ Passed
  ├── Priority check:           ⚠️ Needs PM decision (3 urgent items already)
  ├── Dependency check:         ✅ Resolved (depends on ERIS-042, acknowledged)
  ├── Overlap check:            ⚠️ Partial overlap with ERIS-031
  └── Story status:             Under Review (2 checks unresolved)

  ... PM resolves priority, Dev Lead merges with ERIS-031 ...

  ├── All checks:               ✅ Resolved
  └── Story status:             Awaiting Confirmation

  ... PM clicks Confirm ...

  └── Story status:             Confirmed → Ready to Push
```

## UI Requirements

The system needs a UI to support the review workflow:

### Views
- **Per-meeting view** — load a meeting, see all generated stories and issues for that meeting
- **Per-story view** — see a single story with all its checks, history, and source text
- **Action list (per role)** — logged-in user sees all pending actions for their roles (one user can have multiple roles), sorted by creation date. Shows conflicts to resolve, decisions to make, confirmations needed.
- **Story list with statuses** — filter/sort by status (generated, under review, awaiting confirmation, confirmed, rejected)

### Actions
- **Check resolution panel** — per story, show all checks with status, resolve inline
- **Story editing** — user can edit generated stories (acceptance criteria, description, tags, etc.). System stores the original AI-generated version and tracks all edits. If the edited story conflicts with the original meeting minutes, system warns the user ("Your edit removes requirement X that was explicitly stated in the transcript").
- **Final confirmation action** — explicit approve/reject (available only when all checks resolved)
- **Review actions** — flag for escalation, split story

### Dashboard
- **Key metrics** — stories generated vs confirmed vs rejected, average time from Generated → Confirmed, checks pending by role, conflicts open vs resolved, stories per meeting

### Reference
- **Decision memo view** — generated summary of decisions made, includes meeting quality feedback (e.g., "8 of 12 requirements were ambiguous — consider structured meeting template")
- **Knowledge base browser** — search prior meetings, decisions, stories
- **Audit trail view** — trace any output back to source text, view original AI-generated version vs human-edited version

## Actors
| Actor | Role in the Process |
|---|---|
| PM / Product Owner | Reviews candidate stories, resolves priority conflicts, approves scope |
| Architect | Resolves technical conflicts, confirms feasibility against architecture |
| Dev Lead | Reviews overlap with current backlog, confirms effort implications |

**Note:** Actors participate in **review, approval, and escalation** — not data entry. Data is ingested from sources (wiki export, backlog integration). For this project: all data is synthetic. The design supports future real integrations (JIRA, Confluence, etc.).

## Inputs (automated/integrated)
- **Meeting transcript** — one at a time, markdown text
- **Architecture doc** — exported from wiki/confluence (.md) — generated synthetically in our case
- **Current backlog** — integrated from JIRA/GitHub (JSON) — mocked in our case
- **Knowledge base** — accumulated from prior meetings, decisions, and outputs (RAG)

## Interactive Process

```
Meeting transcript
       ↓
   [ 1. Context Retrieval ]
   Broad retrieval from KB → relevance filtering → focused context
       ↓
   [ 2. Analyze with focused context ]
   Extract requirements, NFRs, dependencies, priority signals
       ↓
   [ 3. Cross-reference ]
   Check against: backlog (overlaps, duplicates), architecture (constraints),
   decision log (contradictions with prior decisions), existing stories (dependencies)
       ↓
   [ 4. Generate outputs ]
   Candidate stories + conflict report + overlaps + violations + ambiguities
   Each output grounded in source text with confidence level
       ↓
   [ 5. Present in UI ]
   Per-meeting story list with statuses, issues, questions
       ↓
   [ 6. Human reviews ]
   Confirm / reject / modify / escalate each item
   Answer questions, resolve conflicts
       ↓
   [ 7. Finalize ]
   Confirmed stories (ready to push) + decision memo
       ↓
   [ 8. Store in KB ]
   All artifacts stored; feedback from corrections improves future runs
```

## System Outputs

### Per-meeting analysis:
- **Candidate stories** — with acceptance criteria, feature tags, priority signals, confidence level
- **Non-functional requirements (NFRs)** — extracted and tagged separately (performance, security, scalability, etc.), validated against architecture constraints
- **Dependencies** — detected between generated stories and existing backlog items ("this story requires ERIS-042 to be done first")
- **Conflict report** — new items conflicting with existing backlog OR prior confirmed decisions + proposed resolution
- **Overlap/duplicate report** — matches with existing items + suggested action (merge, skip, update)
- **Backlog hygiene flags** — existing backlog items that may be obsolete based on new meeting decisions ("Meeting decided to drop feature X — ERIS-023 may be obsolete")
- **Constraint violations** — items violating architecture guidelines + what needs to change
- **Ambiguity flags** — unclear requirements + specific questions for stakeholders
- **Story granularity** — system proposes level (epic / story / task); flags items too vague or too large, suggests splitting
- **Backward traceability** — every backlog item traceable to its source meeting and specific text

### Resolution support:
- Targeted questions routed to the right role (tech → architect, priority → PM, backlog → dev lead)
- Proposed resolutions for each issue (human decides)
- Help with backlog overlap — suggest merging, updating existing items, or creating new ones

### Decision memo (sent to meeting participants):
- Summary of meeting → backlog items produced
- Decisions made during review (approved, modified, rejected — with rationale)
- Open items and assigned owners
- Conflicts resolved and how

### Confidence levels (on all outputs):
| Level | Meaning |
|---|---|
| High | Clearly stated in transcript, directly supported by source text |
| Medium | Inferred from context, reasonable interpretation |
| Low | Weakly implied, may need human validation |

## Knowledge Base

### Three-layer storage:
| Layer | Content | Used For |
|---|---|---|
| **Summary** | Key decisions, requirements extracted, outcomes per meeting | Context retrieval (goes into LLM context) |
| **Structured** | Generated stories, decision log entries, conflict resolutions, NFRs | Cross-referencing, duplicate/dependency detection |
| **Raw** | Original transcript, full decision memo | Audit trail, drill-down on demand |

Retrieval works top-down: search summaries first → pull structured data if relevant → link to raw source only when needed.

### Context retrieval (for large KB):
1. **Broad retrieval** — semantic search + keyword matching across KB based on meeting topics
2. **Relevance filtering** — agent reviews retrieved items, drops irrelevant context, keeps only what matters
3. If meeting references prior context but nothing found → flag as ambiguity

### KB learns from feedback:
- Human corrections (modifications, rejections with rationale) stored as feedback
- Future runs use this feedback to improve: "last time a similar story was rejected because X"
- Prior decisions actively checked — new proposals that contradict confirmed decisions are flagged as conflicts

## Scope Boundaries

**In scope:**
- Parse meeting transcript into candidate backlog items with lifecycle statuses
- Extract and separately tag non-functional requirements (NFRs)
- Detect dependencies between stories and existing backlog items
- Propose story granularity (epic / story / task) and suggest splitting
- Extract priority signals (urgency cues, deadlines mentioned)
- Cross-reference against current backlog (conflicts, overlaps, duplicates)
- Cross-reference against architecture doc (constraint violations)
- Cross-reference against decision log (contradictions with prior decisions)
- Flag existing backlog items that may be obsolete based on new decisions
- Retrieve context from knowledge base (prior meetings, decisions)
- Present analysis in UI, ask targeted questions to resolve issues
- Propose resolutions for conflicts and overlaps
- Display confidence level on all outputs
- Produce decision memo for meeting participants
- Store all outputs and decisions in knowledge base
- Learn from human feedback (corrections improve future runs)
- Produce audit trail with backward traceability (any item → source meeting + text)
- UI for per-meeting review workflow
- Story editing with drift detection (warn if edit conflicts with source meeting)
- Metrics dashboard (generated/confirmed/rejected counts, review times, pending checks)
- Meeting quality feedback in decision memo (ambiguity ratio, actionability score)

**Out of scope:**
- Adding stories to the actual backlog (system produces confirmed candidates; pushing to backlog happens through normal planning process)
- Priority assignment or sprint planning (extracts signals, doesn't assign)
- Story assignment to team members
- Real-time meeting transcription
- Non-text inputs (PDF, audio, video)

**Limitations:**
- Scope decisions on confirmed stories happen outside this system via normal planning process
- The system proposes, humans decide — it does not autonomously modify any external system

## Known Challenges & Assumptions

### Priority conflicts
- Meeting may say "urgent" when backlog already has many urgent items
- Two meetings may give conflicting priority to the same area
- **Assumption:** System surfaces priority conflicts with full context (what's already urgent, what's new). PM makes the call.

### Approval workflow
- Multiple reviewers may disagree (PM approves, Architect flags violation)
- **Assumption:** Architect veto on technical feasibility. PM decides priority/scope. Dev Lead advises on effort/overlap. If unresolved → status: Pending Decision.

### Duplicate detection confidence
- Overlaps range from exact duplicates to partial thematic similarity
- **Assumption:** System reports confidence level (high/medium/low). High = likely duplicate, suggest skip. Medium = partial overlap, suggest review. Low = thematic similarity, inform only.

### Hallucination / grounding
- System generates stories and acceptance criteria — risk of fabricating requirements not in the transcript
- **Requirement:** Every generated story must cite specific source text from the transcript. Every proposed resolution must reference the items it resolves. No output without grounding.
- **Mitigation:** Prompt instructs the model to only produce outputs grounded in provided materials. Validation step checks that cited text exists in source. Confidence level reflects grounding strength.

### NFR storage and validation
- NFRs extracted from meetings need to be stored, tagged by type (performance, security, etc.), and validated against architecture constraints
- **Assumption:** NFRs stored as structured items in KB, linked to source meeting. Architecture constraint check applies to NFRs same as functional stories.

## Key Design Decisions

| # | Decision | Rationale |
|---|---|---|
| 1 | Per-meeting processing | Each meeting produces candidates that go through interactive review |
| 2 | Story lifecycle with statuses | Stories progress through review stages; decisions can be deferred (Pending Decision) |
| 3 | Interactive resolution via UI | System proposes, human decides in a structured UI workflow |
| 4 | Role-based escalation | Route questions to the right person (tech → architect, priority → PM) |
| 5 | Inputs are integrated, not manual | Architecture from wiki, backlog from integration — actors only review |
| 6 | System does NOT push to backlog | Produces confirmed candidates; actual backlog update is outside scope |
| 7 | Audit trail + backward traceability | Every output traceable to source text; every backlog item traceable to source meeting |
| 8 | Knowledge base with 3-layer storage | Summaries for retrieval, structured for cross-reference, raw for audit |
| 9 | Two-stage context retrieval | Broad retrieval → relevance filtering, keeps context window manageable |
| 10 | Grounding requirement | All outputs must cite source text, mitigating hallucination risk |
| 11 | Confidence levels on all outputs | High/medium/low indicating how strongly grounded in source material |
| 12 | Feedback loop | Human corrections stored and used to improve future runs |
| 13 | Decision memo per meeting | Participants get a record of what was produced and decided |
| 14 | NFRs extracted separately | Non-functional requirements tagged by type and validated against architecture |
| 15 | Dependency detection | System identifies dependencies between new stories and existing backlog |
| 16 | Backlog hygiene | Flags existing items potentially obsolete based on new decisions |
| 17 | Story editing with drift detection | Users can edit stories; system warns if edit diverges from source transcript |
| 18 | Metrics dashboard | Measure the process: throughput, review times, conflict rates |
| 19 | Meeting quality feedback | Memo includes input quality signals to improve future meetings |
| 20 | Epic creation requires explicit PM approval | New epics affect roadmap/planning — not created silently |

---

## AI Prompts Used

**Session 1.1 — Alternative Framings (AI Explore)**

Prompt: "Challenge the scope boundaries. Should it: detect priority signals? Merge across meetings or per-meeting? Resolve conflicts or just flag? Support PDF/audio?"

Decisions: Per-meeting, priority signals yes, propose resolutions (human decides), text only.

**Session 1.1 — Concept Review (AI Review)**

Prompt: "Review the concept — what about audit trail? What about actor roles?"

Findings:
- Added audit trail as in-scope requirement
- Actors are reviewers/approvers, not data providers — data comes from integrations
- System is interactive: presents analysis, asks questions, proposes resolutions

**Session 1.1 — SDLC Best Practices Review**

Prompt: "Check concept against SDLC best practices and typical issues"

Issues found and resolved:
1. Priority conflicts → Known Challenges section
2. Story granularity → system proposes level, suggests splits
3. Rejected item handling → decision memo captures all decisions
4. Context loss between meetings → knowledge base (RAG)
5. Approval workflow → role authority defined
6. Duplicate confidence → high/medium/low levels

**Session 1.1 — Deep SDLC + AI Best Practices Review**

Prompt: "Analyze concept against a) SDLC best practices for missing use cases b) AI best practices for process gaps"

SDLC issues added:
1. Backward traceability → every item traces to source meeting + text
2. Scope creep → out of scope; system produces candidates, planning happens outside
3. NFRs → extracted separately, tagged by type, validated against architecture
4. Dependencies → detected between stories and existing backlog
5. Prior decision contradictions → folded into conflict detection (check decision log)
6. Backlog hygiene → flag obsolete existing items

AI issues added:
7. Hallucination → grounding requirement: every output cites source text
8. Confidence scoring → all outputs have high/medium/low confidence
9. Context retrieval → two-stage (broad + relevance filter) + 3-layer storage
10. Non-determinism → managed via appropriate temperature settings
11. Feedback loop → corrections stored and improve future runs
12. Prompt transparency → deferred to design phase

**Conflict resolution:**
- "Confirmed stories ready to add to backlog" revised → system does NOT add to backlog, produces confirmed candidates for normal planning process
- "Contradiction with prior decisions" → folded into existing conflict detection (checks decision log, not just backlog)
- Story lifecycle with statuses added to support deferred decisions
- UI requirement added to support review workflow
