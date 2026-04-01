# Use Cases & Edge Cases

## Primary Use Cases

### UC-1: Clean transcript → stories mapped to existing epics
- **Trigger:** Well-formatted meeting transcript with clear requirements
- **Expected behavior:** Parser extracts requirements (high confidence), Context Retrieval finds matching epics in backlog, Cross-Reference finds no conflicts, Synthesis maps stories to existing epics
- **Expected output:** Candidate stories under existing epics, all with acceptance criteria, feature tags, priority signals. Zero checks to resolve. All stories go straight to Awaiting Confirmation.

### UC-2: Transcript with bugs and features mixed
- **Trigger:** Meeting discussing both new features and reported defects ("batch processing crashes on large files", "we also need Excel support")
- **Expected behavior:** Parser classifies each requirement by type (feature, bug, improvement). Synthesis generates stories with correct type. Bugs linked to relevant existing epics/components.
- **Expected output:** Mixed candidate list: features as stories, defects as bugs — each with type, source citation, and epic assignment.

### UC-3: Transcript conflicts with existing backlog
- **Trigger:** Meeting requests something that contradicts an existing backlog item (e.g., "switch to MongoDB" when backlog has "Optimize SQLite queries")
- **Expected behavior:** Cross-Reference detects conflict with existing item, attaches Priority conflict check. Synthesis proposes resolution.
- **Expected output:** Story with conflict check (cites both sides), proposed resolution, routed to PM for decision.

### UC-4: Transcript conflicts with prior decision
- **Trigger:** Meeting proposes approach that contradicts a decision confirmed in a prior meeting's decision log
- **Expected behavior:** Context Retrieval finds the prior decision. Cross-Reference flags contradiction. Synthesis attaches Prior decision conflict check.
- **Expected output:** Story with Prior decision conflict check, prior decision cited, routed to PM + Architect.

### UC-5: Ambiguous requirements → flagged with questions
- **Trigger:** Transcript with vague statements ("make it faster", "improve the UX") or conflicting statements within the same meeting
- **Expected behavior:** Parser flags ambiguity (low confidence). Synthesis attaches Ambiguity check with specific questions for PM.
- **Expected output:** Stories with Ambiguity check, specific clarifying questions, status: Under Review.

### UC-6: Requirements that don't fit existing epics → new epic proposed
- **Trigger:** Meeting discusses a new feature area not covered by any existing epic (e.g., "we need a notification system")
- **Expected behavior:** Synthesis groups related requirements, proposes new epic with name, goal, scope, justification. Stories under proposed epic get New epic proposal check.
- **Expected output:** Proposed new epic + stories under it, all in Pending Decision until PM approves the epic.

### UC-7: Cross-cutting requirement spanning multiple epics
- **Trigger:** Meeting requests something that touches multiple system areas ("add audit logging to all API endpoints")
- **Expected behavior:** Synthesis detects cross-cutting nature, suggests splitting into per-epic stories. Flags for review.
- **Expected output:** Split stories under respective epics, original requirement cited, split rationale explained.

### UC-8: Overlap/duplicate with existing backlog
- **Trigger:** Meeting discusses feature that already exists as a backlog item
- **Expected behavior:** Context Retrieval finds matching item. Cross-Reference flags overlap with confidence level (high = duplicate, medium = partial overlap). Synthesis proposes action.
- **Expected output:** Story with Overlap check, matched item ID, confidence level, suggested action (skip / merge / keep both).

### UC-9: Architecture constraint violation
- **Trigger:** Meeting requests something that violates an architecture constraint (e.g., "store user files in the database" when architecture says "files on disk only")
- **Expected behavior:** Cross-Reference detects violation. Synthesis attaches Architecture constraint check with specific constraint cited.
- **Expected output:** Story with constraint violation flag, architecture section cited, routed to Architect. Possible outcomes: modify story or accept risk.

### UC-10: Dependencies detected
- **Trigger:** Meeting produces requirements where story B depends on story A, or depends on existing backlog item
- **Expected behavior:** Cross-Reference detects dependency. Synthesis attaches Dependency check with dependency map.
- **Expected output:** Stories with dependency checks, dependency map showing order. Routed to Dev Lead.

### UC-11: Meeting references prior context ("as we discussed last week")
- **Trigger:** Transcript references a past discussion or decision not explicitly restated
- **Expected behavior:** Context Retrieval searches KB for referenced context. If found → enriches the requirement. If not found → flags as ambiguity.
- **Expected output:** Either: enriched requirement with prior context attached, or Ambiguity flag asking user to provide missing context.

### UC-12: User edits a story → re-check
- **Trigger:** During review, user modifies a story's description or acceptance criteria
- **Expected behavior:** System re-runs Cross-Reference + Synthesis on the edited story. Detects if edit introduces new conflicts or resolves existing ones. Warns if edit drifts from source transcript.
- **Expected output:** Updated checks for edited story. Drift warning if applicable (cites original transcript text vs. edit).

