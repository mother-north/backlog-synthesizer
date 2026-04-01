# Memory & Audit Schema: Backlog Synthesizer

## Overview

Single database (PostgreSQL + pgvector) handles all persistence: structured data, vector embeddings, pipeline state, and audit trail. No external stores.

## Three-Layer Knowledge Base

| Layer | Purpose | Storage | Search Method |
|---|---|---|---|
| **Summary** | Context retrieval — fast semantic search | `kb_embeddings` (pgvector) | Cosine similarity on vector(1536) |
| **Structured** | Cross-reference, status tracking, decision log | Relational tables (stories, checks, epics, decisions, backlog_items) | SQL queries, joins, filters |
| **Raw** | Audit trail, drill-down, source of truth | `meetings.transcript`, `memos.content`, `architecture_docs.content` | Full-text search (tsvector) |

### What Gets Embedded (Summary Layer)

| Content | When Embedded | Used For |
|---|---|---|
| Meeting summary | After memo generation (Agent 5) | Context retrieval for future meetings |
| Confirmed decisions | After story confirmed/rejected | Detecting contradictions with prior decisions |
| Confirmed story text | After story confirmed | Detecting duplicates/overlaps in future runs |
| Architecture doc sections | After architecture doc uploaded | Constraint checking |

### What Gets Stored (Structured Layer)

| Table | Persists | Written By |
|---|---|---|
| `meetings` | Transcript, status, quality metrics | UI upload + Agent 5 |
| `stories` | Candidate/confirmed stories, original content | Agent 4 + UI (edits) |
| `checks` | Per-story checks, resolutions | Agent 3 + UI (resolutions) |
| `epics` | Existing + proposed epics, approval status | Agent 4 + UI (approval) |
| `decisions` | All human decisions with rationale | UI |
| `backlog_items` | Current backlog (uploaded) | UI data loading |
| `architecture_docs` | Architecture document (uploaded) | UI data loading |
| `backlog_hygiene_flags` | Obsolete item flags | Agent 3 |

### What Stays Raw

| Table.Column | Content | Why Raw |
|---|---|---|
| `meetings.transcript` | Original transcript text | Source of truth for citation verification |
| `memos.content` | Full decision memo text | Human-readable audit artifact |
| `architecture_docs.content` | Full architecture doc | Constraint source of truth |
| `stories.original_content` | AI-generated version (JSONB) | Drift detection against human edits |

## Pipeline State Persistence

### LangGraph Checkpointing

Pipeline state is checkpointed to PostgreSQL via `PostgresSaver`. This enables:

- **Pause/resume**: Pipeline pauses at `human_review` node, resumes hours/days later
- **Crash recovery**: If pipeline fails mid-run, resume from last completed node
- **Edit re-run**: Resume from checkpoint, route to `crossref` for re-checking

```sql
-- LangGraph manages this table automatically
CREATE TABLE checkpoints (
    thread_id VARCHAR(255),
    checkpoint_id VARCHAR(255),
    parent_id VARCHAR(255),
    checkpoint JSONB,          -- full pipeline state
    metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (thread_id, checkpoint_id)
);
```

### State Lifecycle

```
Meeting uploaded → Pipeline starts → thread_id = meeting_{id}
    ↓
Agent 1 (Parser) completes → checkpoint saved
    ↓
Agent 2 (Retriever) completes → checkpoint saved
    ↓
Agent 3 (Cross-Ref) completes → checkpoint saved
    ↓
Agent 4 (Synthesis) completes → checkpoint saved
    ↓
Validator completes → checkpoint saved
    ↓
human_review → PAUSED (state persisted, pipeline idle)
    ↓
User acts via UI → pipeline RESUMED from checkpoint
    ↓
Route to crossref (edit) or memo (done)
    ↓
Agent 5 (Memo) → checkpoint saved → pipeline COMPLETE
```

### Persistence Rules

| Data | Persisted When | Persisted Where | Retention |
|---|---|---|---|
| Pipeline checkpoint | After each agent completes | `checkpoints` table | Until meeting completed, then archived |
| Extracted requirements | After Agent 1 | `checkpoints` (in state) | Transferred to `stories` by Agent 4 |
| Retrieved context | After Agent 2 | `checkpoints` (in state) | Session-scoped, not persisted long-term |
| Checks | After Agent 3 | `checks` table | Permanent |
| Candidate stories | After Agent 4 | `stories` table | Permanent |
| Validation results | After Validator | `stories.grounding_status` + `stories.grounding_issues` | Permanent |
| Human decisions | On each user action | `decisions` table | Permanent |
| Decision memo | On demand (Agent 5) | `memos` table (versioned) | Permanent |
| KB embeddings | After Agent 5 | `kb_embeddings` table | Permanent |

