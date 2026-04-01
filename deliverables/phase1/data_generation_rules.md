# Synthetic Data Generation Rules

## Context
All synthetic data is about **AI-EX (ERIS)** — the Export Risk Insight Solution in `../AI-EX/`. This real system provides realistic, internally consistent source material.

**Source material:** `../AI-EX/README.md`, `../AI-EX/CLAUDE.md`, `../AI-EX/server/`, `../AI-EX/database.js`

---

## 1. Architecture Description

**File:** `data/architecture/eris_architecture.md`

**Must include:**
- Tech stack (Node.js, Express, SQLite, vanilla JS frontend)
- Component diagram (server, database, services, routes, middleware, frontend)
- API contracts (all endpoints from README)
- Data flows (assessment flow, review queue flow)
- Constraints (single-server, SQLite limitations, session management, files on disk not in DB)
- Deployment model (PM2, SSH, Azure)
- NFR constraints (max concurrent users, response time targets, storage limits)

**Derived from:** actual AI-EX codebase — not invented

---

## 2. Meeting Notes

**Directory:** `data/meeting_notes/`
**Minimum:** 10 transcripts + 1 empty + 1 large
**Format:** Markdown, conversational style with speaker names

### Meeting Schedule

| # | File | Topic | Quality | Purpose | Use Cases Covered |
|---|---|---|---|---|---|
| 1 | `01_kickoff.md` | Project kickoff — scope & goals | Clean | Baseline features + NFRs ("must handle 500 users") | UC-1, UC-14 |
| 2 | `02_risk_scoring.md` | Risk scoring algorithm review | Clean | Technical depth + bugs reported ("NaN on empty docs") | UC-2, UC-9 |
| 3 | `03_review_queue.md` | Review queue workflow | Noisy | Buried action items + references prior kickoff decisions | UC-5, UC-11 |
| 4 | `04_multi_llm.md` | Multi-LLM provider support (Claude, OpenAI, Gemini) | Clean | New feature area not in any epic → triggers new epic | UC-6, UC-10 |
| 5 | `05_user_roles.md` | User roles & access control | Ambiguous | Conflicting opinions, contradicts meeting 1 decision on roles | UC-4, UC-5 |
| 6 | `06_batch_processing.md` | Batch file processing | Clean | Performance NFRs + cross-cutting audit logging need | UC-7, UC-14 |
| 7 | `07_customer_feedback.md` | Customer feedback — false positives | Noisy | Bugs + vague improvement requests + "as we discussed in scoring review" | UC-2, UC-11 |
| 8 | `08_architecture.md` | Database & session management review | Clean | Architecture constraints + decides to drop a planned feature → obsoletes backlog items | UC-9, UC-15 |
| 9 | `09_regulation_library.md` | Regulation document library — new feature | Ambiguous | Scope creep, dependencies on other features, new feature area | UC-6, UC-10 |
| 10 | `10_retrospective.md` | Post-launch retrospective & priorities | Noisy | Contradicts earlier meetings, mixed bugs/features/improvements | UC-3, UC-4, UC-2 |
| 11 | `11_empty.md` | Canceled meeting — no content | Empty | Near-empty transcript (<10 words) | EC-1 |
| 12 | `12_large_planning.md` | Quarterly planning — many topics | Clean | 20+ extractable requirements across all feature areas | EC-5 |

### Quality Levels
- **Clean:** Well-structured, clear speakers, explicit decisions and action items
- **Noisy:** Interruptions, off-topic tangents, action items buried in discussion, informal language
- **Ambiguous:** Conflicting opinions not resolved, vague requirements, missing context
- **Empty:** Minimal or no actionable content

### Content Rules
- Each transcript must reference real ERIS features/components
- Noisy transcripts must still contain extractable requirements (hidden in noise)
- At least 2 transcripts must have overlapping/conflicting content (meetings 5+10 vs meeting 1)
- At least 2 transcripts must reference prior meetings explicitly ("as we discussed in the kickoff", "following up on the scoring review") — meetings 3 and 7
- At least 2 transcripts must contain bugs mixed with features — meetings 2 and 7
- At least 1 transcript must contain NFRs (performance, security) — meetings 1 and 6
- At least 1 transcript must discuss a feature area not covered by existing epics — meeting 4 and 9
- At least 1 transcript must contain a cross-cutting requirement — meeting 6
- At least 1 transcript must produce requirements with dependencies between them — meetings 4 and 9
- At least 1 transcript must make an existing backlog item obsolete — meeting 8
- At least 1 transcript must have internal contradictions — meeting 5
- Each transcript: 500-1500 words, 3-5 speakers (except meeting 11: <10 words, meeting 12: 2000-3000 words)

