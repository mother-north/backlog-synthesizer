# Agent Architecture: Backlog Synthesizer

## Tech Stack

### Agent Pipeline (Python)
| Component | Technology | Purpose |
|---|---|---|
| Orchestration | LangGraph | Agent pipeline, state management, checkpointing, human-in-the-loop |
| LLM | OpenAI (GPT-4o) | All agent reasoning and generation |
| Embeddings | OpenAI text-embedding-3-small | Vector embeddings for KB search |
| API | FastAPI | REST API serving the agent pipeline to the frontend |

### Web Application (TypeScript)
| Component | Technology | Purpose |
|---|---|---|
| Frontend | React 19 + Vite + TypeScript | SPA |
| UI Library | Ant Design | Components, layout, tables, forms |
| State | Zustand | Auth state, app state |
| Routing | React Router | Page navigation |
| Backend | Express.js + TypeScript | API gateway, auth, file management |
| Auth | JWT + bcrypt | Access/refresh tokens, role-based access |
| Color Scheme | Blue professional theme | Primary #0033A0, accent #3d8bfd |

### Single Database
| Component | Technology | Purpose |
|---|---|---|
| Database | PostgreSQL + pgvector | Everything: structured data, vector embeddings, audit log, checkpoints |

**Why single DB:** One connection, one backup strategy, one migration path. pgvector handles embedding search alongside relational queries. No need for a separate vector store.

### Monorepo Structure
```
backlog-synthesizer/
├── backend/                    # Express API gateway + auth
│   ├── src/
│   │   ├── index.ts
│   │   ├── config/
│   │   │   ├── env.ts
│   │   │   └── database.ts    # PostgreSQL pool (pgvector enabled)
│   │   ├── middleware/
│   │   │   └── auth.ts        # JWT + role checks
│   │   ├── routes/
│   │   │   ├── auth.routes.ts
│   │   │   ├── users.routes.ts
│   │   │   ├── meetings.routes.ts    # Upload transcripts, trigger pipeline
│   │   │   ├── stories.routes.ts     # Story CRUD, status transitions
│   │   │   ├── checks.routes.ts      # Check resolution
│   │   │   ├── epics.routes.ts       # Epic management, proposals
│   │   │   ├── dashboard.routes.ts   # Metrics
│   │   │   ├── kb.routes.ts          # Knowledge base browser
│   │   │   ├── data-load.routes.ts   # Data loading (backlog JSON, architecture doc upload)
│   │   │   └── menu-access.routes.ts # RBAC menu rules
│   │   ├── utils/
│   │   │   ├── password.ts
│   │   │   ├── jwt.ts
│   │   │   └── logger.ts
│   │   ├── sql/
│   │   │   └── init.sql        # Full schema
│   │   └── seed.ts
│   └── package.json
│
├── frontend/                   # React SPA
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── theme.ts           # Blue professional color scheme
│   │   ├── config/
│   │   │   └── navConfig.ts   # Single source of truth for nav/menu items
│   │   ├── components/
│   │   │   ├── MainLayout.tsx  # Sidebar, header, RBAC menu filtering
│   │   │   ├── StoryCard.tsx
│   │   │   ├── CheckPanel.tsx
│   │   │   └── EpicProposal.tsx
│   │   ├── pages/
│   │   │   ├── Login.tsx
│   │   │   ├── meetings/
│   │   │   │   └── MeetingView.tsx   # Per-meeting: stories, checks, memo, audit — all tabs
│   │   │   ├── ActionList.tsx        # Per-role action queue
│   │   │   ├── StoryList.tsx         # All stories, filter/sort
│   │   │   ├── Dashboard.tsx         # Key metrics
│   │   │   ├── KnowledgeBase.tsx     # KB browser
│   │   │   ├── data/
│   │   │   │   ├── BacklogData.tsx   # Upload/manage backlog JSON
│   │   │   │   └── ArchitectureData.tsx # Upload/manage architecture doc
│   │   │   └── settings/
│   │   │       ├── Users.tsx
│   │   │       ├── Roles.tsx
│   │   │       └── Access.tsx        # RBAC menu access control
│   │   ├── services/
│   │   │   └── api.ts          # Axios + interceptors
│   │   └── store/
│   │       ├── auth.ts
│   │       └── meetings.ts
│   └── package.json
│
├── agents/                     # Python agent pipeline
│   ├── main.py                 # FastAPI app
│   ├── pipeline/
│   │   ├── graph.py            # LangGraph state graph definition
│   │   ├── state.py            # Pipeline state schema
│   │   ├── parser.py           # Agent 1: Parser
│   │   ├── retriever.py        # Agent 2: Context Retrieval
│   │   ├── crossref.py         # Agent 3: Cross-Reference
│   │   ├── synthesizer.py      # Agent 4: Synthesis
│   │   ├── validator.py        # Grounding validation (post-synthesis)
│   │   └── memo.py             # Agent 5: Memo
│   ├── tools/
│   │   ├── transcript.py       # Transcript reader
│   │   ├── architecture.py     # Architecture doc reader
│   │   ├── backlog.py          # Backlog JSON reader
│   │   └── kb.py               # PostgreSQL + pgvector read/write
│   ├── models/
│   │   ├── story.py            # Story, Check, Epic data models
│   │   └── memo.py             # Memo data model
│   └── requirements.txt
│
├── scripts/
│   ├── setup.sh                # Install deps, init DB, seed admin
│   ├── start.sh                # Run all services (backend + frontend + agents)
│   ├── stop.sh                 # Kill processes
│   └── deploy-azure.sh         # Deploy to Azure App Service
│
├── data/                       # Synthetic test data (mocked inputs)
├── deliverables/
├── project/
└── package.json                # Root workspace
```

