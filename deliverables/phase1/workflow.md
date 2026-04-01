# Workflow Design: Backlog Synthesizer

## End-to-End Data Flow

```
Meeting transcript (.md)
         ↓
┌─────────────────────────────┐
│  1. Parser Agent            │
│  Extract requirements, NFRs,│
│  bugs, priority signals     │
│  Output: structured req list│
└────────────┬────────────────┘
             ↓
┌─────────────────────────────┐
│  2. Retriever Agent         │
│  Query KB per requirement   │
│  Output: focused context    │
└────────────┬────────────────┘
             ↓
┌─────────────────────────────┐
│  3. Cross-Reference Agent   │
│  Check vs backlog, arch,    │
│  decision log, dependencies │
│  Output: checks per item    │
└────────────┬────────────────┘
             ↓
┌─────────────────────────────┐
│  4. Synthesizer Agent       │
│  Generate stories, group    │
│  into epics, attach checks  │
│  Output: analysis package   │
└────────────┬────────────────┘
             ↓
┌─────────────────────────────┐
│  5. Validator Agent         │
│  Check citations exist in   │
│  source, grounding status   │
│  Output: validated stories  │
└────────────┬────────────────┘
             ↓
        [ UI: Human review ]
          ↓ (on edit) ↓
   [ Re-run agents 3+4+5 ]
          ↓
┌─────────────────────────────┐
│  6. Memo Agent              │
│  Decision memo (on demand), │
│  store in KB, feedback      │
└─────────────────────────────┘
```

## Agent Definitions

### Agent 1: Parser (`parser.py`)
**Input:** Meeting transcript (raw text)
**Process:**
1. Extract requirements from transcript — each grounded in specific source text (citation required)
2. Classify each requirement by **type**:
   - Feature — new capability
   - Bug — reported defect or broken behavior
   - Improvement — enhancement to existing feature
   - Tech debt — refactoring, infrastructure, internal quality
   - NFR — non-functional (performance, security, scalability, etc.)
3. Classify **granularity** — epic / story / task. Flag items too vague or too large, suggest splitting
4. Extract priority signals — urgency cues, deadlines, explicit priority statements
5. Flag ambiguous requirements — unclear language, missing details, conflicting statements
6. Assign confidence level (high / medium / low) per extracted requirement

**Output:** Structured requirement list:
- Each item with: description, source citation, type, granularity, priority signals, confidence, ambiguity flags

**Memory:** None needed. Works from raw transcript only.

---

### Agent 2: Retriever (`retriever.py`)
**Input:** Structured requirement list from Agent 1
**Process:**
1. For each extracted requirement, query KB for relevant context:
   - Related backlog items (by feature area, component, keywords)
   - Relevant architecture sections (by component affected)
   - Prior meeting summaries that discussed similar topics
   - Prior decisions that may be affected
2. Broad retrieval — semantic search + keyword matching
3. Relevance filtering — review retrieved items per requirement, drop irrelevant, keep only what matters
4. If a requirement references prior context ("as we discussed") but nothing found → flag as ambiguity

**Output:** Per-requirement context package:
- Matched backlog items (with similarity score)
- Relevant architecture constraints
- Related prior decisions
- Ambiguity flags for missing context

**Memory:** Read-only from KB. Output feeds agents 3, 4.

**Why after Parser:** Parser extracts what's in the transcript — it doesn't need KB context. Context Retrieval then queries KB precisely per requirement, not broadly per transcript. More targeted, less noise.

---

### Agent 3: Cross-Reference (`crossref.py`)
**Input:** Requirements from Agent 1 + context from Agent 2
**Process:**
1. Check each requirement against current backlog:
   - Exact or near duplicates (high confidence match)
   - Partial overlaps (medium confidence)
   - Thematic similarity (low confidence, inform only)
2. Check against architecture doc:
   - Constraint violations (requirement incompatible with architecture)
   - Component mapping (which system area is affected)
3. Check against decision log:
   - Contradictions with prior confirmed decisions
4. Detect dependencies:
   - Between new requirements ("story B depends on story A")
   - Between new requirements and existing backlog items ("requires ERIS-042 first")
5. Flag backlog hygiene:
   - Existing items potentially obsolete based on new meeting content

**Output:** Per-requirement check results:
- List of checks with status (passed / issue found)
- Confidence level per match
- Proposed resolution per issue
- Dependency map

**Memory:** Reads from agents 1, 2. Output feeds Agent 4.

---

### Agent 4: Synthesizer (`synthesizer.py`)
**Input:** Requirements from Agent 1 + context from Agent 2 + checks from Agent 3
**Process:**
1. **Epic mapping and grouping:**
   - Match new requirements to existing epics in the backlog (by feature area, component, tags)
   - Requirements that fit an existing epic → create stories under that epic
   - Requirements that don't fit any existing epic → group related ones and **propose new epic** (with: name, goal, scope, why existing epics don't fit, confidence level)
   - Flag when a requirement spans multiple epics → suggest splitting
   - Stories under a proposed new epic get a **"New epic proposal" check** — they stay in Pending Decision until PM approves or rejects the epic
