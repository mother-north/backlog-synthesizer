"""FastAPI application — serves the agent pipeline to the Express backend."""

from __future__ import annotations

import asyncio
import json
import logging
import os
import sys
import uuid
from typing import Any, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sse_starlette.sse import EventSourceResponse

load_dotenv()

# ---------------------------------------------------------------------------
# Ensure the agents directory is on sys.path so relative imports work
# ---------------------------------------------------------------------------
_AGENTS_DIR = os.path.dirname(os.path.abspath(__file__))
if _AGENTS_DIR not in sys.path:
    sys.path.insert(0, _AGENTS_DIR)

from pipeline.graph import compile_graph, get_checkpointer
from pipeline.state import PipelineState
from models.story import ReviewDecision, PipelineError
from models.memo import DecisionMemo
from tools.kb import KnowledgeBase
from tools.db import close_pool, execute_write

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
logger = logging.getLogger("agents")

# ---------------------------------------------------------------------------
# App globals
# ---------------------------------------------------------------------------
app = FastAPI(title="Backlog Synthesizer — Agent Pipeline", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory progress event queues per meeting (meeting_id -> asyncio.Queue)
_progress_queues: dict[int, asyncio.Queue] = {}

# Compiled graph (lazy init)
_compiled_graph = None
_checkpointer = None


def _get_graph():
    global _compiled_graph, _checkpointer
    if _compiled_graph is None:
        try:
            _checkpointer = get_checkpointer()
            _checkpointer.setup()
        except Exception as e:
            logger.warning("Failed to setup PostgresSaver checkpointer: %s — running without checkpointing", e)
            _checkpointer = None
        _compiled_graph = compile_graph(checkpointer=_checkpointer)
    return _compiled_graph


# ---------------------------------------------------------------------------
# Progress callback factory
# ---------------------------------------------------------------------------

_AGENT_ORDER = ["parser", "retriever", "crossref", "synthesizer", "validator"]

def _make_progress_callback(meeting_id: int):
    """Return a callback that pushes progress events and updates DB progress."""
    # Track state per agent
    progress_state: dict[str, dict] = {
        agent: {"agent": agent, "status": "pending", "message": ""}
        for agent in _AGENT_ORDER
    }

    def callback(event: dict):
        agent = event.get("agent", "")
        if agent in progress_state:
            progress_state[agent] = event

        # Push to SSE queue
        q = _progress_queues.get(meeting_id)
        if q is not None:
            try:
                q.put_nowait(event)
            except asyncio.QueueFull:
                pass

        # Write full progress array to DB
        try:
            progress_array = [progress_state[a] for a in _AGENT_ORDER]
            execute_write(
                "UPDATE meetings SET pipeline_progress = %s::jsonb WHERE id = %s",
                (json.dumps(progress_array), meeting_id),
            )
        except Exception as e:
            logger.debug("Progress DB write failed: %s", e)

    return callback


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------

class RunPipelineResponse(BaseModel):
    meeting_id: int
    status: str
    message: str


class ResumeRequest(BaseModel):
    review_decisions: list[dict] = Field(default_factory=list)


class KBSearchRequest(BaseModel):
    query: str
    content_types: Optional[list[str]] = None
    limit: int = 10


class KBSearchResult(BaseModel):
    content_type: str
    content_text: str
    similarity: float
    metadata: dict = Field(default_factory=dict)


class MemoRequest(BaseModel):
    review_decisions: list[dict] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "backlog-synthesizer-agents"}


@app.post("/pipeline/run/{meeting_id}", response_model=RunPipelineResponse)
async def run_pipeline(meeting_id: int):
    """Start the full pipeline for a meeting."""
    graph = _get_graph()

    # Create progress queue
    _progress_queues[meeting_id] = asyncio.Queue(maxsize=100)

    # Build initial state
    initial_state: dict[str, Any] = {
        "meeting_id": meeting_id,
        "transcript": "",
        "requirements": [],
        "context": {},
        "checks": [],
        "candidate_stories": [],
        "epic_proposals": [],
        "meeting_quality": None,
        "validation_results": [],
        "review_decisions": [],
        "memo": None,
        "errors": [],
    }

    thread_id = f"meeting_{meeting_id}"
    config = {
        "configurable": {
            "thread_id": thread_id,
            "progress_callback": _make_progress_callback(meeting_id),
        }
    }

    # Update meeting status
    try:
        execute_write(
            "UPDATE meetings SET status = 'processing', pipeline_progress = '[]'::jsonb WHERE id = %s",
            (meeting_id,),
        )
    except Exception:
        pass

    # Run pipeline in background
    async def _run():
        try:
            result = await graph.ainvoke(initial_state, config)
            logger.info("Pipeline completed for meeting %s", meeting_id)
        except Exception as e:
            logger.exception("Pipeline failed for meeting %s", meeting_id)
            cb = _make_progress_callback(meeting_id)
            cb({"agent": "pipeline", "status": "error", "message": str(e)})
        finally:
            # Signal end of progress
            q = _progress_queues.get(meeting_id)
            if q:
                await q.put({"agent": "pipeline", "status": "complete", "message": "Pipeline finished"})

    asyncio.create_task(_run())

    return RunPipelineResponse(
        meeting_id=meeting_id,
        status="started",
        message="Pipeline started. Connect to SSE endpoint for progress.",
    )


