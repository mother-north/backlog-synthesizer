# Architecture Diagram: Backlog Synthesizer

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              USERS                                          │
│                    PM  /  Architect  /  Dev Lead                             │
└─────────────────────────────┬───────────────────────────────────────────────┘
                              │ HTTPS
                              ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         FRONTEND (React SPA)                                │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐         │
│  │ Meetings │ │ Stories  │ │Dashboard │ │ KB       │ │ Data     │         │
│  │          │ │          │ │          │ │ Browser  │ │ Loading  │         │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘         │
│  ┌──────────┐                                                              │
│  │ Settings │  Ant Design + Zustand + React Router                         │
│  │          │  Blue theme (#0033A0)                                         │
│  └──────────┘                                                              │
│                              │ Axios (JWT auth)                             │
└──────────────────────────────┼──────────────────────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      BACKEND (Express.js + TypeScript)                       │
│                                                                             │
│  ┌─────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐          │
│  │  Auth   │ │ Meetings │ │ Stories  │ │  Checks  │ │  Epics   │          │
│  │ routes  │ │ routes   │ │ routes   │ │  routes  │ │  routes  │          │
│  └─────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘          │
│  ┌─────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐                       │
│  │Dashboard│ │   KB     │ │ Data     │ │  Menu    │   JWT middleware       │
│  │ routes  │ │  routes  │ │  Load    │ │  Access  │   RBAC checks         │
│  └─────────┘ └──────────┘ └──────────┘ └──────────┘                       │
│                              │                                              │
│              ┌───────────────┼───────────────┐                              │
│              │ proxy         │ direct SQL    │                              │
│              ▼               ▼               ▼                              │
│     ┌──────────────┐  ┌──────────┐  ┌──────────────┐                       │
│     │ Agents API   │  │PostgreSQL│  │  File Upload │                       │
│     │ (FastAPI)    │  │          │  │  (Multer)    │                       │
│     └──────────────┘  └──────────┘  └──────────────┘                       │
└──────────────────────────────┼──────────────────────────────────────────────┘
                               │ HTTP (internal)
                               ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                     AGENTS (FastAPI + Python)                                │
│                                                                             │
│  ┌────────────────────────────────────────────────────────────────────┐     │
│  │                    LangGraph Pipeline                              │     │
│  │                                                                    │     │
│  │  ┌────────┐  ┌───────────┐  ┌──────────┐  ┌───────────┐          │     │
│  │  │ Parser │→│ Retriever │→│ CrossRef │→│ Synthesis │          │     │
│  │  └────────┘  └───────────┘  └──────────┘  └─────┬─────┘          │     │
│  │                                                   │                │     │
│  │                                            ┌──────▼──────┐        │     │
│  │                                            │  Validator  │        │     │
│  │                                            └──────┬──────┘        │     │
│  │                                                   │                │     │
│  │                                                  END               │     │
│  │                                                                    │     │
│  │  Memo: on-demand via separate /pipeline/memo endpoint              │     │
│  │                                                                    │     │
│  └────────────────────────────────────────────────────────────────────┘     │
│                                          │                                │
│  ┌────────────────────┐  ┌───────────────▼──────────────────┐            │
│  │   Tool Interfaces  │  │         OpenAI API               │            │
│  │                    │  │  GPT-4o (reasoning)              │            │
│  │  IBacklogSource    │  │  text-embedding-3-small (vectors)│            │
│  │  IArchitectureSource  └──────────────────────────────────┘            │
│  │  TranscriptReader  │                                                  │
│  │  KnowledgeBase     │                                                  │
│  └────────┬───────────┘                                                  │
│           │                                                              │
└───────────┼──────────────────────────────────────────────────────────────┘
            │ SQL + pgvector
            ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    POSTGRESQL (+ pgvector extension)                         │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Structured Layer                                                   │   │
│  │  users │ meetings │ stories │ checks │ epics │ decisions │ memos   │   │
│  │  backlog_items │ architecture_docs │ backlog_hygiene_flags          │   │
│  │  menu_access │ refresh_tokens                                       │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Vector Layer (pgvector)                                            │   │
│  │  kb_embeddings (vector(1536)) — meeting summaries, decisions,       │   │
│  │  stories, architecture sections                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Audit Layer                                                        │   │
│  │  agent_traces │ audit_log                                           │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Raw Layer                                                          │   │
│  │  meetings.transcript (tsvector) │ memos.content │ arch_docs.content │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Agent Pipeline Detail

```
                    Meeting Transcript (.md)
                              │
                    ┌─────────▼─────────┐
                    │   1. PARSER        │
                    │   Extract reqs,    │
                    │   classify type,   │
                    │   flag ambiguity   │
                    │   GPT-4o           │
                    └─────────┬─────────┘
                              │ requirements[]
                    ┌─────────▼─────────┐
                    │  2. RETRIEVER      │
                    │  Per-requirement:  │
                    │  pgvector search   │
                    │  → LLM filter      │
                    │  GPT-4o + embed    │
                    └─────────┬─────────┘
                              │ context{}
                    ┌─────────▼─────────┐
                    │  3. CROSS-REF      │
                    │  Backlog overlap   │
                    │  Arch constraints  │
                    │  Decision conflicts│
                    │  Dependencies      │
                    │  Hygiene flags     │
                    │  GPT-4o            │
                    └─────────┬─────────┘
                              │ checks[]
                    ┌─────────▼─────────┐
                    │  4. SYNTHESIS      │
                    │  Generate stories  │
                    │  Map to epics      │
                    │  Propose new epics │
                    │  Route questions   │
                    │  Meeting quality   │
                    │  GPT-4o            │
                    └─────────┬─────────┘
                              │ stories[], epics[]
                    ┌─────────▼─────────┐
                    │  5. VALIDATOR      │
                    │  Check citations   │
                    │  exist in source   │
                    │  Grounding status  │
                    │  GPT-4o            │
                    └─────────┬─────────┘
                              │ validated stories
                              ▼
                             END
                    (results saved to DB,
                     user reviews in UI)

                    Memo: on-demand via
                    separate endpoint
                    ┌───────────────────┐
                    │  6. MEMO           │
                    │  Decision memo     │
                    │  Store in KB       │
                    │  Update embeddings │
                    │  GPT-4o            │
                    └───────────────────┘
```

## Data Flow Diagram

```
┌──────────┐     upload        ┌────────────┐
│  User    │ ──────────────── │  Meetings  │ (transcript stored)
│  (UI)    │                   └──────┬─────┘
│          │                          │ pipeline generates
│          │     upload        ┌──────▼─────┐
│          │ ──────────────── │  Backlog   │ (uploaded JSON + confirmed stories)
│          │                   └────────────┘
│          │     upload        ┌────────────┐
│          │ ──────────────── │ Arch Doc   │ (markdown stored, sectioned, embedded)
└────┬─────┘                   └────────────┘
     │                                │
     │  trigger pipeline              │ tool reads
     │                                ▼
     │                         ┌─────────────┐
     │                         │   Agents    │
     │                         │   Pipeline  │
     │                         └──────┬──────┘
     │                                │ writes
     │                                ▼
     │                    ┌───────────────────────┐
     │                    │     PostgreSQL         │
     │                    │  stories, checks,      │
     │                    │  epics, agent_traces,  │
     │                    │  kb_embeddings         │
     │                    └───────────┬───────────┘
     │                                │ reads
     │      review decisions          │
     │ ◄──────────────────────────────┘
     │  (stories displayed in UI)
     │
     │  confirm/reject/edit
     │ ────────────────────────────── │
     │                                ▼
     │                    ┌───────────────────────┐
     │                    │  decisions, audit_log  │
     │                    │  (stored in PG)        │
     │                    └───────────────────────┘
     │
     │  request memo
     │ ────────────────────────────── │
                                      ▼
                              ┌──────────────┐
                              │  Memo Agent  │ → memo stored, KB updated
                              └──────────────┘
```

## Deployment Architecture

### Local Development

```
┌─────────────────────────────────────────────────────────────────┐
│                    localhost                                      │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Vite Dev Server (React)                  port 5176     │   │
│  │  - Hot reload, proxies /api → Express                   │   │
│  └──────────────────────────┬──────────────────────────────┘   │
│                              │ proxy                            │
│  ┌──────────────────────────▼──────────────────────────────┐   │
│  │  Node.js (Express)                        port 3006     │   │
│  │  - API gateway (auth, routes, file upload)              │   │
│  │  - Proxies /api/pipeline/* → FastAPI                    │   │
│  └──────────────────────────┬──────────────────────────────┘   │
│                              │ localhost:8000                    │
│  ┌──────────────────────────▼──────────────────────────────┐   │
│  │  Python (uvicorn + FastAPI)                port 8000     │   │
│  │  - LangGraph pipeline execution                         │   │
│  │  - OpenAI API calls                                     │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└──────────────────────────────┬──────────────────────────────────┘
                               │ localhost:5432
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│              Local PostgreSQL                                    │
│              PostgreSQL 16 + pgvector extension                  │
└─────────────────────────────────────────────────────────────────┘
```

**Dev commands:**
```bash
npm run dev    # Starts Vite (5176) + Express (3006) + uvicorn (8000) concurrently
```

### Azure Production

```
┌─────────────────────────────────────────────────────────────────┐
│                    Azure App Service                             │
│                    backlog-synthesizer.azurewebsites.net         │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Node.js (Express)                        port 8080     │   │
│  │  - Serves React SPA (frontend/dist)                     │   │
│  │  - API gateway (auth, routes, file upload)              │   │
│  │  - Proxies /api/pipeline/* → FastAPI                    │   │
│  └──────────────────────────┬──────────────────────────────┘   │
│                              │ localhost:8000                    │
│  ┌──────────────────────────▼──────────────────────────────┐   │
│  │  Python (uvicorn + FastAPI)                port 8000     │   │
│  │  - LangGraph pipeline execution                         │   │
│  │  - OpenAI API calls                                     │   │
│  │  - pgvector embedding operations                        │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└──────────────────────────────┬──────────────────────────────────┘
                               │ SSL (PG_SSL=true)
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│              Azure PostgreSQL Flexible Server                    │
│              backlog-synthesizer-db.postgres.database.azure.com  │
│              PostgreSQL 16 + pgvector extension                  │
│              Standard_B1ms / 32GB storage                        │
└─────────────────────────────────────────────────────────────────┘

                               │ HTTPS
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│              OpenAI API                                          │
│              api.openai.com                                      │
│              GPT-4o + text-embedding-3-small                     │
└─────────────────────────────────────────────────────────────────┘
```

## Use Case Trace

Validating the architecture handles all key use cases:

| Use Case | Path Through Architecture |
|---|---|
| UC-1: Clean meeting | UI upload → Express → FastAPI → Parser → Retriever (pgvector) → CrossRef (backlog tool) → Synthesis → Validator → END → UI review → confirm → Memo (on demand) → KB |
| UC-3: Backlog conflict | CrossRef reads backlog via IBacklogSource → detects conflict → check stored in PG → UI shows check → user resolves |
| UC-4: Prior decision conflict | Retriever searches kb_embeddings (decisions) → CrossRef flags contradiction → check routed to PM |
| UC-6: New epic proposal | Synthesis proposes epic → stored in epics table (is_proposed=true) → UI shows proposal → PM approves/rejects |
| UC-8: Overlap/duplicate | Retriever finds similar backlog items → CrossRef flags overlap with confidence → UI shows match |
| UC-12: Story edit | UI edit → Express → saved to DB (no pipeline re-run) → UI shows updated story |
| UC-13: Memo on demand | UI request → Express → FastAPI → Memo agent → generates memo → stores in memos table → UI displays |
| EC-1: Empty transcript | Parser returns 0 requirements → pipeline completes → UI shows empty meeting |
| Feedback loop | User rejects story → decision stored in PG → next meeting: Retriever finds it via search_feedback() → included in context |
| Audit trail | All agents write to agent_traces → all changes to audit_log → UI reconstructs per-story trail |

---

## AI Prompts Used

**Session 2.5 — Architecture Diagram (AI Build)**

Prompt: "Create architecture diagrams covering: system overview, agent pipeline detail, data flow, deployment, and use case trace validation."

Key decisions:
- Four diagrams: system overview (layers), agent pipeline (flow), data flow (read/write paths), deployment (Azure infra)
- Single database shown with 4 layers: structured, vector, audit, raw
- Tool interfaces shown as abstraction between agents and database
- Pipeline ends at Validator → END; memo is on-demand via separate endpoint
- No edit re-run loop; edits save to DB only
- Use case trace table validates architecture handles all scenarios