2. Generate candidate stories with:
   - Title, description, acceptance criteria
   - Feature tags, priority signals
   - Epic assignment (existing or proposed new)
   - Type (feature, bug, improvement, tech debt, NFR)
   - Source citation (grounded in transcript)
   - Confidence level
3. Attach checks from Agent 3 to each story
4. Propose resolutions for each issue (conflicts, overlaps, violations)
5. Route unresolved questions to the right role (tech → architect, priority → PM, backlog → dev lead)
6. Generate meeting quality feedback (ambiguity ratio, actionability score)

**Output:** Analysis package:
- Candidate stories grouped by epic (existing or proposed new)
- Per-story checks with proposed resolutions
- Questions routed to roles
- Meeting quality feedback

**Memory:** Reads from agents 1, 2, 3. Output goes to Validator.

---

### Agent 5: Validator (`validator.py`)
**Input:** Candidate stories from Agent 4 + original transcript
**Process:**
1. For each candidate story, verify source_citation exists verbatim (or near-verbatim) in the transcript
2. Verify acceptance criteria are derivable from the cited text
3. Check no requirements were fabricated (not in transcript)
4. Assign grounding status: valid / warning / invalid
5. Flag invalid stories before presenting to user

**Output:** Validated stories with grounding status and issues list

**Memory:** Reads transcript (via TranscriptReader) and stories from Agent 4. Output goes to UI.

---

### Human Review (UI)
**Input:** Validated analysis package from Agent 5
**Process:**
1. User sees per-meeting story list grouped by epic, with statuses, checks, and grounding status
2. User resolves checks (per role): approve, modify, escalate
3. User can edit stories — system detects drift from source transcript and warns
4. **On edit: re-run Agents 3+4+5 (Cross-Reference + Synthesizer + Validator) on the edited story** to detect new conflicts, update checks, and re-validate grounding
5. User confirms or rejects each story (only when all checks resolved)

**Output:** Review decisions:
- Per-story: confirmed / rejected / modified (with rationale)
- Check resolutions
- Human edits (tracked against original, drift analysis)

**Re-run trigger:** Any story edit triggers partial re-run of agents 3+4 for that story only. This ensures edited stories are checked for new conflicts, dependencies, and architecture violations.

---

### Agent 6: Memo Agent (`memo.py`)
**Input:** Current state of all stories + all prior agent outputs
**Trigger:** On demand — user requests memo generation at any time. Can be run multiple times.

**Process:**
1. Generate decision memo reflecting **current state**:
   - Confirmed stories (with epic grouping)
   - Rejected stories (with rationale)
   - Pending stories still under review
   - Open items and assigned owners
   - Conflicts resolved and how
   - Meeting quality feedback
2. Store artifacts in KB:
   - Raw layer: original transcript, decision memo (versioned)
   - Structured layer: confirmed stories, decision log entries, check resolutions, NFRs, epic assignments
   - Summary layer: key decisions, outcomes, meeting summary
3. Store human feedback:
   - Rejections with rationale (improves future runs)
   - Modifications (original vs edited, drift analysis)
4. Update metrics

**Output:**
- Decision memo (can be generated/updated multiple times as stories progress)
- KB updated
- Metrics updated

**Note:** Memo is a living document. First generation may show 3 confirmed, 5 pending. Later regeneration may show 7 confirmed, 1 rejected. Each version is stored.

**Memory:** Writes to KB (all three layers). Available for next meeting's Agent 2.

---

## Memory Flow Between Agents

```
Agent 1 (Parser) — no KB needed
  ↓ structured requirements
Agent 2 (Retriever) ←── reads KB per requirement
  ↓ focused context per requirement
Agent 3 (Cross-Reference) ←── reads from agents 1, 2
  ↓ checks per story
Agent 4 (Synthesizer) ←── reads from agents 1, 2, 3
  ↓ candidate stories + checks
Agent 5 (Validator) ←── reads transcript + stories from agent 4
  ↓ validated stories with grounding status
UI (Human Review)
  ↓ on edit → re-run agents 3+4+5 for edited story
  ↓ review decisions
Agent 6 (Memo) ←── on demand, reads current state
  ↓ write
KB (persistent) ← available for next meeting's Agent 2
```

**Per-session memory:** Each agent's output is passed forward and available to all downstream agents within the same meeting session.

**Persistent memory (KB):** Three-layer storage (summary / structured / raw). Only Agent 6 (Memo) writes to KB. Agent 2 (Retriever) reads from KB.

---

## Scenario Validation

