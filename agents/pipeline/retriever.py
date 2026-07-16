"""Agent 2: Context Retrieval — search KB for relevant context per requirement."""

from __future__ import annotations

import asyncio
import json
import logging
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Any

from openai import OpenAI
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type
import openai as openai_mod

from models.story import Requirement, AmbiguityFlag, PipelineError
from tools.kb import KnowledgeBase, embed_texts_batch
from tools.backlog import PgBacklogSource
from tools.architecture import PgArchitectureSource
from tools.db import execute_write

logger = logging.getLogger(__name__)

RELEVANCE_FILTER_SYSTEM = """You are a relevance filter. Given a requirement and a list of retrieved context items, return only the items that are genuinely relevant to the requirement.

For each item, output:
- "relevant": true/false
- "reason": brief explanation

Output JSON: {"filtered": [{"index": N, "relevant": true/false, "reason": "..."}]}
"""

_client: OpenAI | None = None


def _get_client() -> OpenAI:
    global _client
    if _client is None:
        _client = OpenAI()
    return _client


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=30),
    retry=retry_if_exception_type((openai_mod.RateLimitError, openai_mod.APITimeoutError)),
)
def _filter_relevance(requirement_text: str, items: list[dict]) -> list[dict]:
    """LLM filters retrieved items for relevance."""
    if not items:
        return []

    items_text = "\n".join(
        f"[{i}] ({item.get('type', 'unknown')}): {item.get('text', '')[:300]}"
        for i, item in enumerate(items)
    )

    resp = _get_client().chat.completions.create(
        model="gpt-5.4-mini",
        messages=[
            {"role": "system", "content": RELEVANCE_FILTER_SYSTEM},
            {
                "role": "user",
                "content": (
                    f"Requirement: {requirement_text}\n\n"
                    f"Retrieved items:\n{items_text}"
                ),
            },
        ],
        temperature=0.0,
        max_completion_tokens=4096,
        response_format={"type": "json_object"},
    )
    content = resp.choices[0].message.content or "{}"
    data = json.loads(content)
    filtered_indices = set()
    for entry in data.get("filtered", []):
        if entry.get("relevant"):
            filtered_indices.add(entry.get("index"))

    return [item for i, item in enumerate(items) if i in filtered_indices]


def _process_requirement(
    req: Requirement,
    pre_embedding: list[float] | None,
    kb: KnowledgeBase,
    backlog: PgBacklogSource,
    arch_sections: list,
) -> tuple[list[dict], list[PipelineError]]:
    """Sync worker: search + filter for a single requirement. Runs in a thread."""
    req_key = req.id or req.description[:50]
    items: list[dict] = []
    errs: list[PipelineError] = []

    # 1. Semantic KB search (use pre-computed embedding if available)
    try:
        if pre_embedding is not None:
            kb_results = kb.search_similar_with_embedding(
                pre_embedding,
                content_types=["meeting_summary", "decision", "story", "architecture"],
                limit=8,
            )
        else:
            kb_results = kb.search_similar(
                req.description,
                content_types=["meeting_summary", "decision", "story", "architecture"],
                limit=8,
            )
        for r in kb_results:
            items.append({
                "type": r.content_type,
                "text": r.content_text,
                "similarity": r.similarity,
                "metadata": r.metadata,
            })
    except Exception as e:
        logger.warning("KB search failed for %s: %s", req_key, e)
        errs.append(PipelineError(
            agent="retriever",
            error_type="kb_search_failed",
            message=f"KB search failed for {req_key}: {e}",
            recoverable=True,
        ))

    # 2. Backlog full-text search
    try:
        for b in backlog.search(req.description, limit=5):
            items.append({
                "type": "backlog_item",
                "text": f"[{b.id}] {b.title}: {b.description or ''}",
                "item_id": b.id,
                "status": b.status,
                "epic_id": b.epic_id,
            })
    except Exception as e:
        logger.warning("Backlog search failed for %s: %s", req_key, e)

    # 3. Architecture sections — keyword match (no API call)
    desc_lower = req.description.lower()
    for section in arch_sections:
        if any(comp in desc_lower for comp in section.components) or \
           any(word in section.content.lower() for word in desc_lower.split()[:5]):
            items.append({
                "type": "architecture",
                "text": f"[{section.title}]: {section.content[:500]}",
                "section_title": section.title,
                "components": section.components,
            })

    # 4. Prior feedback (pg_trgm, no embedding)
    try:
        for fb in kb.search_feedback(req.description, req.type.value):
            items.append({
                "type": "prior_feedback",
                "text": f"Prior {fb.decision_type}: {fb.original_story_title} — {fb.rationale}",
                "decision_type": fb.decision_type,
                "similarity": fb.similarity,
            })
    except Exception as e:
        logger.warning("Feedback search failed for %s: %s", req_key, e)

    # 5. LLM relevance filter
    if items:
        try:
            items = _filter_relevance(req.description, items)
        except Exception as e:
            logger.warning("Relevance filter failed, keeping all items: %s", e)

    return items, errs


