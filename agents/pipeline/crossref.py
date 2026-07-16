"""Agent 3: Cross-Reference — check requirements against backlog, architecture, decisions."""

from __future__ import annotations

import json
import logging
import time
from typing import Any

from openai import OpenAI
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type
import openai as openai_mod

from models.story import (
    Requirement, Check, CheckType, Confidence,
    BacklogHygieneFlag, PipelineError,
)
from tools.backlog import PgBacklogSource, BacklogItem
from tools.architecture import PgArchitectureSource, Constraint
from tools.kb import KnowledgeBase
from tools.db import execute_write

logger = logging.getLogger(__name__)

CROSSREF_SYSTEM = """You are a cross-reference analysis agent. Given a requirement, existing backlog items, architecture constraints, and prior decisions, identify:

1. **Overlap/Duplicate**: Does this requirement overlap or duplicate any existing backlog item?
   - For each match: item_id, confidence (high/medium/low), overlap description
2. **Architecture Violations**: Does this requirement violate any architecture constraint?
   - For each violation: constraint, explanation
3. **Prior Decision Contradictions**: Does this requirement contradict any prior confirmed decision?
   - For each contradiction: decision reference, explanation
4. **Dependencies**: Does this requirement depend on other new requirements or existing backlog items?
   - For each dependency: target item, dependency type (blocks/requires/related)
5. **NFR Validation**: If this is an NFR, is it feasible given architecture constraints?
6. **Backlog Hygiene**: Are any existing backlog items potentially obsolete given this new requirement?
   - For each: item_id, reason

Output JSON:
{
  "checks": [
    {
      "check_type": "overlap|duplicate|architecture|prior_decision|dependency|nfr_violation|ambiguity",
      "details": "description of the issue",
      "confidence": "high|medium|low",
      "proposed_resolution": "suggested resolution",
      "routed_to": "PM|Architect|Dev Lead",
      "related_item_id": "ERIS-xxx or null"
    }
  ],
  "hygiene_flags": [
    {
      "external_item_id": "ERIS-xxx",
      "flag_type": "potentially_obsolete",
      "reason": "why this item may be obsolete"
    }
  ]
}

If no issues found, return {"checks": [], "hygiene_flags": []}.
Return ONLY valid JSON.
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
def _call_crossref_llm(
    requirement: Requirement,
    backlog_items: list[BacklogItem],
    constraints: list[Constraint],
    context_items: list[dict],
) -> dict:
    """Call GPT-4o to perform cross-reference analysis."""
    backlog_text = "\n".join(
        f"- [{b.id}] ({b.type}, {b.status}) {b.title}: {(b.description or '')[:200]}"
        for b in backlog_items[:30]  # limit to avoid token overflow
    )

    constraints_text = "\n".join(
        f"- [{c.component}] {c.description}"
        for c in constraints[:20]
    )

    context_text = "\n".join(
        f"- ({item.get('type', 'unknown')}): {item.get('text', '')[:200]}"
        for item in context_items[:15]
    )

    user_content = f"""Requirement:
Description: {requirement.description}
Type: {requirement.type.value}
Source citation: "{requirement.source_citation}"
Confidence: {requirement.confidence.value}

Existing Backlog Items:
{backlog_text or '(none)'}

Architecture Constraints:
{constraints_text or '(none)'}