### UC-13: Decision memo generated multiple times
- **Trigger:** User requests memo while some stories are still pending. Later requests memo again after more stories are confirmed.
- **Expected behavior:** Memo Agent generates memo reflecting current state. Each version stored. Shows confirmed, rejected, and pending items.
- **Expected output:** Versioned memo: first version (3 confirmed, 5 pending), second version (7 confirmed, 1 rejected).

### UC-14: NFR extracted and validated
- **Trigger:** Meeting mentions non-functional requirements ("must handle 1000 concurrent users", "response time under 200ms")
- **Expected behavior:** Parser classifies as NFR with type tag (performance, security, scalability). Cross-Reference validates against architecture constraints. Synthesis generates NFR item.
- **Expected output:** NFR item with type tag, architecture validation result, linked to relevant epic/component.

### UC-15: Backlog hygiene — obsolete items detected
- **Trigger:** Meeting decides to drop or replace a feature that has existing backlog items
- **Expected behavior:** Cross-Reference flags existing items that may be obsolete based on new meeting decisions.
- **Expected output:** Backlog hygiene flag on affected existing items, with rationale and source citation from meeting.

## Edge Cases

### EC-1: Empty or near-empty transcript
- **Trigger:** Transcript with <10 words or no actionable content
- **Expected behavior:** Parser extracts nothing. System returns empty result with "no requirements found" message. No stories generated. Memo Agent can still generate a memo (recording that the meeting produced no actionable items).
- **Expected output:** Empty candidate list, status message, optional memo.

### EC-2: Contradictory requirements within same meeting
- **Trigger:** Same transcript says "must support offline mode" and later "requires real-time sync for all operations"
- **Expected behavior:** Parser extracts both. Cross-Reference detects internal contradiction. Synthesis flags both stories with Ambiguity check linking them together.
- **Expected output:** Two stories with mutual Ambiguity check, specific question: "These requirements contradict — which takes priority?"

### EC-3: Backlog items with missing fields
- **Trigger:** Backlog JSON where some items have no description or acceptance criteria
- **Expected behavior:** Cross-Reference works with available data but notes incomplete items. If matching against an incomplete item → flags lower confidence. Backlog hygiene report notes data quality issues.
- **Expected output:** Cross-reference results with confidence adjusted for data quality. Hygiene flags for incomplete backlog items.

### EC-4: All stories map to a single existing epic
- **Trigger:** Meeting entirely focused on one feature area (e.g., all about Review Queue)
- **Expected behavior:** All stories mapped to one epic. No new epic proposed. System handles gracefully — no forced grouping or splitting.
- **Expected output:** All candidate stories under one epic. Normal check flow.

### EC-5: Very large transcript with 20+ extractable requirements
- **Trigger:** Long meeting transcript producing many requirements
- **Expected behavior:** Parser extracts all. Synthesis may propose multiple new epics if requirements span many areas. System handles volume without degradation. Meeting quality feedback notes high volume.
- **Expected output:** Large candidate list, potentially multiple epic proposals, meeting quality feedback suggesting shorter/focused meetings.

### EC-6: User provides missing context during review → KB enriched
- **Trigger:** Context Retrieval flagged missing prior context. During review, user manually provides the context.
- **Expected behavior:** Context stored in KB. Story updated and re-checked with new context. Future meetings referencing this topic will find it.
- **Expected output:** Updated story with resolved ambiguity. KB enriched for future use.

### EC-7: Story rejected → rationale stored for future learning
- **Trigger:** User rejects a generated story with rationale ("we already decided against this approach")
- **Expected behavior:** Rejection + rationale stored in KB. Future meetings proposing similar stories will find this feedback.
- **Expected output:** Story status: Rejected. Rationale in KB. Decision log updated.

---

## AI Prompts Used

**Session 1.3 — Use Case Development (AI Build)**

Prompt: "Based on the system concept and workflow, develop comprehensive use cases covering all system capabilities: requirement types, epic mapping, checks lifecycle, context retrieval, edits, memo, NFRs, dependencies, backlog hygiene."

Coverage mapping:
- UC-1 to UC-5: Core flow variations (clean, mixed types, conflicts, ambiguity)
- UC-6 to UC-7: Epic management (new epic proposal, cross-cutting)
- UC-8 to UC-10: Cross-reference outputs (overlap, architecture, dependencies)
- UC-11: KB context retrieval
- UC-12 to UC-13: Human interaction (edit re-run, memo on demand)
- UC-14 to UC-15: NFR and backlog hygiene
- EC-1 to EC-7: Boundary conditions and learning loops

**Session 1.3 — Use Case Review (AI Review)**

Removed: Mixed language transcript (EC-2 from prior draft) — out of scope per user decision.
Added: UC-12 (edit re-check), UC-13 (memo versioning), UC-14 (NFR), UC-15 (backlog hygiene), EC-4 (single epic), EC-5 (large transcript), EC-6 (KB enrichment), EC-7 (rejection learning).
