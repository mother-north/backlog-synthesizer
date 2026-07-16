"""Agent 2: Context Retrieval — search KB for relevant context per requirement."""

from __future__ import annotations

import json
import logging
import time
from typing import Any

from openai import OpenAI
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type
import openai as openai_mod

from models.story import Requirement, AmbiguityFlag, PipelineError
from tools.kb import KnowledgeBase
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
        response_format={"type": "json_object"},
    )
    content = resp.choices[0].message.content or "{}"
    usage = resp.usage
    data = json.loads(content)
    filtered_indices = set()
    for entry in data.get("filtered", []):
        if entry.get("relevant"):
            filtered_indices.add(entry.get("index"))

    relevant = [item for i, item in enumerate(items) if i in filtered_indices]
    return relevant


async def retriever_agent(state: dict, config: dict | None = None) -> dict:
    """
    Agent 2: Context Retrieval node for LangGraph.

    For each requirement, searches KB for similar content, backlog items,
    architecture sections, and prior decisions. LLM filters for relevance.
    """
    # config handled by LangGraph
    
    
    meeting_id = state["meeting_id"]
    requirements: list[Requirement] = state.get("requirements", [])
    errors: list[PipelineError] = list(state.get("errors", []))

    try:
        from tools.progress import update_progress
        update_progress(meeting_id, "retriever", "running", f"Searching knowledge base for {len(requirements)} requirements...")
    except Exception as e:
        logger.debug("Non-critical error: %s", e)

    start = time.time()
    total_prompt_tokens = 0
    total_completion_tokens = 0
    context: dict[str, list] = {}

    kb = KnowledgeBase()
    backlog = PgBacklogSource()
    arch = PgArchitectureSource()

    # Pre-load architecture sections once
    try:
        arch_sections = arch.get_sections()
    except Exception as e:
        logger.warning("Failed to load architecture sections: %s", e)
        arch_sections = []

    for req in requirements:
        req_key = req.id or req.description[:50]
        req_items: list[dict] = []

        try:
            # 1. Semantic search in KB embeddings
            try:
                kb_results = kb.search_similar(
                    req.description,
                    content_types=["meeting_summary", "decision", "story", "architecture"],
                    limit=8,
                )
                for r in kb_results:
                    req_items.append({
                        "type": r.content_type,
                        "text": r.content_text,
                        "similarity": r.similarity,
                        "metadata": r.metadata,
                    })
            except Exception as e:
                logger.warning("KB search failed for %s: %s", req_key, e)
                errors.append(PipelineError(
                    agent="retriever",
                    error_type="kb_search_failed",
                    message=f"KB search failed for {req_key}: {e}",
                    recoverable=True,
                ))

            # 2. Search backlog items
            try:
                backlog_matches = backlog.search(req.description, limit=5)
                for b in backlog_matches:
                    req_items.append({
                        "type": "backlog_item",
                        "text": f"[{b.id}] {b.title}: {b.description or ''}",
                        "item_id": b.id,
                        "status": b.status,
                        "epic_id": b.epic_id,
                    })
            except Exception as e:
                logger.warning("Backlog search failed for %s: %s", req_key, e)

            # 3. Architecture sections — keyword match
            for section in arch_sections:
                desc_lower = req.description.lower()
                if any(comp in desc_lower for comp in section.components) or \
                   any(word in section.content.lower() for word in desc_lower.split()[:5]):
                    req_items.append({
                        "type": "architecture",
                        "text": f"[{section.title}]: {section.content[:500]}",
                        "section_title": section.title,
                        "components": section.components,
                    })

            # 4. Search prior feedback for similar stories
            try:
                feedback = kb.search_feedback(req.description, req.type.value)
                for fb in feedback:
                    req_items.append({
                        "type": "prior_feedback",
                        "text": f"Prior {fb.decision_type}: {fb.original_story_title} — {fb.rationale}",
                        "decision_type": fb.decision_type,
                        "similarity": fb.similarity,
                    })
            except Exception as e:
                logger.warning("Feedback search failed for %s: %s", req_key, e)

            # 5. LLM relevance filter
            if req_items:
                try:
                    relevant_items = _filter_relevance(req.description, req_items)
                except Exception as e:
                    logger.warning("Relevance filter failed, keeping all items: %s", e)
                    relevant_items = req_items
            else:
                relevant_items = []

            # 6. Check for missing context (ambiguity detection)
            prior_ref_phrases = [
                "as we discussed", "we agreed", "last time", "previous meeting",
                "we decided", "remember when", "the plan was",
            ]
            desc_lower = req.description.lower()
            citation_lower = req.source_citation.lower()
            references_prior = any(
                phrase in desc_lower or phrase in citation_lower
                for phrase in prior_ref_phrases
            )
            if references_prior and not any(
                item.get("type") in ("meeting_summary", "decision", "prior_feedback")
                for item in relevant_items
            ):
                req.ambiguity_flags.append(AmbiguityFlag(
                    description="References prior context but nothing found in KB",
                    question="What prior discussion or decision is being referenced?",
                    severity="high",
                ))

            context[req_key] = relevant_items

        except Exception as e:
            logger.exception("Retriever failed for requirement %s", req_key)
            context[req_key] = []
            errors.append(PipelineError(
                agent="retriever",
                error_type=type(e).__name__,
                message=f"Failed to retrieve context for {req_key}: {e}",
                recoverable=True,
            ))

    duration_ms = int((time.time() - start) * 1000)

    # Write agent trace
    try:
        execute_write(
            """
            INSERT INTO agent_traces
                (meeting_id, agent_name, input_summary, output_summary,
                 llm_model, llm_prompt_tokens, llm_completion_tokens, duration_ms, errors)
            VALUES (%s, 'retriever', %s, %s, 'gpt-4o', %s, %s, %s, %s)
            """,
            (
                meeting_id,
                json.dumps({"requirement_count": len(requirements)}),
                json.dumps({
                    "context_keys": len(context),
                    "total_items": sum(len(v) for v in context.values()),
                }),
                total_prompt_tokens,
                total_completion_tokens,
                duration_ms,
                json.dumps([e.model_dump() for e in errors if e.agent == "retriever"]),
            ),
        )
    except Exception as te:
        logger.warning("Failed to write agent trace: %s", te)

        total_items = sum(len(v) for v in context.values())
        try:
            from tools.progress import update_progress
            update_progress(meeting_id, "retriever", "done", f"Retrieved {total_items} context items for {len(requirements)} requirements")
        except Exception as e:
            logger.debug("Non-critical: %s", e)

    return {
        "context": context,
        "requirements": requirements,  # may have new ambiguity flags
        "errors": errors,
    }