@app.get("/pipeline/{meeting_id}/progress")
async def pipeline_progress(meeting_id: int, request: Request):
    """SSE endpoint streaming progress events for a meeting's pipeline."""

    async def event_generator():
        # Create queue if not exists (e.g. on reconnection)
        if meeting_id not in _progress_queues:
            _progress_queues[meeting_id] = asyncio.Queue(maxsize=100)

        q = _progress_queues[meeting_id]

        while True:
            if await request.is_disconnected():
                break
            try:
                event = await asyncio.wait_for(q.get(), timeout=30.0)
                yield {
                    "event": "progress",
                    "data": json.dumps(event),
                }
                if event.get("status") in ("complete", "error"):
                    break
            except asyncio.TimeoutError:
                # Send keepalive
                yield {"event": "ping", "data": "keepalive"}

    return EventSourceResponse(event_generator())


@app.post("/pipeline/{meeting_id}/resume")
async def resume_pipeline(meeting_id: int, body: ResumeRequest):
    """Resume the pipeline after human review with review decisions."""
    graph = _get_graph()
    thread_id = f"meeting_{meeting_id}"

    # Parse review decisions
    decisions = []
    for d in body.review_decisions:
        try:
            decisions.append(ReviewDecision(**d))
        except Exception as e:
            logger.warning("Invalid review decision: %s", e)

    if not decisions:
        raise HTTPException(status_code=400, detail="No valid review decisions provided")

    # Create progress queue
    _progress_queues[meeting_id] = asyncio.Queue(maxsize=100)

    config = {
        "configurable": {
            "thread_id": thread_id,
            "progress_callback": _make_progress_callback(meeting_id),
        }
    }

    # Update state with review decisions
    state_update = {"review_decisions": decisions}

    async def _resume():
        try:
            result = await graph.ainvoke(state_update, config)
            logger.info("Pipeline resumed and completed for meeting %s", meeting_id)
        except Exception as e:
            logger.exception("Pipeline resume failed for meeting %s", meeting_id)
            cb = _make_progress_callback(meeting_id)
            cb({"agent": "pipeline", "status": "error", "message": str(e)})
        finally:
            q = _progress_queues.get(meeting_id)
            if q:
                await q.put({"agent": "pipeline", "status": "complete", "message": "Pipeline finished"})

    asyncio.create_task(_resume())

    return {"meeting_id": meeting_id, "status": "resumed", "decisions_count": len(decisions)}


@app.post("/pipeline/{meeting_id}/memo")
async def generate_memo(meeting_id: int, body: MemoRequest):
    """Generate a decision memo on demand."""
    from pipeline.memo import memo_agent

    # Parse review decisions
    decisions = []
    for d in body.review_decisions:
        try:
            decisions.append(ReviewDecision(**d))
        except Exception:
            pass

    # Build a minimal state for memo generation
    # Retrieve current stories from DB
    from tools.db import execute_query
    stories_rows = execute_query(
        "SELECT * FROM stories WHERE meeting_id = %s", (meeting_id,)
    )

    from models.story import CandidateStory, RequirementType, Confidence, GroundingStatus
    candidate_stories = []
    for r in stories_rows:
        try:
            candidate_stories.append(CandidateStory(
                id=r["id"],
                title=r["title"],
                description=r.get("description", ""),
                type=RequirementType(r.get("type", "feature")),
                acceptance_criteria=r.get("acceptance_criteria") or [],
                feature_tags=r.get("feature_tags") or [],
                confidence=Confidence(r.get("confidence", "medium")),
                source_citation=r.get("source_citation", ""),
                epic_id=r.get("epic_id"),
                grounding_status=GroundingStatus(r["grounding_status"]) if r.get("grounding_status") else None,
            ))
        except Exception:
            pass

    state: dict[str, Any] = {
        "meeting_id": meeting_id,
        "candidate_stories": candidate_stories,
        "review_decisions": decisions,
        "epic_proposals": [],
        "meeting_quality": None,
        "errors": [],
    }

    result = await memo_agent(state)
    memo = result.get("memo")

    return {
        "meeting_id": meeting_id,
        "memo": memo.model_dump() if memo else None,
        "errors": [e.model_dump() for e in result.get("errors", [])],
    }


@app.post("/kb/search")
async def kb_search(body: KBSearchRequest):
    """Vector search the knowledge base."""
    kb = KnowledgeBase()
    try:
        results = kb.search_similar(
            query=body.query,
            content_types=body.content_types,
            limit=body.limit,
        )
        return {
            "results": [
                KBSearchResult(
                    content_type=r.content_type,
                    content_text=r.content_text,
                    similarity=r.similarity,
                    metadata=r.metadata,
                ).model_dump()
                for r in results
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ---------------------------------------------------------------------------
# Lifecycle
# ---------------------------------------------------------------------------

@app.on_event("shutdown")
async def shutdown():
    close_pool()


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("AGENTS_PORT", "8000"))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
