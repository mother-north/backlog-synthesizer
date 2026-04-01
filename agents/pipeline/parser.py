"""Agent 1: Parser — Extract requirements from meeting transcript."""

from __future__ import annotations

import json
import logging
import time
from typing import Any

from openai import OpenAI
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type
import openai as openai_mod

from models.story import (
    Requirement, RequirementType, Granularity, Confidence,
    PrioritySignal, AmbiguityFlag, PipelineError,
)
from tools.transcript import TranscriptReader
from tools.db import execute_write

logger = logging.getLogger(__name__)

PARSER_SYSTEM = """You are a requirements extraction agent. Extract all requirements from the meeting transcript.

For each requirement:
- Quote the exact source text as source_citation (verbatim from transcript)
- Classify type: feature | bug | improvement | tech_debt | nfr
- Classify granularity: epic | story | task. Flag items too vague or too large.
- Extract priority signals (urgency cues, deadlines, explicit priority statements)
- Flag ambiguities with specific questions
- Assign confidence: high | medium | low

IMPORTANT: Only extract what is explicitly stated or clearly implied in the transcript. Do not invent requirements.

Output a JSON array of requirement objects. Each object has these fields:
{
  "description": "string",
  "source_citation": "exact quote from transcript",
  "type": "feature | bug | improvement | tech_debt | nfr",
  "granularity": "epic | story | task",
  "priority_signals": [{"signal": "string", "urgency": "low|medium|high|critical", "deadline": "string or null"}],
  "ambiguity_flags": [{"description": "string", "question": "string", "severity": "low|medium|high"}],
  "confidence": "high | medium | low"
}

Return a JSON object with a single key "requirements" containing an array of requirement objects.
Example: {"requirements": [{...}, {...}]}
"""

client: OpenAI | None = None


def _get_client() -> OpenAI:
    global client
    if client is None:
        client = OpenAI()
    return client


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=30),
    retry=retry_if_exception_type((openai_mod.RateLimitError, openai_mod.APITimeoutError)),
)
async def _call_llm(transcript: str) -> dict:
    """Call GPT-4o to extract requirements."""
    resp = _get_client().chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": PARSER_SYSTEM},
            {"role": "user", "content": f"Meeting transcript:\n\n{transcript}"},
        ],
        temperature=0.1,
        max_tokens=4096,
        response_format={"type": "json_object"},
    )
    content = resp.choices[0].message.content or "[]"
    usage = resp.usage
    return {
        "content": content,
        "prompt_tokens": usage.prompt_tokens if usage else 0,
        "completion_tokens": usage.completion_tokens if usage else 0,
    }


def _parse_requirements(raw_json: str) -> list[Requirement]:
    """Parse LLM JSON output into Requirement objects."""
    data = json.loads(raw_json)
    # Handle both {"requirements": [...]} and bare [...]
    if isinstance(data, dict):
        data = data.get("requirements", data.get("items", []))
    if not isinstance(data, list):
        data = [data]

    requirements: list[Requirement] = []
    for i, item in enumerate(data):
        try:
            req = Requirement(
                id=f"REQ-{i+1:03d}",
                description=item.get("description", ""),
                source_citation=item.get("source_citation", ""),
                type=RequirementType(item.get("type", "feature")),
                granularity=Granularity(item.get("granularity", "story")),
                priority_signals=[
                    PrioritySignal(**ps) for ps in (item.get("priority_signals") or [])
                ],
                ambiguity_flags=[
                    AmbiguityFlag(**af) for af in (item.get("ambiguity_flags") or [])
                ],
                confidence=Confidence(item.get("confidence", "medium")),
            )
            requirements.append(req)
        except Exception as e:
            logger.warning("Failed to parse requirement %d: %s", i, e)
    return requirements


async def parser_agent(state: dict, config: dict | None = None) -> dict:
    """
    Agent 1: Parser node for LangGraph.

    Reads transcript from DB, extracts structured requirements via GPT-4o.
    """
    config = config or {}
    configurable = config.get("configurable", {})
    progress_cb = configurable.get("progress_callback")
    meeting_id = state["meeting_id"]
    errors: list[PipelineError] = list(state.get("errors", []))

    # Emit progress: running
    if progress_cb:
        progress_cb({
            "agent": "parser",
            "status": "running",
            "message": "Extracting requirements from transcript...",
        })

    start = time.time()
    prompt_tokens = 0
    completion_tokens = 0

    try:
        # Read transcript
        reader = TranscriptReader()
        result = reader.read(meeting_id)
        transcript = result.raw_text

        if result.is_empty:
            errors.append(PipelineError(
                agent="parser",
                error_type="empty_transcript",
                message=f"Transcript for meeting {meeting_id} has fewer than 10 words.",
                recoverable=False,
            ))
            if progress_cb:
                progress_cb({"agent": "parser", "status": "error", "message": "Transcript is empty or too short."})
            return {
                "transcript": transcript,
                "requirements": [],
                "errors": errors,
            }

        # Call LLM
        llm_result = await _call_llm(transcript)
        prompt_tokens = llm_result["prompt_tokens"]
        completion_tokens = llm_result["completion_tokens"]

        requirements = _parse_requirements(llm_result["content"])

    except Exception as e:
        logger.exception("Parser agent failed for meeting %s", meeting_id)
        errors.append(PipelineError(
            agent="parser",
            error_type=type(e).__name__,
            message=str(e),
            recoverable=False,
        ))
        if progress_cb:
            progress_cb({"agent": "parser", "status": "error", "message": str(e)})
        return {
            "transcript": state.get("transcript", ""),
            "requirements": [],
            "errors": errors,
        }

    duration_ms = int((time.time() - start) * 1000)

    # Write agent trace
    try:
        execute_write(
            """
            INSERT INTO agent_traces
                (meeting_id, agent_name, input_summary, output_summary,
                 llm_model, llm_prompt_tokens, llm_completion_tokens, duration_ms, errors)
            VALUES (%s, 'parser', %s, %s, 'gpt-4o', %s, %s, %s, %s)
            """,
            (
                meeting_id,
                json.dumps({"transcript_words": len(transcript.split())}),
                json.dumps({"requirement_count": len(requirements)}),
                prompt_tokens,
                completion_tokens,
                duration_ms,
                json.dumps([e.model_dump() for e in errors if e.agent == "parser"]),
            ),
        )
    except Exception as te:
        logger.warning("Failed to write agent trace: %s", te)

    # Emit progress: done
    if progress_cb:
        progress_cb({
            "agent": "parser",
            "status": "done",
            "message": f"Extracted {len(requirements)} requirements",
            "details": {"requirement_count": len(requirements)},
        })

    return {
        "transcript": transcript,
        "requirements": requirements,
        "errors": errors,
    }
