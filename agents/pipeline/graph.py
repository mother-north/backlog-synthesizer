"""LangGraph StateGraph definition for the Backlog Synthesizer pipeline."""

from __future__ import annotations

import logging
from typing import Any, Literal

from langgraph.graph import StateGraph, END
from langgraph.checkpoint.postgres import PostgresSaver

from pipeline.state import PipelineState
from pipeline.parser import parser_agent
from pipeline.retriever import retriever_agent
from pipeline.crossref import crossref_agent
from pipeline.synthesizer import synthesizer_agent
from pipeline.validator import validator_agent
from pipeline.memo import memo_agent
from tools.db import get_dsn_string

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Human-review node (pauses the graph via interrupt)
# ---------------------------------------------------------------------------

async def human_review_node(state: dict, config: dict | None = None) -> dict:
    """
    Human review checkpoint.

    This node acts as a pause point. The pipeline checkpoints here and waits
    for the user to submit review decisions via the API. The API then resumes
    the pipeline with updated state.
    """
    config = config or {}
    configurable = config.get("configurable", {})
    progress_cb = configurable.get("progress_callback")

    if progress_cb:
        progress_cb({
            "agent": "human_review",
            "status": "waiting",
            "message": "Awaiting human review decisions...",
        })

    # State passes through — decisions come from the resume call
    return {}


# ---------------------------------------------------------------------------
# Conditional routing after human review
# ---------------------------------------------------------------------------

def route_after_review(state: dict) -> Literal["recheck", "memo", "wait"]:
    """
    Route after human review:
    - recheck: if any story was modified, re-run crossref -> synthesizer -> validator
    - memo: if user requested memo generation (all decisions made or on demand)
    - wait: still pending review
    """
    review_decisions = state.get("review_decisions", [])

    if not review_decisions:
        return "wait"

    # Check if any modification requires re-check
    has_modifications = any(d.decision == "modified" for d in review_decisions)
    if has_modifications:
        return "recheck"

    # Check if memo was requested (indicated by any decision being present)
    has_decisions = len(review_decisions) > 0
    if has_decisions:
        return "memo"

    return "wait"


# ---------------------------------------------------------------------------
# Graph construction
# ---------------------------------------------------------------------------

def build_graph() -> StateGraph:
    """Build the LangGraph StateGraph with all nodes and edges."""
    graph = StateGraph(PipelineState)

    # Register nodes
    graph.add_node("parser", parser_agent)
    graph.add_node("retriever", retriever_agent)
    graph.add_node("crossref", crossref_agent)
    graph.add_node("synthesizer", synthesizer_agent)
    graph.add_node("validator", validator_agent)
    graph.add_node("human_review", human_review_node)
    graph.add_node("memo", memo_agent)

    # Linear edges: parser -> retriever -> crossref -> synthesizer -> validator -> human_review
    graph.add_edge("parser", "retriever")
    graph.add_edge("retriever", "crossref")
    graph.add_edge("crossref", "synthesizer")
    graph.add_edge("synthesizer", "validator")
    graph.add_edge("validator", "human_review")

    # Conditional edges from human_review
    graph.add_conditional_edges(
        "human_review",
        route_after_review,
        {
            "recheck": "crossref",   # story edited -> re-run checks
            "memo": "memo",          # all done -> generate memo
            "wait": "human_review",  # still pending
        },
    )

    # Memo -> END
    graph.add_edge("memo", END)

    # Entry point
    graph.set_entry_point("parser")

    return graph


def compile_graph(checkpointer=None):
    """Compile the graph with an optional checkpointer."""
    graph = build_graph()
    return graph.compile(checkpointer=checkpointer)


def get_checkpointer():
    """
    Create a PostgresSaver checkpointer using the same PG database.
    Call .setup() on first use to create the checkpoint tables.
    """
    dsn = get_dsn_string()
    checkpointer = PostgresSaver.from_conn_string(dsn)
    return checkpointer
