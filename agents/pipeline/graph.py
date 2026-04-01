"""LangGraph StateGraph definition for the Backlog Synthesizer pipeline."""

from __future__ import annotations

import logging
from typing import Literal

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
# Entry routing — determines which flow to execute
# ---------------------------------------------------------------------------

def route_entry(state: dict) -> Literal["parser", "crossref", "memo"]:
    """
    Route based on current state:
    - First run (no stories): start with parser
    - Resume with edits: start with crossref (re-check)
    - Resume for memo: generate memo
    """
    review_decisions = state.get("review_decisions", [])

    if not review_decisions:
        # First run or no decisions yet
        return "parser"

    # Check if any modification requires re-check
    has_modifications = any(
        d.get("decision", "") == "modified" if isinstance(d, dict) else getattr(d, "decision", "") == "modified"
        for d in review_decisions
    )
    if has_modifications:
        return "crossref"

    # Otherwise generate memo
    return "memo"


# ---------------------------------------------------------------------------
# Graph construction
# ---------------------------------------------------------------------------

def build_graph() -> StateGraph:
    """
    Build the LangGraph StateGraph.

    Two execution modes:
    1. Initial run: parser → retriever → crossref → synthesizer → validator → END
       (pipeline stops, human reviews in UI, then resumes via /resume endpoint)
    2. Resume: crossref → synthesizer → validator → END (for edits)
       or: memo → END (for memo generation)
    """
    graph = StateGraph(PipelineState)

    # Register nodes
    graph.add_node("parser", parser_agent)
    graph.add_node("retriever", retriever_agent)
    graph.add_node("crossref", crossref_agent)
    graph.add_node("synthesizer", synthesizer_agent)
    graph.add_node("validator", validator_agent)
    graph.add_node("memo", memo_agent)

    # Linear edges: parser → retriever → crossref → synthesizer → validator → END
    graph.add_edge("parser", "retriever")
    graph.add_edge("retriever", "crossref")
    graph.add_edge("crossref", "synthesizer")
    graph.add_edge("synthesizer", "validator")
    graph.add_edge("validator", END)

    # Memo → END
    graph.add_edge("memo", END)

    # Entry routing based on state
    graph.set_conditional_entry_point(
        route_entry,
        {
            "parser": "parser",       # First run
            "crossref": "crossref",   # Re-check after edit
            "memo": "memo",           # Generate memo
        },
    )

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