## Audit Trail

### Three Levels

**Level 1: Agent Traces** — what each agent did for each meeting

```sql
CREATE TABLE agent_traces (
    id SERIAL PRIMARY KEY,
    meeting_id INTEGER REFERENCES meetings(id),
    agent_name VARCHAR(50),        -- parser | retriever | crossref | synthesizer | validator | memo
    input_summary JSONB,           -- condensed input (not full state)
    output_summary JSONB,          -- condensed output
    llm_model VARCHAR(50),         -- gpt-4o
    llm_prompt_tokens INTEGER,
    llm_completion_tokens INTEGER,
    duration_ms INTEGER,
    errors JSONB,                  -- any errors encountered
    created_at TIMESTAMP DEFAULT NOW()
);
```

Answers: "What did the parser produce? How long did cross-reference take? What model was used?"

**Level 2: Entity Audit Log** — every change to every entity

```sql
CREATE TABLE audit_log (
    id SERIAL PRIMARY KEY,
    entity_type VARCHAR(50),       -- story | check | epic | meeting
    entity_id INTEGER,
    action VARCHAR(50),            -- created | updated | status_changed | confirmed | rejected
    old_value JSONB,
    new_value JSONB,
    user_id INTEGER REFERENCES users(id),  -- NULL for agent actions
    created_at TIMESTAMP DEFAULT NOW()
);
```

Answers: "Who changed this story? What was the original text before the edit? When was this check resolved?"

**Level 3: Decision Trail** — end-to-end trace per story

Reconstructed by joining across tables:

```
For story #42:
1. agent_traces (meeting_id=5, agent=parser)     → how the requirement was extracted
2. agent_traces (meeting_id=5, agent=retriever)   → what KB context was found
3. agent_traces (meeting_id=5, agent=crossref)    → what checks were raised
4. agent_traces (meeting_id=5, agent=synthesizer) → how the story was generated
5. agent_traces (meeting_id=5, agent=validator)   → grounding check result
6. stories (id=42)                                → original_content vs current
7. checks (story_id=42)                           → all checks and resolutions
8. audit_log (entity_type=story, entity_id=42)    → all changes over time
9. decisions (story_id=42)                         → final decision + rationale
```

Answers: "Show me exactly how this story went from transcript text to confirmed backlog item, including every agent step, every human decision, and every edit."

### Audit Trail in UI

The Meeting View → Audit Trail tab displays:

1. **Pipeline timeline**: Agent-by-agent execution for this meeting (from `agent_traces`)
2. **Per-story history**: Select a story → see its full decision trail
3. **Change log**: All entity changes for this meeting (from `audit_log`)
4. **Source verification**: Click any `source_citation` → highlights the text in the original transcript

## Feedback Loop Storage

Human corrections stored and retrieved for future context:

| Action | Stored In | Retrieved By |
|---|---|---|
| Story rejected | `decisions` (type=rejected, rationale) | KB `search_feedback()` — finds similar prior rejections |
| Story modified | `audit_log` (old_value, new_value) | KB `search_feedback()` — finds how similar stories were edited |
| Check dismissed | `checks` (status=dismissed, resolution_notes) | Agent 3 — "this overlap type was dismissed before" |
| Epic rejected | `decisions` (type=epic_rejected, rationale) | Agent 4 — "epic proposal for this area was rejected" |

Retrieval: Agent 2 (Context Retrieval) queries `decisions` and `audit_log` via `KnowledgeBase.search_feedback()`, includes relevant prior feedback in the context package passed to Agents 3 and 4.

---

## AI Prompts Used

**Session 2.3 — Memory Schema Design (AI Build)**

Prompt: "Consolidate the memory and audit design. Define what gets persisted where, when, and how it's retrieved."

Key decisions:
- Single database for everything (no external stores)
- Three-layer KB maps to: pgvector embeddings, relational tables, raw text columns
- LangGraph checkpoints in PostgreSQL enable pause/resume and crash recovery
- Retrieved context is session-scoped (not persisted) — only confirmed outputs persist long-term
- Audit trail is 3 levels, reconstructable per story via table joins
- Feedback loop uses existing tables (decisions + audit_log), no separate feedback store