## Agent Pipeline (LangGraph)

### State Schema

```python
class PipelineState(TypedDict):
    # Input
    meeting_id: str
    transcript: str
    
    # Agent 1 output
    requirements: list[Requirement]
    
    # Agent 2 output
    context: dict[str, list]  # per-requirement context from KB
    
    # Agent 3 output
    checks: list[Check]
    
    # Agent 4 output
    candidate_stories: list[CandidateStory]
    epic_proposals: list[EpicProposal]
    meeting_quality: MeetingQuality
    
    # Validation output
    validation_results: list[ValidationResult]
    
    # Human review (set by UI via API)
    review_decisions: list[ReviewDecision]
    
    # Agent 5 output
    memo: DecisionMemo
    
    # Error tracking
    errors: list[PipelineError]
```

### Graph Definition

```python
from langgraph.graph import StateGraph, END

graph = StateGraph(PipelineState)

# Nodes
graph.add_node("parser", parser_agent)
graph.add_node("retriever", retrieval_agent)
graph.add_node("crossref", crossref_agent)
graph.add_node("synthesizer", synthesis_agent)
graph.add_node("validator", validation_agent)       # NEW: grounding check
graph.add_node("human_review", human_review_node)
graph.add_node("memo", memo_agent)

# Edges
graph.add_edge("parser", "retriever")
graph.add_edge("retriever", "crossref")
graph.add_edge("crossref", "synthesizer")
graph.add_edge("synthesizer", "validator")           # validate before presenting
graph.add_edge("validator", "human_review")

# Conditional: after human review
graph.add_conditional_edges(
    "human_review",
    route_after_review,
    {
        "recheck": "crossref",    # Story was edited → re-run checks
        "memo": "memo",           # All done → generate memo
        "wait": "human_review",   # Still pending → wait
    }
)
graph.add_edge("memo", END)

# Entry point
graph.set_entry_point("parser")

pipeline = graph.compile(checkpointer=PostgresSaver())
```

### Human-in-the-Loop

LangGraph's checkpointing allows the pipeline to **pause** at the `human_review` node and **resume** when the user submits decisions via the UI:

1. Pipeline runs agents 1-4 + validator, produces candidate stories
2. Pipeline checkpoints at `human_review` — state saved to PostgreSQL
3. UI shows stories to user (could be hours/days later)
4. User resolves checks, edits stories, confirms/rejects
5. UI calls API with review decisions
6. Pipeline resumes from checkpoint:
   - If any story was edited → route to `crossref` (re-check + re-validate)
   - If all done → route to `memo`
   - If still pending → stay at `human_review`

### Story Status Transitions (enforced by backend)

```
Generated
  → Under Review          (when checks are assigned)
  → Awaiting Confirmation (when zero checks, or after all checks resolved)

Under Review
  → Awaiting Confirmation (all checks resolved)
  → Pending Decision      (blocked on epic approval or unresolvable conflict)

Pending Decision
  → Under Review          (blocker resolved, remaining checks to address)
  → Awaiting Confirmation (blocker resolved, no other checks)

Awaiting Confirmation
  → Confirmed             (human explicitly approves)
  → Rejected              (human explicitly rejects — rationale required)
  → Under Review          (story edited → re-check triggered)

Confirmed
  → Ready to Push         (all meeting stories confirmed, meeting status → Completed)

Ready to Push
  (terminal state — outside system scope)
```

**Note:** `Confirmed → Ready to Push` happens automatically when all stories in a meeting are either Confirmed or Rejected and the decision memo has been generated. This signals the meeting is fully processed.

### Edit Re-Run Flow