async def retriever_agent(state: dict, config: dict | None = None) -> dict:
    """
    Agent 2: Context Retrieval node for LangGraph.

    Batches all embeddings in one API call, then processes requirements
    concurrently (up to 10 at a time) to cut wall-clock time from O(N) to O(1).
    """
    meeting_id = state["meeting_id"]
    requirements: list[Requirement] = state.get("requirements", [])
    errors: list[PipelineError] = list(state.get("errors", []))

    try:
        from tools.progress import update_progress
        update_progress(meeting_id, "retriever", "running", f"Searching knowledge base for {len(requirements)} requirements...")
    except Exception as e:
        logger.debug("Non-critical error: %s", e)

    start = time.time()
    context: dict[str, list] = {}

    kb = KnowledgeBase()
    backlog = PgBacklogSource()
    arch = PgArchitectureSource()

    # Pre-load architecture sections once (shared across all requirements)
    try:
        arch_sections = arch.get_sections()
    except Exception as e:
        logger.warning("Failed to load architecture sections: %s", e)
        arch_sections = []

    if not requirements:
        embeddings: list[list[float] | None] = []
    else:
        # Batch-embed all requirement descriptions in a single API call
        try:
            embeddings = embed_texts_batch([r.description for r in requirements])
            logger.info("Batch-embedded %d requirements in one API call", len(requirements))
        except Exception as e:
            logger.warning("Batch embedding failed, falling back to per-requirement: %s", e)
            embeddings = [None] * len(requirements)

    # Process all requirements concurrently (max 10 in flight at once)
    semaphore = asyncio.Semaphore(10)
    loop = asyncio.get_event_loop()
    executor = ThreadPoolExecutor(max_workers=10)

    async def _process_one(req: Requirement, emb: list[float] | None) -> tuple[str, list, list[PipelineError]]:
        req_key = req.id or req.description[:50]
        async with semaphore:
            try:
                items, req_errs = await loop.run_in_executor(
                    executor,
                    _process_requirement,
                    req, emb, kb, backlog, arch_sections,
                )
            except Exception as e:
                logger.exception("Retriever failed for requirement %s", req_key)
                items = []
                req_errs = [PipelineError(
                    agent="retriever",
                    error_type=type(e).__name__,
                    message=f"Failed to retrieve context for {req_key}: {e}",
                    recoverable=True,
                )]

        # Ambiguity detection (references prior context but nothing found)
        prior_ref_phrases = [
            "as we discussed", "we agreed", "last time", "previous meeting",
            "we decided", "remember when", "the plan was",
        ]
        desc_lower = req.description.lower()
        citation_lower = req.source_citation.lower()
        if any(phrase in desc_lower or phrase in citation_lower for phrase in prior_ref_phrases):
            if not any(item.get("type") in ("meeting_summary", "decision", "prior_feedback") for item in items):
                req.ambiguity_flags.append(AmbiguityFlag(
                    description="References prior context but nothing found in KB",
                    question="What prior discussion or decision is being referenced?",
                    severity="high",
                ))

        return req_key, items, req_errs

    tasks = [_process_one(req, emb) for req, emb in zip(requirements, embeddings)]
    all_results = await asyncio.gather(*tasks)

    for req_key, items, req_errs in all_results:
        context[req_key] = items
        errors.extend(req_errs)

    duration_ms = int((time.time() - start) * 1000)
    total_items = sum(len(v) for v in context.values())

    try:
        execute_write(
            """
            INSERT INTO agent_traces
                (meeting_id, agent_name, input_summary, output_summary,
                 llm_model, llm_prompt_tokens, llm_completion_tokens, duration_ms, errors)
            VALUES (%s, 'retriever', %s, %s, 'gpt-5.4-mini', 0, 0, %s, %s)
            """,
            (
                meeting_id,
                json.dumps({"requirement_count": len(requirements)}),
                json.dumps({"total_items": total_items, "context_keys": len(context)}),
                duration_ms,
                json.dumps([e.model_dump() for e in errors if e.agent == "retriever"]),
            ),
        )
    except Exception as te:
        logger.warning("Failed to write agent trace: %s", te)

    try:
        from tools.progress import update_progress
        update_progress(meeting_id, "retriever", "done", f"Retrieved {total_items} context items for {len(requirements)} requirements")
    except Exception as e:
        logger.debug("Non-critical: %s", e)

    return {
        "context": context,
        "requirements": requirements,
        "errors": errors,
    }