---

## 3. Backlog Items

**File:** `data/backlog/backlog_items.json`
**Minimum:** 50 items

### Item Type Distribution
| Type | Count | Description |
|---|---|---|
| Epic | 5-8 | High-level feature areas |
| Story | 25-30 | Feature work linked to epics |
| Bug | 10-15 | Realistic bugs based on ERIS architecture |
| Improvement | 3-5 | Enhancements to existing features |
| Task | 5-10 | Tech debt, infra, documentation |

### Required Epics (based on ERIS)
1. Risk Assessment Engine
2. Review Queue
3. User Management & Auth
4. LLM Integration
5. Document Processing
6. Regulation Library
7. Deployment & DevOps

**Note:** No epic for "Notification System" or "Multi-LLM Provider" — meetings 4 and 9 should trigger new epic proposals for features not covered here.

### Epic → Story Hierarchy
Every story, bug, and task must belong to an epic (except orphans — see Data Quality Rules). The backlog must have a clear parent-child structure:

```
ERIS-001 (Epic: Risk Assessment Engine)
  ├── ERIS-010 (Story: Implement risk scoring algorithm)
  ├── ERIS-011 (Story: Add configurable risk thresholds)
  ├── ERIS-012 (Bug: Risk score shows NaN for empty documents)
  └── ERIS-013 (Task: Refactor risk category rules config)
```

- Each epic has 3-6 child items (stories/bugs/tasks)
- Some stories should be cross-cutting (relevant to 2+ epics) to test epic mapping logic
- At least 2 epics should have stories that are related/overlapping (to test grouping)

### Item Schema
```json
{
  "id": "ERIS-001",
  "type": "epic|story|bug|improvement|task",
  "title": "...",
  "description": "...",
  "status": "backlog|in_progress|done|blocked",
  "epic_id": "ERIS-XXX or null",
  "priority": "critical|high|medium|low",
  "labels": ["risk-engine", "frontend", ...],
  "acceptance_criteria": ["...", "..."],
  "dependencies": ["ERIS-XXX", ...] 
}
```

### Data Quality Rules
- 5-10 items intentionally missing `description` (just titles)
- 3-5 items missing `acceptance_criteria`
- 2-3 items with `status: blocked` and no explanation
- 2-3 orphan items with no `epic_id` (to test epic assignment logic)
- At least 5 items that overlap with meeting note content (for duplicate detection — UC-8)
- At least 3 items that conflict with meeting note requests (for conflict detection — UC-3)
- At least 2 cross-cutting items that relate to multiple epics (UC-7)
- At least 3 items with explicit `dependencies` on other items (UC-10)
- At least 2 items that meeting 8 will make obsolete (UC-15)
- At least 1 item about "Optimize SQLite queries" to conflict with meeting 10's MongoDB suggestion (UC-3)

---

## 4. Golden Dataset

**Directory:** `data/golden/`
**Minimum:** 5 scenarios

### Scenario Definitions

| # | File | Inputs | Use Cases Tested |
|---|---|---|---|
| 1 | `scenario_1.json` | Meeting 1 (clean) + architecture + full backlog | UC-1 (clean flow), UC-14 (NFRs), epic mapping to existing epics |
| 2 | `scenario_2.json` | Meeting 2 (bugs+features) + architecture + full backlog | UC-2 (mixed types), UC-8 (duplicate bug in backlog), UC-9 (architecture constraint) |
| 3 | `scenario_3.json` | Meeting 5 (ambiguous, contradicts M1) + architecture + full backlog | UC-4 (prior decision conflict), UC-5 (ambiguity), EC-2 (internal contradictions) |
| 4 | `scenario_4.json` | Meeting 4 (new feature area) + architecture + full backlog | UC-6 (new epic proposal), UC-10 (dependencies) |
| 5 | `scenario_5.json` | Meeting 11 (empty) + architecture + full backlog | EC-1 (empty transcript) |