```
User edits story in UI
       ↓
API receives edit
       ↓
Update pipeline state (edited story)
       ↓
Resume from checkpoint → route to "crossref"
       ↓
Cross-Reference re-checks edited story only
       ↓
Synthesis updates checks, detects drift from source
       ↓
Validator re-checks grounding on edited story
       ↓
Back to human_review checkpoint
       ↓
UI shows updated checks + drift warning if applicable
```

## Agent Definitions

### Agent 1: Parser
**LLM:** GPT-4o
**Input:** Raw transcript text
**Output:** Structured requirement list

```python
PARSER_SYSTEM = """
Extract all requirements from the meeting transcript.
For each requirement:
- Quote the exact source text (citation required)
- Classify type: feature | bug | improvement | tech_debt | nfr
- Classify granularity: epic | story | task
- Extract priority signals (urgency cues, deadlines)
- Flag ambiguities with specific questions
- Assign confidence: high | medium | low

Output as structured JSON.
IMPORTANT: Only extract what is explicitly stated or clearly implied 
in the transcript. Do not invent requirements.
"""
```

### Agent 2: Context Retrieval
**LLM:** GPT-4o (for relevance filtering)
**Embedding:** text-embedding-3-small (via pgvector)
**Input:** Requirement list from Agent 1
**Output:** Per-requirement context from KB

```python
# For each requirement:
# 1. Embed requirement description
# 2. Search pgvector for similar: meetings, decisions, backlog items, architecture
# 3. LLM filters retrieved items for relevance
# 4. If requirement references prior context but nothing found → ambiguity flag
```

### Agent 3: Cross-Reference
**LLM:** GPT-4o
**Input:** Requirements + context
**Output:** Checks per requirement