Prior Context (decisions, feedback, related meetings):
{context_text or '(none)'}
"""

    resp = _get_client().chat.completions.create(
        model="gpt-5.4-mini",
        messages=[
            {"role": "system", "content": CROSSREF_SYSTEM},
            {"role": "user", "content": user_content},
        ],
        temperature=0.1,
        response_format={"type": "json_object"},
    )
    content = resp.choices[0].message.content or "{}"
    usage = resp.usage
    return {
        "content": content,
        "prompt_tokens": usage.prompt_tokens if usage else 0,
        "completion_tokens": usage.completion_tokens if usage else 0,
    }


async def crossref_agent(state: dict, config: dict | None = None) -> dict:
    """
    Agent 3: Cross-Reference node for LangGraph.

    Checks each requirement against backlog, architecture, and decisions.
    """
    # config handled by LangGraph
    
    
    meeting_id = state["meeting_id"]
    requirements: list[Requirement] = state.get("requirements", [])
    context: dict[str, list] = state.get("context", {})
    errors: list[PipelineError] = list(state.get("errors", []))

    try:
        from tools.progress import update_progress
        update_progress(meeting_id, "crossref", "running", f"Cross-referencing {len(requirements)} requirements...")
    except Exception as e:
        logger.debug("Non-critical error: %s", e)

    start = time.time()
    total_prompt = 0
    total_completion = 0
    all_checks: list[Check] = []
    all_hygiene: list[BacklogHygieneFlag] = []

    # Load backlog and architecture once
    backlog = PgBacklogSource()
    arch = PgArchitectureSource()

    try:
        backlog_items = backlog.get_all_items()
    except Exception as e:
        logger.warning("Failed to load backlog: %s", e)
        backlog_items = []

    try:
        constraints = arch.get_constraints()
    except Exception as e:
        logger.warning("Failed to load constraints: %s", e)
        constraints = []

    for req in requirements:
        req_key = req.id or req.description[:50]
        req_context = context.get(req_key, [])

        try:
            llm_result = _call_crossref_llm(req, backlog_items, constraints, req_context)
            total_prompt += llm_result["prompt_tokens"]
            total_completion += llm_result["completion_tokens"]

            data = json.loads(llm_result["content"])

            # Parse checks
            for c in data.get("checks", []):
                try:
                    all_checks.append(Check(
                        story_title=req.description[:100],
                        check_type=CheckType(c.get("check_type", "ambiguity")),
                        details=c.get("details", ""),
                        confidence=Confidence(c.get("confidence", "medium")),
                        proposed_resolution=c.get("proposed_resolution"),
                        routed_to=c.get("routed_to"),
                        related_item_id=c.get("related_item_id"),
                    ))
                except Exception as pe:
                    logger.warning("Failed to parse check: %s", pe)

            # Parse hygiene flags
            for h in data.get("hygiene_flags", []):
                all_hygiene.append(BacklogHygieneFlag(
                    external_item_id=h.get("external_item_id", ""),
                    flag_type=h.get("flag_type", "potentially_obsolete"),
                    reason=h.get("reason", ""),
                    source_citation=req.source_citation,
                ))

        except Exception as e:
            logger.exception("Cross-reference failed for %s", req_key)
            errors.append(PipelineError(
                agent="crossref",
                error_type=type(e).__name__,
                message=f"Cross-ref failed for {req_key}: {e}",
                recoverable=True,
            ))

    # Store hygiene flags in DB
    for flag in all_hygiene:
        try:
            execute_write(
                """
                INSERT INTO backlog_hygiene_flags
                    (meeting_id, external_item_id, flag_type, reason, source_citation)
                VALUES (%s, %s, %s, %s, %s)
                """,
                (meeting_id, flag.external_item_id, flag.flag_type,
                 flag.reason, flag.source_citation),
            )
        except Exception as e:
            logger.warning("Failed to store hygiene flag: %s", e)

    duration_ms = int((time.time() - start) * 1000)

    # Write agent trace
    try:
        execute_write(
            """
            INSERT INTO agent_traces
                (meeting_id, agent_name, input_summary, output_summary,
                 llm_model, llm_prompt_tokens, llm_completion_tokens, duration_ms, errors)
            VALUES (%s, 'crossref', %s, %s, 'gpt-4o', %s, %s, %s, %s)
            """,
            (
                meeting_id,
                json.dumps({
                    "requirement_count": len(requirements),
                    "backlog_count": len(backlog_items),
                    "constraint_count": len(constraints),
                }),
                json.dumps({
                    "check_count": len(all_checks),
                    "hygiene_flag_count": len(all_hygiene),
                }),
                total_prompt,
                total_completion,
                duration_ms,
                json.dumps([e.model_dump() for e in errors if e.agent == "crossref"]),
            ),
        )
    except Exception as te:
        logger.warning("Failed to write agent trace: %s", te)

    try:
        from tools.progress import update_progress
        update_progress(meeting_id, "crossref", "done", f"Found {len(all_checks)} checks, {len(all_hygiene)} hygiene flags")
    except Exception as e:
        logger.debug("Non-critical error: %s", e)

    return {
        "checks": all_checks,
        "errors": errors,
    }