### Golden Output Schema
```json
{
  "scenario_id": 1,
  "inputs": {
    "meeting": "data/meeting_notes/01_kickoff.md",
    "architecture": "data/architecture/eris_architecture.md",
    "backlog": "data/backlog/backlog_items.json"
  },
  "expected_output": {
    "candidate_stories": [
      {
        "title": "...",
        "type": "feature|bug|improvement|task|nfr",
        "description": "...",
        "acceptance_criteria": ["..."],
        "feature_tags": ["..."],
        "epic_assignment": "ERIS-XXX (existing) or 'proposed: Epic Name'",
        "priority_signals": ["..."],
        "confidence": "high|medium|low",
        "source_citation": "exact text from transcript"
      }
    ],
    "checks": [
      {
        "story_title": "...",
        "check_type": "architecture|priority|dependency|overlap|prior_decision|nfr|ambiguity|new_epic",
        "details": "...",
        "proposed_resolution": "...",
        "routed_to": "PM|Architect|Dev Lead"
      }
    ],
    "backlog_hygiene": [
      {
        "existing_item_id": "ERIS-XXX",
        "flag": "potentially_obsolete|data_quality",
        "reason": "..."
      }
    ],
    "meeting_quality": {
      "total_requirements": 0,
      "ambiguous_count": 0,
      "actionability_score": "high|medium|low"
    }
  }
}
```

### Golden Dataset Rules
- Each expected story must have: title, type, description, acceptance_criteria, feature_tags, confidence, source_citation
- Checks must reference specific check_type and be routed to the correct role
- Epic assignments must be explicit: existing epic ID or "proposed: Name"
- Conflicts must reference specific backlog item IDs and meeting sources
- Backlog hygiene flags must cite the meeting decision that triggers them
- Meeting quality section must reflect actual transcript quality

### Use Case Coverage Matrix

| Use Case | Covered By Scenario | Via Meeting | Via Backlog |
|---|---|---|---|
| UC-1 Clean flow | S1 | M1 | Full |
| UC-2 Bugs + features | S2 | M2 | Bug exists |
| UC-3 Backlog conflict | S3 | M5 | Conflicting item |
| UC-4 Prior decision conflict | S3 | M5 vs M1 | — |
| UC-5 Ambiguity | S3 | M5 | — |
| UC-6 New epic proposal | S4 | M4 | No matching epic |
| UC-7 Cross-cutting | — | M6 (not in golden, tested in eval) | Cross-cutting items |
| UC-8 Overlap/duplicate | S2 | M2 | Duplicate bug |
| UC-9 Architecture violation | S2 | M2 | — |
| UC-10 Dependencies | S4 | M4 | Items with deps |
| UC-14 NFRs | S1 | M1 | — |
| UC-15 Backlog hygiene | — | M8 (not in golden, tested in eval) | Obsolete items |
| EC-1 Empty transcript | S5 | M11 | Full |
| EC-2 Internal contradictions | S3 | M5 | — |

---

## AI Prompts Used

**Session 1.4 — Data Rules Review (AI Review)**

Prompt: "Cross-check data generation rules against all 15 use cases and 7 edge cases. Identify gaps."

Gaps found and resolved:
- Added meetings 11 (empty) and 12 (large) for edge cases EC-1, EC-5
- Added use case mapping to each meeting (which UCs it tests)
- Added explicit content rules: prior meeting references, bugs mixed with features, NFRs, cross-cutting requirements, internal contradictions, obsoleting backlog items
- Updated backlog rules: items to be obsoleted, conflicting items for specific meetings
- Updated golden dataset: per-meeting scenarios instead of multi-meeting, use case coverage matrix
- Updated golden schema: added type, epic_assignment, source_citation, checks, backlog_hygiene, meeting_quality

**Session 1.5 — Phase 1 Review (AI Review)**

Prompt: "Cross-check all Phase 1 deliverables against initial_task.md. What's missing? What could break?"

Findings:
- All Phase 1 requirements from initial_task.md are met
- Data exceeds minimums: 12 meetings (req: 10), 68 backlog items (req: 50), 5 golden scenarios (req: 3-5)
- All 15 use cases + 7 edge cases traceable to test data
- Note: golden scenarios cover 5 of 12 meetings. Remaining meetings (M3, M6, M7, M8, M9, M10, M12) can be added as eval scenarios in Phase 3
- Note: no cross-meeting KB retrieval scenario in golden dataset. M7→M2 reference would test this. Consider adding in Phase 3