Checks performed:
- Backlog overlap/duplicate (with confidence: high/medium/low)
- Architecture constraint violations
- NFR validation (feasibility of non-functional requirements against architecture constraints)
- Prior decision contradictions
- Dependencies (between new stories, and against existing backlog)
- Backlog hygiene (obsolete items → stored in `backlog_hygiene_flags` table)
- No-epic check (auto-created for stories that couldn't be mapped to any epic)

### Agent 4: Synthesis
**LLM:** GPT-4o
**Input:** Requirements + context + checks
**Output:** Candidate stories grouped by epic

Key responsibilities:
- Generate stories with acceptance criteria, tags, citations
- Map to existing epics or propose new epics (with justification)
- Attach checks from Agent 3
- Auto-create "No Epic" blocking check for stories that couldn't be mapped to any epic
- Route questions to roles
- Generate meeting quality feedback with verbal recommendation (e.g., "Well-structured meeting. Consider splitting the auth discussion into a separate session.")

### Grounding Validator (post-synthesis)
**LLM:** GPT-4o
**Input:** Candidate stories + original transcript
**Output:** Validation results

```python
VALIDATOR_SYSTEM = """
For each candidate story, verify:
1. source_citation exists verbatim (or near-verbatim) in the transcript
2. acceptance_criteria are derivable from the cited text
3. no requirements were fabricated (not in transcript)
4. confidence level matches grounding strength

For each story, output:
- grounding_status: valid | warning | invalid
- issues: list of specific grounding problems found
- suggested_fix: how to correct the issue

Stories with grounding_status=invalid must be flagged before 
presenting to the user.
"""
```

This validator catches hallucinations before they reach the human reviewer. Invalid stories get flagged in the UI with a grounding warning.

### Agent 5: Memo
**LLM:** GPT-4o
**Input:** Current state (stories + review decisions)
**Output:** Decision memo + KB updates

Triggered on demand. Generates versioned memo reflecting current state. Writes all artifacts to KB.

## Pipeline Progress Reporting

The UI shows a progress bar during pipeline processing. This requires real-time progress from FastAPI to Express to the frontend.

### Mechanism: Server-Sent Events (SSE)

```
Frontend ←── SSE (EventSource) ←── Express ←── SSE ←── FastAPI
```

1. Frontend opens SSE connection: `GET /api/meetings/:id/progress`
2. Express proxies to FastAPI: `GET /pipeline/:meeting_id/progress`
3. Each LangGraph node emits a progress event on completion:

```python
# In each agent node:
async def parser_agent(state, config):
    progress_callback = config.get("progress_callback")
    progress_callback({
        "agent": "parser",
        "status": "running",
        "message": "Extracting requirements from transcript..."
    })
    
    # ... do work ...
    
    progress_callback({
        "agent": "parser", 
        "status": "done",
        "message": "Extracted 9 requirements",
        "details": {"requirement_count": 9}
    })
    return state
```

4. Progress events stored in `meetings.pipeline_progress` (JSONB) for reconnection:

```json
[
    {"agent": "parser", "status": "done", "message": "Extracted 9 requirements"},
    {"agent": "retriever", "status": "running", "message": "Searching knowledge base..."},
    {"agent": "crossref", "status": "pending"},
    {"agent": "synthesizer", "status": "pending"},
    {"agent": "validator", "status": "pending"}
]
```

5. Frontend displays as progress bar with human-readable messages per step.

---

## Error Handling & Retry

### Node-Level Retry
Each LangGraph node has retry logic for transient LLM failures:

```python
from tenacity import retry, stop_after_attempt, wait_exponential

@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=30),
    retry=retry_if_exception_type((openai.RateLimitError, openai.APITimeoutError))
)
async def call_llm(prompt, model="gpt-4o"):
    ...
```

### Failure Modes

| Failure | Handling | User Impact |
|---|---|---|
| LLM rate limit | Retry with exponential backoff (3 attempts) | Delayed, transparent |
| LLM timeout | Retry, then mark agent output as partial | Warning in UI |
| LLM returns invalid JSON | Re-prompt with error context (1 retry) | Transparent |
| Pipeline crash mid-run | Checkpoint saved — resume from last completed node | User re-triggers, no data loss |
| Embedding generation fails | Retry, then skip KB search for that requirement | Warning: "limited context" |
| Database connection lost | Retry with backoff, then halt pipeline | Error message in UI |

### Error State in Pipeline
Errors are accumulated in `PipelineState.errors` and surfaced in the UI. Non-fatal errors (partial results, skipped KB search) produce warnings. Fatal errors halt the pipeline at a checkpoint.

## Audit Trail

### Three Levels of Tracing

**Level 1: Agent Trace (per pipeline run)**
Every agent execution is logged with full context:

```sql
CREATE TABLE agent_traces (
    id SERIAL PRIMARY KEY,
    meeting_id INTEGER REFERENCES meetings(id),
    agent_name VARCHAR(50),           -- parser | retriever | crossref | synthesizer | validator | memo
    input_summary JSONB,              -- what the agent received
    output_summary JSONB,             -- what the agent produced
    llm_model VARCHAR(50),            -- gpt-4o
    llm_prompt_tokens INTEGER,
    llm_completion_tokens INTEGER,
    duration_ms INTEGER,
    errors JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);
```

**Level 2: Entity Audit Log (per change)**
Every change to stories, checks, epics tracked:

```sql
CREATE TABLE audit_log (
    id SERIAL PRIMARY KEY,
    entity_type VARCHAR(50),          -- story | check | epic | meeting
    entity_id INTEGER,
    action VARCHAR(50),               -- created | updated | status_changed | confirmed | rejected
    old_value JSONB,
    new_value JSONB,
    user_id INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW()
);
```

**Level 3: Decision Trail (per story)**
End-to-end trace from source text to confirmed story:
- Which transcript text → which requirement (Parser)
- Which KB context was retrieved (Retriever)
- Which checks were raised and why (Cross-Reference)
- How the story was generated (Synthesis)
- Grounding validation result (Validator)
- Human decisions: edits, check resolutions, confirm/reject (UI)

Reconstructable by joining: `agent_traces` (by meeting_id) + `audit_log` (by entity_id) + `decisions` (by story_id).

## Feedback Loop

Human corrections improve future runs:

### What Gets Stored
| Human Action | Stored As | Used By |
|---|---|---|
| Story rejected with rationale | `decisions` row (type=rejected, rationale) | Cross-Reference agent: "similar story was rejected before because X" |
| Story modified (edited) | `audit_log` row (old_value=original, new_value=edited) | Synthesis agent: "user previously adjusted acceptance criteria style to X" |
| Check dismissed | `checks` row (status=dismissed, resolution_notes) | Cross-Reference agent: "this type of overlap was dismissed as non-issue" |
| Epic proposal rejected | `decisions` row (type=epic_rejected, rationale) | Synthesis agent: "proposing epics for this area was rejected before" |

### How It's Used
Context Retrieval (Agent 2) searches `decisions` and `audit_log` tables alongside meetings and stories. When it finds relevant prior feedback, it includes it in the context package:

```python
# In retriever agent:
# 1. Search for similar prior stories that were rejected
# 2. Search for prior edits to similar stories
# 3. Include in context: "Note: a similar story was rejected on 2026-03-15 
#    because 'this duplicates existing functionality in ERIS-042'"
```

This gives downstream agents (Cross-Reference, Synthesis) awareness of past human decisions without retraining.

## Knowledge Base (PostgreSQL + pgvector)

### Single database, three-layer storage:

| Layer | Table | Content | Search Method |
|---|---|---|---|
| **Summary** | `kb_embeddings` | Meeting summaries, decision summaries, story summaries | pgvector cosine similarity |
| **Structured** | `stories`, `checks`, `epics`, `decisions`, `backlog_hygiene_flags` | All structured entities | SQL queries, joins |
| **Raw** | `meetings` (transcript), `memos` (content) | Original text | Full-text search (tsvector) |

### Embedding Table

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE kb_embeddings (
    id SERIAL PRIMARY KEY,
    content_type VARCHAR(50),         -- meeting_summary | decision | story | architecture
    content_id INTEGER,               -- FK to source table
    content_text TEXT,                 -- the text that was embedded
    embedding vector(1536),           -- text-embedding-3-small output
    metadata JSONB,                   -- meeting_id, date, topics, etc.
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX ON kb_embeddings USING ivfflat (embedding vector_cosine_ops);
```

### Retrieval Flow
```python
# 1. Embed the query
query_embedding = openai.embed(requirement_text)

# 2. Search pgvector for top-K similar
results = db.query("""
    SELECT content_text, metadata, 
           1 - (embedding <=> %s) as similarity
    FROM kb_embeddings
    WHERE content_type IN ('meeting_summary', 'decision', 'story')
    ORDER BY embedding <=> %s
    LIMIT 10
""", [query_embedding, query_embedding])

# 3. LLM filters for relevance
relevant = llm_filter(requirement_text, results)
```

## Backlog Hygiene Storage

```sql
CREATE TABLE backlog_hygiene_flags (
    id SERIAL PRIMARY KEY,
    meeting_id INTEGER REFERENCES meetings(id),
    external_item_id VARCHAR(50),     -- e.g., ERIS-023
    flag_type VARCHAR(50),            -- potentially_obsolete | data_quality
    reason TEXT,
    source_citation TEXT,             -- meeting text that triggered the flag
    status VARCHAR(50) DEFAULT 'open', -- open | acknowledged | dismissed
    resolved_by INTEGER REFERENCES users(id),
    resolved_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);
```

## Database Schema (PostgreSQL + pgvector)

```sql
-- Extensions
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;  -- for fuzzy text search

-- Users & Auth (from Vanguard)
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    display_name VARCHAR(255),
    roles JSONB DEFAULT '[]',
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE refresh_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    token VARCHAR(500) NOT NULL,
    expires_at TIMESTAMP NOT NULL
);

-- Meetings
CREATE TABLE meetings (
    id SERIAL PRIMARY KEY,
    title VARCHAR(500),
    transcript TEXT NOT NULL,
    transcript_tsvector tsvector,      -- full-text search index
    file_name VARCHAR(255),
    status VARCHAR(50) DEFAULT 'processing',  -- processing | in_review | completed
    meeting_quality JSONB,
    pipeline_progress JSONB,           -- SSE progress events for UI
    uploaded_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Backlog Items (uploaded via UI)
CREATE TABLE backlog_items (
    id SERIAL PRIMARY KEY,
    external_id VARCHAR(50),           -- e.g., ERIS-001
    type VARCHAR(50),                  -- epic | story | bug | improvement | task
    title VARCHAR(500) NOT NULL,
    description TEXT,
    status VARCHAR(50),                -- backlog | in_progress | done | blocked
    epic_id VARCHAR(50),               -- parent epic external_id
    priority VARCHAR(20),              -- critical | high | medium | low
    labels JSONB,
    acceptance_criteria JSONB,
    dependencies JSONB,
    uploaded_at TIMESTAMP DEFAULT NOW()
);

-- Architecture Documents (uploaded via UI)
CREATE TABLE architecture_docs (
    id SERIAL PRIMARY KEY,
    file_name VARCHAR(255),
    content TEXT NOT NULL,
    version INTEGER DEFAULT 1,
    uploaded_by INTEGER REFERENCES users(id),
    uploaded_at TIMESTAMP DEFAULT NOW()
);

-- Menu Access (RBAC rules)
CREATE TABLE menu_access (
    id SERIAL PRIMARY KEY,
    role_id INTEGER REFERENCES roles(id),
    menu_path VARCHAR(255),
    tab_name VARCHAR(255),
    allowed BOOLEAN DEFAULT TRUE
);

-- Roles
CREATE TABLE roles (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT
);

-- Epics
CREATE TABLE epics (
    id SERIAL PRIMARY KEY,
    external_id VARCHAR(50),
    title VARCHAR(500) NOT NULL,
    description TEXT,
    status VARCHAR(50) DEFAULT 'active',
    is_proposed BOOLEAN DEFAULT FALSE,
    proposed_by_meeting INTEGER REFERENCES meetings(id),
    proposal_justification TEXT,       -- why existing epics don't fit
    approved_by INTEGER REFERENCES users(id),
    approved_at TIMESTAMP
);

-- Stories
CREATE TABLE stories (
    id SERIAL PRIMARY KEY,
    meeting_id INTEGER REFERENCES meetings(id),
    epic_id INTEGER REFERENCES epics(id),
    title VARCHAR(500) NOT NULL,
    description TEXT,
    type VARCHAR(50),
    acceptance_criteria JSONB,
    feature_tags JSONB,
    priority_signals JSONB,
    confidence VARCHAR(10),
    source_citation TEXT,
    status VARCHAR(50) DEFAULT 'generated',  -- generated | under_review | pending_decision | awaiting_confirmation | confirmed | rejected | ready_to_push
    original_content JSONB,            -- AI-generated version (drift detection)
    grounding_status VARCHAR(20),      -- valid | warning | invalid
    grounding_issues JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    confirmed_at TIMESTAMP,
    confirmed_by INTEGER REFERENCES users(id)
);

-- Checks
CREATE TABLE checks (
    id SERIAL PRIMARY KEY,
    story_id INTEGER REFERENCES stories(id),
    check_type VARCHAR(50),
    details TEXT,
    proposed_resolution TEXT,
    routed_to VARCHAR(50),
    status VARCHAR(50) DEFAULT 'open',
    resolved_by INTEGER REFERENCES users(id),
    resolution_notes TEXT,
    resolved_at TIMESTAMP
);

-- Decisions
CREATE TABLE decisions (
    id SERIAL PRIMARY KEY,
    meeting_id INTEGER REFERENCES meetings(id),
    story_id INTEGER REFERENCES stories(id),
    epic_id INTEGER REFERENCES epics(id),
    decision_type VARCHAR(50),
    rationale TEXT,
    decided_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Memos
CREATE TABLE memos (
    id SERIAL PRIMARY KEY,
    meeting_id INTEGER REFERENCES meetings(id),
    version INTEGER DEFAULT 1,
    content TEXT,
    generated_at TIMESTAMP DEFAULT NOW()
);

-- Backlog Hygiene Flags
CREATE TABLE backlog_hygiene_flags (
    id SERIAL PRIMARY KEY,
    meeting_id INTEGER REFERENCES meetings(id),
    external_item_id VARCHAR(50),
    flag_type VARCHAR(50),
    reason TEXT,
    source_citation TEXT,
    status VARCHAR(50) DEFAULT 'open',
    resolved_by INTEGER REFERENCES users(id),
    resolved_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Agent Traces (audit)
CREATE TABLE agent_traces (
    id SERIAL PRIMARY KEY,
    meeting_id INTEGER REFERENCES meetings(id),
    agent_name VARCHAR(50),
    input_summary JSONB,
    output_summary JSONB,
    llm_model VARCHAR(50),
    llm_prompt_tokens INTEGER,
    llm_completion_tokens INTEGER,
    duration_ms INTEGER,
    errors JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Entity Audit Log
CREATE TABLE audit_log (
    id SERIAL PRIMARY KEY,
    entity_type VARCHAR(50),
    entity_id INTEGER,
    action VARCHAR(50),
    old_value JSONB,
    new_value JSONB,
    user_id INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Knowledge Base Embeddings
CREATE TABLE kb_embeddings (
    id SERIAL PRIMARY KEY,
    content_type VARCHAR(50),
    content_id INTEGER,
    content_text TEXT,
    embedding vector(1536),
    metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX ON kb_embeddings USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX ON meetings USING gin (transcript_tsvector);
```

## UI Color Scheme

```css
:root {
    --blue-900: #0a1a3a;
    --blue-800: #0d2b5e;
    --blue-700: #0033A0;    /* Primary */
    --blue-400: #3d8bfd;    /* Accent */
    --blue-100: #e8f0fe;
    --blue-50:  #f4f7fc;
    --white:    #ffffff;
    --gray-50:  #fafafa;
    --gray-100: #f5f5f7;
    --gray-200: #e8e8ed;
    --gray-400: #9a9aad;
    --gray-600: #5a5a6e;
    --gray-800: #2d2d3a;
    --gray-900: #1a1a2e;
}
```

Applied via Ant Design `ConfigProvider` theme token:
```typescript
const theme = {
    token: {
        colorPrimary: '#0033A0',
        colorLink: '#3d8bfd',
        colorBgLayout: '#f4f7fc',
    }
};
```

## UI Navigation & Pages

### Sidebar Menu Structure
```
Meetings (main)
├── Action List         (/actions)          # Per-role pending items
├── All Stories         (/stories)          # All stories, filter/sort
└── Dashboard           (/dashboard)        # Key metrics

Data
├── Backlog Data        (/data/backlog)     # Upload/manage backlog JSON
└── Architecture Doc    (/data/architecture)# Upload/manage architecture doc

Knowledge Base          (/kb)               # Search prior meetings, decisions

Settings
├── Users               (/settings/users)
├── Roles               (/settings/roles)
└── Access Control      (/settings/access)  # RBAC menu rules
```

### Page Definitions

| Page | Route | Key Components |
|---|---|---|
| Login | `/login` | Email/password, JWT auth |
| **Meeting View** | `/meetings/:id` | **Central hub — all meeting-related content accessible via tabs** |
| Action List | `/actions` | Pending items for user's roles, sorted by date |
| All Stories | `/stories` | Filter/sort all stories across all meetings |
| Dashboard | `/dashboard` | Generated/confirmed/rejected counts, review times, pending by role |
| Backlog Data | `/data/backlog` | Upload backlog JSON, view/edit items, replace data |
| Architecture Doc | `/data/architecture` | Upload architecture .md, view current doc |
| Knowledge Base | `/kb` | Search prior meetings, decisions, stories (pgvector + full-text) |
| Users | `/settings/users` | User CRUD |
| Roles | `/settings/roles` | Role CRUD |
| Access Control | `/settings/access` | RBAC menu rules per role |

### Meeting View — Central Hub

The Meeting View is the main workspace. Everything associated with a meeting is accessible from tabs within this view:

```
Meeting: "Project Kickoff — 2026-03-15"        [Status: Reviewed]
┌──────────────────────────────────────────────────────────────────┐
│  Stories  │  Checks  │  Memo  │  Audit Trail  │  Meeting Info   │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  [Tab content here]                                              │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

| Tab | Content |
|---|---|
| **Stories** | Story list grouped by epic, statuses, confirm/reject/edit actions, check resolution panels |
| **Checks** | All open checks for this meeting, filterable by type and role |
| **Memo** | Decision memo (generate/regenerate), meeting quality feedback, version history |
| **Audit Trail** | Agent traces for this meeting, entity changes, decision trail |
| **Meeting Info** | Original transcript, pipeline status, upload date, processing metadata |

### Data Loading Pages

Upload and manage the system's input data sources:

**Backlog Data** (`/data/backlog`):
- Upload backlog JSON file (validated against schema)
- View current backlog items in table with filtering
- Replace all data (truncate + insert in transaction)
- Download current backlog as JSON

**Architecture Doc** (`/data/architecture`):
- Upload architecture markdown file
- View current architecture doc (rendered markdown)
- Replace document (stores new version, old version kept in KB)

## Deployment

### Target: Azure App Service
- **Webapp:** `backlog-synthesizer`
- **Resource Group:** Same subscription as existing apps (`80a7948e-60eb-4f6d-b970-53bb6d8e5639`)
- **URL:** `https://backlog-synthesizer.azurewebsites.net`
- **DB:** Azure PostgreSQL Flexible Server with pgvector extension

### Deployment Script (`scripts/deploy-azure.sh`)

Same pattern as existing Azure deploy scripts in the subscription. Steps:

```
[0/6] Check prerequisites (az cli, jq, az login)
[1/6] Build locally (npm install + npm run build)
[2/6] Provision Azure PostgreSQL Flexible Server (if not exists)
      - Standard_B1ms, 32GB, PostgreSQL 16
      - Enable pgvector: az postgres flexible-server parameter set --name azure.extensions --value vector
      - Create database, firewall rules
[3/6] Configure App Settings
      - NODE_ENV, PORT=8080, JWT secrets, PG connection, OPENAI_API_KEY
      - AGENTS_URL=http://localhost:8000 (internal)
      - Startup command: node backend/dist/index.js
[4/6] Package & Deploy
      - Stage: backend/dist + frontend/dist + agents/ + sql/init.sql + package.json (prod deps only)
      - ZIP deploy: az webapp deploy --type zip
[5/6] Run DB seed
      - Apply schema via psql from local Mac (init.sql with pgvector extension)
      - Run seed.js via Kudu API
[6/6] Optional: transfer PostgreSQL data (pg_dump → truncate → restore)
      - Tables: users, roles, menu_access, meetings, stories, checks, epics, decisions, memos, kb_embeddings
```

**Key additions vs existing deploy scripts:**
- Enables pgvector extension on Azure PostgreSQL
- Packages `agents/` Python directory alongside Node backend
- Python agents run as a background process on the App Service (uvicorn on port 8000)
- `OPENAI_API_KEY` added to app settings

### Environment Variables (Azure App Settings)

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | `8080` |
| `PG_HOST` | `backlog-synthesizer-db.postgres.database.azure.com` |
| `PG_PORT` | `5432` |
| `PG_DATABASE` | `backlog_synthesizer_db` |
| `PG_USER` | `bsadmin` |
| `PG_PASSWORD` | `...` |
| `PG_SSL` | `true` |
| `JWT_ACCESS_SECRET` | `(auto-generated)` |
| `JWT_REFRESH_SECRET` | `(auto-generated)` |
| `JWT_ACCESS_EXPIRY` | `15m` |
| `JWT_REFRESH_EXPIRY` | `7d` |
| `OPENAI_API_KEY` | `...` |
| `AGENTS_URL` | `http://localhost:8000` |
| `CLIENT_URL` | `https://backlog-synthesizer.azurewebsites.net` |

### Useful Commands
```bash
# Logs
az webapp log tail --name backlog-synthesizer --resource-group <RG>

# SSH
az webapp ssh --name backlog-synthesizer --resource-group <RG>

# Restart
az webapp restart --name backlog-synthesizer --resource-group <RG>
```

## Communication: Frontend ↔ Backend ↔ Agents

```
Frontend (React) → Backend (Express) → Agents (FastAPI/Python)
                         ↕                      ↕
                    PostgreSQL (pgvector) ←──────┘
```

- Frontend calls Express backend (JWT auth on all routes)
- Express proxies agent pipeline calls to FastAPI (Python)
- Both Express and FastAPI read/write PostgreSQL
- Express handles auth, file uploads, data loading, CRUD
- FastAPI handles pipeline execution, LLM calls, embedding generation
- Deployed to Azure App Service at `https://backlog-synthesizer.azurewebsites.net`

---

## Requirements Cross-Check

| Requirement (initial_task.md + system concept) | Architecture Coverage |
|---|---|
| Multi-agent framework | LangGraph with 5 agents + validator |
| Agents handle task decomposition, planning, tool invocation | Parser decomposes, Synthesis plans, all agents use tools |
| Context/memory engine persists across stages | pgvector KB + PostgreSQL structured data |
| Memory persists across document parsing, gap detection, story writing | LangGraph state + PostgreSQL checkpoints |
| Modular tool abstractions | `agents/tools/` — transcript, architecture, backlog, kb readers |
| Error handling and retry logic | Node-level retry (tenacity), failure mode table, error state in pipeline |
| Audit logs show how conclusions were reached | 3-level tracing: agent traces + entity audit + decision trail |
| Story lifecycle with checks | DB schema: stories + checks tables, status transitions |
| Epic proposal + PM approval | epics table with is_proposed, proposal_justification, approved_by |
| Decision memo on demand, versioned | Memo agent, memos table with version |
| Knowledge base (RAG) three-layer | pgvector (summary), PostgreSQL (structured), PostgreSQL text (raw) |
| Grounding / hallucination prevention | Validator agent checks citations exist in source |
| Confidence levels on all outputs | confidence field on stories, grounding_status from validator |
| Feedback loop (corrections improve future) | Decisions + audit_log searched by retriever, included in context |
| Backlog hygiene flags | backlog_hygiene_flags table |
| Drift detection on story edit | original_content JSONB, re-run crossref+validator on edit |
| Role-based action list | Checks routed_to field, UI queries by user roles |
| Meeting quality feedback | meeting_quality JSONB on meetings table |
| UI for review workflow | 10 pages mapped to all system concept requirements |

---

## AI Prompts Used

**Session 2.1 — Framework Exploration (AI Explore)**

Prompt: "Compare LangGraph vs CrewAI vs Custom for our 5-agent pipeline with human-in-the-loop, audit trails, and edit re-runs."

Decision: LangGraph — graph-based orchestration maps to our conditional flow (edit → re-check), checkpointing enables human-in-the-loop pause/resume, built-in tracing for audit.

**Session 2.1 — Architecture Design (AI Build)**

Key decisions:
- Python agents (FastAPI) separate from TypeScript UI (Express)
- LangGraph StateGraph with PostgresSaver for checkpoint persistence
- Monorepo pattern: backend/ + frontend/ + agents/
- OpenAI GPT-4o for all agents
- Edit re-run via conditional edges in LangGraph graph
- Meeting View as central hub — memo, audit, stories all as tabs
- Data loading pages for backlog JSON and architecture doc upload
- Deployment to Azure App Service at https://backlog-synthesizer.azurewebsites.net

**Session 2.1 — Reference Project Analysis**

Explored reference projects for:
- App framework patterns: React + Vite + Ant Design + Zustand / Express + PostgreSQL + JWT auth / monorepo / data loading with CSV upload / RBAC menu filtering
- Color scheme: Blue professional (#0033A0 primary, #3d8bfd accent)

**Session 2.1 — Architecture Review (AI Review)**

Cross-checked against initial_task.md + system concept. 6 gaps found and fixed:
1. **PostgreSQL only** — removed ChromaDB, using pgvector for embeddings in single DB
2. **Error handling & retry** — added node-level retry with tenacity, failure mode table
3. **Audit trail detail** — added 3-level tracing: agent traces table, entity audit log, decision trail
4. **Grounding validation** — added Validator agent between Synthesis and human_review
5. **Feedback loop** — retriever searches decisions + audit_log for prior corrections
6. **Backlog hygiene storage** — added backlog_hygiene_flags table