### Scenario A: Clean meeting, no conflicts
1. **Parser** → extracts 5 clear features, 1 NFR, no ambiguities, all high confidence
2. **Retriever** → per requirement: pulls matching backlog items + architecture sections
3. **Cross-Reference** → no overlaps, no constraint violations, 1 dependency found
4. **Synthesizer** → 5 stories mapped to 2 existing epics, 1 dependency check, all high confidence
5. **Validator** → 5/5 grounding valid, all citations found in transcript
6. **UI** → user resolves dependency (acknowledged), confirms all 5
7. **Memo** → user generates memo: 5 confirmed stories, 0 pending, 0 rejected

**Result:** 5 confirmed stories under 2 existing epics. Clean run.

### Scenario B: Noisy meeting, conflicts with backlog + user edits a story
1. **Parser** → extracts 8 requirements (3 features, 2 bugs, 1 improvement, 2 NFRs). 3 ambiguous, mixed confidence
2. **Retriever** → finds overlapping backlog items for 2 requirements, architecture constraints for 1
3. **Cross-Reference** → 2 overlaps, 1 architecture violation, 1 contradiction with prior decision
4. **Synthesizer** → 8 stories: 5 under existing epics, 3 grouped into 1 proposed new epic. 4 stories have checks.
5. **Validator** → 7/8 valid, 1 warning (acceptance criteria loosely derived from noisy text)
6. **UI** → PM clarifies ambiguities. Architect resolves violation by editing story acceptance criteria → **re-run agents 3+4+5 on edited story** → new check: edit removed a constraint reference, system warns → architect adjusts → clean.
7. **UI** → 6 confirmed, 2 rejected
8. **Memo** → first memo: 4 confirmed, 2 rejected, 2 pending. Later: 6 confirmed, 2 rejected.

**Result:** 6 confirmed, 2 rejected. 1 new epic proposed. Edit triggered re-check + re-validation. Memo generated twice.

### Scenario C: Meeting with bugs and missing context
1. **Parser** → extracts 4 requirements: 2 features, 2 bugs ("batch processing crashes on large files", "risk score shows NaN for empty documents")
2. **Retriever** → finds related backlog items for bugs, but no context for "the auth approach we decided last week"
3. **Cross-Reference** → 1 bug may be duplicate of ERIS-047 (high confidence), missing context flagged
4. **Synthesizer** → 4 stories: 2 features under existing epics, 2 bugs. 1 bug flagged as potential duplicate, 1 feature pending (missing context)
5. **Validator** → 4/4 valid
6. **UI** → Dev lead confirms bug is duplicate (skip). PM provides missing auth context → **re-run agents 3+4+5** → story now has full context, no new issues
7. **Memo** → generated with 3 confirmed, 1 skipped (duplicate). Missing context now stored in KB.

**Result:** 3 confirmed (2 features, 1 bug), 1 duplicate skipped. KB enriched with auth decision.

### Scenario D: Meeting produces requirements spanning multiple epics
1. **Parser** → extracts 6 requirements, 1 is large and cross-cutting ("add audit logging to all API endpoints")
2. **Retriever** → finds 4 epics potentially affected
3. **Cross-Reference** → large requirement touches 4 existing epics
4. **Synthesizer** → flags cross-cutting requirement, suggests splitting into 4 stories (1 per epic). Groups remaining 5 requirements: 3 under existing epics, 2 into proposed new epic.
5. **UI** → PM approves split. Architect confirms proposed new epic. All confirmed.
6. **Memo** → 9 stories (4 from split + 5 others), 1 new epic created.

**Result:** Cross-cutting requirement properly split. New epic proposed and confirmed.

---

## AI Prompts Used

**Session 1.2 — Workflow Design (AI Explore + Build)**

Prompt: "Based on the system concept, design the end-to-end workflow with agent roles, memory flow, and handoff points."

Initial design: 5-agent pipeline with Context Retrieval first.

**Session 1.2 — Workflow Review (AI Review)**

Issues found and resolved:
1. **Agent order** — moved Parser before Context Retrieval. Parser doesn't need KB; Context Retrieval is more targeted when it knows specific requirements to search for.
2. **Requirement types** — Parser now classifies by type (feature, bug, improvement, tech debt, NFR), not just granularity.
3. **Epic hierarchy** — Synthesis agent maps stories to existing epics or proposes new ones. Groups related requirements. Handles cross-cutting requirements by suggesting splits.
4. **Edit re-run** — Human edits trigger re-run of agents 3+4 on the edited story to detect new conflicts.
5. **Memo timing** — Memo agent runs on demand, can be regenerated. Living document reflecting current state, not one-time event.

**Session 1.2 — Scenario Validation**

Validated against 4 scenarios:
- A: Clean meeting → straight through, stories mapped to existing epics
- B: Noisy + conflicts + user edits → edit triggers re-check, memo generated multiple times
- C: Bugs + missing context → bug type classified, duplicate detected, KB enriched
- D: Cross-cutting requirement → split across epics, new epic proposed
