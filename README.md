# Backlog Synthesizer

Multi-agent system that transforms meeting transcripts into structured backlog items by cross-referencing against architecture docs and existing backlog.

**Live:** [backlog-synthesizer-rde-495557106355.us-central1.run.app](https://backlog-synthesizer-rde-495557106355.us-central1.run.app)

## What It Does

Upload a meeting transcript and the system will:
- Extract requirements, bugs, improvements, and NFRs from the discussion
- Identify who said what (speaker attribution)
- Generate candidate user stories with acceptance criteria
- Map stories to existing epics or propose new ones
- Cross-reference against current backlog for overlaps, conflicts, and dependencies
- Validate that every story is grounded in the actual transcript
- Assign criticality (critical/high/medium/low)
- Generate a decision memo summarizing outcomes

All stories go through an interactive review workflow where stakeholders can confirm, reject, resolve checks, and manage epics before pushing to the backlog.

## Architecture

```
Frontend (React + Vite + Ant Design)
    |
Backend (Express.js + TypeScript)
    |
Agents (FastAPI + Python + LangGraph)
    |
Database (PostgreSQL + pgvector)
    |
OpenAI (GPT-4o + text-embedding-3-small)
```

### Agent Pipeline

```
Transcript → Parser → Retriever → CrossRef → Synthesizer → Validator → Stories
                                                                         |
                                                              Human Review (UI)
                                                                         |
                                                                  Memo Agent
```

| Agent | Role |
|-------|------|
| **Parser** | Extract requirements from transcript with speaker, type, priority |
| **Retriever** | Query knowledge base for relevant context per requirement |
| **CrossRef** | Check against backlog, architecture, prior decisions for conflicts |
| **Synthesizer** | Generate candidate stories, map to epics, attach checks |
| **Validator** | Verify source citations exist in transcript (grounding) |
| **Memo** | Generate decision memo reflecting confirmed/rejected/pending stories |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite, Ant Design, Zustand, TypeScript |
| Backend | Express.js, TypeScript, JWT auth, Helmet, rate limiting |
| Agents | FastAPI, Python, LangGraph, OpenAI GPT-4o |
| Database | PostgreSQL 16 + pgvector (structured + vector search) |
| Deployment | Azure App Service (Python runtime), Azure PostgreSQL Flexible Server |

## Project Structure

```
backend/           Express API gateway (TypeScript)
  src/routes/      API endpoints (auth, meetings, stories, checks, epics, etc.)
  sql/             Database schema
  tests/           Jest integration tests

frontend/          React SPA (TypeScript)
  src/pages/       Page components
  src/components/  Shared components
  tests/           Vitest component tests

agents/            Python agent pipeline
  pipeline/        6 LangGraph agents (parser, retriever, crossref, synthesizer, validator, memo)
  tools/           DB, KB, transcript, backlog, architecture tools
  models/          Pydantic models
  eval/            Evaluation framework (10 metrics, golden dataset)
  tests/           Pytest unit + integration tests

data/              Synthetic test data (ERIS system)
  meeting_notes/   12 sample meeting transcripts
  golden/          5 golden scenarios for evaluation
  backlog/         Sample backlog items
  architecture/    Sample architecture docs

deliverables/      SDLC artifacts
  phase1/          Problem framing (AI prompts documented)
  phase2/          Architecture design (agents, tools, memory, UI)
  phase3/          Evaluation plan (metrics, rubrics, pipeline)
  phase4/          Implementation artifacts (test reports, code assessment)

scripts/           Deployment and operations
  deploy-azure.sh  Azure deployment (--code-only, --with-data, --deps-only)
  startup.sh       Azure App Service startup (Python + Node.js)
```

## Getting Started

### Prerequisites

- Node.js 22+
- Python 3.12+
- PostgreSQL 16 with pgvector extension
- OpenAI API key

### Setup

```bash
# Install dependencies
npm install
cd agents && python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt

# Create database
createdb backlog_synthesizer_db
psql -d backlog_synthesizer_db -f backend/sql/init.sql

# Configure environment
cp backend/.env.example backend/.env    # Set PG_*, JWT_*, OPENAI_API_KEY
cp agents/.env.example agents/.env      # Set OPENAI_API_KEY

# Start all services
npm run dev
```

### Run Tests

```bash
npm run test            # All unit tests (212 tests)
npm run test:backend    # Backend API tests (Jest, 48 tests)
npm run test:frontend   # Frontend component tests (Vitest, 50 tests)
npm run test:agents     # Python agent tests (Pytest, 101 tests)
npm run test:e2e        # E2E pipeline tests (13 tests, requires running servers)
```

### Deploy to Azure

```bash
./scripts/deploy-azure.sh --code-only   # Deploy code only
./scripts/deploy-azure.sh --with-data   # Deploy code + transfer DB data
./scripts/deploy-azure.sh --deps-only   # Restart to install new packages
```

## Key Features

- **Meeting transcript processing** — upload .md files or paste text
- **AI-powered extraction** — GPT-4o extracts requirements with speaker attribution
- **Cross-reference checks** — detects overlaps, architecture violations, prior decision conflicts
- **Interactive review** — confirm/reject stories, resolve checks, manage epics
- **Transcript highlighting** — color-coded citations linked to stories in the transcript view
- **Decision memos** — AI-generated markdown memos with confirmed/rejected/pending counts
- **Knowledge base** — pgvector semantic search across meetings, decisions, and stories
- **Role-based access** — configurable menu access per role
- **Evaluation framework** — 10 metrics (M1-M10), golden dataset, LLM-as-judge scoring
- **Audit trail** — agent traces, entity change history, pipeline execution logs

## Testing

212 automated tests with 100% file coverage:

| Layer | Tests | Coverage |
|-------|-------|----------|
| Frontend (Vitest + RTL) | 50 | 14 pages + 7 components |
| Backend (Jest) | 48 | 11 route files |
| Agents (Pytest) | 101 | 8 pipeline + 5 tools + models + API |
| E2E | 13 | Full pipeline flow |

## Security

- Helmet security headers
- Rate limiting on auth endpoints
- JWT with random secrets (required in production)
- DOMPurify on all HTML rendering
- Parameterized SQL queries throughout
- CORS restricted to specific origins
- Pipeline proxy + SSE endpoints authenticated

## Evaluation Metrics

| Metric | Target | Description |
|--------|--------|-------------|
| M1: Story Completeness | >= 85% | Extracted vs golden stories |
| M2: Story Quality | >= 4.0/5 | LLM-as-judge scoring |
| M3: Tag F1 | >= 0.15 | Feature tag precision/recall |
| M4: Epic Accuracy | >= 80% | Correct epic assignments |
| M5: Check Detection | P>=0.70, R>=0.70 | Conflict/overlap detection |
| M6: Conflict F1 | >= 0.65 | Cross-reference accuracy |
| M7: Grounding | >= 90% | Citation verification |
| M8: Calibration | Monotonic | Confidence level ordering |
| M9: Hygiene | >= 0.70 | Backlog hygiene precision |
| M10: Quality Score | Within +/-1 | Meeting quality accuracy |

## License

Internal use only — RDE Certification project.
