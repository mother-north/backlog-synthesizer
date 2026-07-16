"""Agent 5: Grounding Validation — verify stories are grounded in transcript."""

from __future__ import annotations

import json
import logging
import time
from difflib import SequenceMatcher
from typing import Any

from openai import OpenAI
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type
import openai as openai_mod

from models.story import (
    CandidateStory, ValidationResult, GroundingStatus, PipelineError,
)
from tools.transcript import TranscriptReader
from tools.db import execute_write

logger = logging.getLogger(__name__)

VALIDATOR_SYSTEM = """You are a grounding validation agent. For each candidate story, verify:

1. source_citation exists verbatim (or near-verbatim) in the transcript
2. acceptance_criteria are derivable from the cited text
3. no requirements were fabricated (not in transcript)
4. confidence level matches grounding strength

For each story, output:
- grounding_status: valid | warning | invalid
- issues: list of specific grounding problems found
- suggested_fix: how to correct the issue (or null if valid)

Output JSON:
{
  "validations": [
    {
      "story_title": "string",
      "grounding_status": "valid|warning|invalid",
      "issues": ["string"],
      "suggested_fix": "string or null"
    }
  ]
}

Return ONLY valid JSON.
"""

_client: OpenAI | None = None


def _get_client() -> OpenAI:
    global _client
    if _client is None:
        _client = OpenAI()
    return _client


def _fuzzy_find_citation(citation: str, transcript: str) -> float:
    """Find the best fuzzy match of citation within transcript, return similarity score."""
    if not citation or not transcript:
        return 0.0

    citation_clean = " ".join(citation.lower().split())
    transcript_clean = " ".join(transcript.lower().split())

    # Exact substring check first
    if citation_clean in transcript_clean:
        return 1.0

    # Sliding window fuzzy match
    citation_words = citation_clean.split()
    transcript_words = transcript_clean.split()
    window_size = len(citation_words)

    if window_size == 0 or len(transcript_words) < window_size:
        return 0.0

    best_ratio = 0.0
    # Use a step to avoid excessive computation on long transcripts
    step = max(1, len(transcript_words) // 500)
    for i in range(0, len(transcript_words) - window_size + 1, step):
        window = " ".join(transcript_words[i : i + window_size])
        ratio = SequenceMatcher(None, citation_clean, window).ratio()
        if ratio > best_ratio:
            best_ratio = ratio
            if best_ratio >= 0.95:
                break

    return best_ratio


@retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=30),
    retry=retry_if_exception_type((openai_mod.RateLimitError, openai_mod.APITimeoutError)),
)
def _call_validator_llm(stories: list[CandidateStory], transcript: str) -> dict:
    """Call GPT-4o to validate grounding."""
    stories_text = json.dumps(
        [
            {
                "title": s.title,
                "description": s.description,
                "source_citation": s.source_citation,
                "acceptance_criteria": s.acceptance_criteria,
                "confidence": s.confidence.value,
            }
            for s in stories
        ],
        indent=2,
    )

    # Truncate transcript if very long to stay within context
    max_transcript = 60000
    t = transcript[:max_transcript] if len(transcript) > max_transcript else transcript

    resp = _get_client().chat.completions.create(
        model="gpt-5.4-mini",
        messages=[
            {"role": "system", "content": VALIDATOR_SYSTEM},
            {
                "role": "user",
                "content": (
                    f"Transcript:\n{t}\n\n"
                    f"Candidate stories:\n{stories_text}"
                ),
            },
        ],
        temperature=0.0,
        response_format={"type": "json_object"},
    )
    content = resp.choices[0].message.content or "{}"
    usage = resp.usage
    return {
        "content": content,
        "prompt_tokens": usage.prompt_tokens if usage else 0,
        "completion_tokens": usage.completion_tokens if usage else 0,
    }


async def validator_agent(state: dict, config: dict | None = None) -> dict:
    """
    Agent 5: Grounding Validation node for LangGraph.

    Verifies each candidate story's citation exists in the transcript,
    acceptance criteria are derivable, and nothing is fabricated.
    """
    # config handled by LangGraph
    
    
    meeting_id = state["meeting_id"]
    candidate_stories: list[CandidateStory] = state.get("candidate_stories", [])
    transcript = state.get("transcript", "")
    errors: list[PipelineError] = list(state.get("errors", []))

    try:
        from tools.progress import update_progress
        update_progress(meeting_id, "validator", "running", f"Validating grounding for {len(candidate_stories)} stories...")
    except Exception as e:
        logger.debug("Non-critical error: %s", e)

    start = time.time()
    validation_results: list[ValidationResult] = []

    if not candidate_stories:
        try:
            from tools.progress import update_progress
            update_progress(meeting_id, "validator", "done", "No stories to validate.")
        except Exception as e:
            logger.debug("Non-critical: %s", e)
        # No stories — mark meeting as completed
        try:
            execute_write(
                "UPDATE meetings SET status = 'completed' WHERE id = %s",
                (meeting_id,),
            )
        except Exception as e:
            logger.debug("Non-critical: %s", e)
        return {"validation_results": [], "errors": errors}

    # Re-read transcript if not in state
    if not transcript:
        try:
            reader = TranscriptReader()
            result = reader.read(meeting_id)
            transcript = result.raw_text
        except Exception as e:
            logger.warning("Failed to re-read transcript: %s", e)

    # Step 1: Automated fuzzy citation check
    automated_results: dict[str, float] = {}
    for story in candidate_stories:
        sim = _fuzzy_find_citation(story.source_citation, transcript)
        automated_results[story.title] = sim

    # Step 2: LLM-based deeper validation
    try:
        llm_result = _call_validator_llm(candidate_stories, transcript)
        data = json.loads(llm_result["content"])
        llm_validations = {
            v.get("story_title", ""): v
            for v in data.get("validations", [])
        }
    except Exception as e:
        logger.warning("LLM validation failed, using automated results only: %s", e)
        llm_validations = {}
        errors.append(PipelineError(
            agent="validator",
            error_type=type(e).__name__,
            message=f"LLM validation failed: {e}",
            recoverable=True,
        ))
        llm_result = {"prompt_tokens": 0, "completion_tokens": 0}

    # Step 3: Merge results
    for story in candidate_stories:
        fuzzy_sim = automated_results.get(story.title, 0.0)
        llm_val = llm_validations.get(story.title, {})

        # Determine grounding status from both sources
        if fuzzy_sim >= 0.90:
            auto_status = GroundingStatus.valid
        elif fuzzy_sim >= 0.70:
            auto_status = GroundingStatus.warning
        else:
            auto_status = GroundingStatus.invalid

        llm_status_str = llm_val.get("grounding_status", auto_status.value)
        try:
            llm_status = GroundingStatus(llm_status_str)
        except ValueError:
            llm_status = auto_status

        # Take the worse of the two assessments
        status_order = {GroundingStatus.valid: 0, GroundingStatus.warning: 1, GroundingStatus.invalid: 2}
        final_status = max(auto_status, llm_status, key=lambda s: status_order[s])

        issues = llm_val.get("issues", [])
        if auto_status == GroundingStatus.invalid and fuzzy_sim < 0.5:
            issues.append(f"Citation not found in transcript (fuzzy similarity: {fuzzy_sim:.2f})")

        vr = ValidationResult(
            story_title=story.title,
            grounding_status=final_status,
            issues=issues,
            suggested_fix=llm_val.get("suggested_fix"),
        )
        validation_results.append(vr)

        # Update story object
        story.grounding_status = final_status
        story.grounding_issues = issues

        # Update DB
        try:
            if story.id:
                execute_write(
                    """
                    UPDATE stories
                    SET grounding_status = %s, grounding_issues = %s
                    WHERE id = %s
                    """,
                    (final_status.value, json.dumps(issues), story.id),
                )
        except Exception as ue:
            logger.warning("Failed to update story grounding: %s", ue)

    duration_ms = int((time.time() - start) * 1000)

    # Agent trace
    try:
        valid_count = sum(1 for vr in validation_results if vr.grounding_status == GroundingStatus.valid)
        warning_count = sum(1 for vr in validation_results if vr.grounding_status == GroundingStatus.warning)
        invalid_count = sum(1 for vr in validation_results if vr.grounding_status == GroundingStatus.invalid)

        execute_write(
            """
            INSERT INTO agent_traces
                (meeting_id, agent_name, input_summary, output_summary,
                 llm_model, llm_prompt_tokens, llm_completion_tokens, duration_ms, errors)
            VALUES (%s, 'validator', %s, %s, 'gpt-4o', %s, %s, %s, %s)
            """,
            (
                meeting_id,
                json.dumps({"story_count": len(candidate_stories)}),
                json.dumps({
                    "valid": valid_count,
                    "warning": warning_count,
                    "invalid": invalid_count,
                }),
                llm_result.get("prompt_tokens", 0),
                llm_result.get("completion_tokens", 0),
                duration_ms,
                json.dumps([e.model_dump() for e in errors if e.agent == "validator"]),
            ),
        )
    except Exception as te:
        logger.warning("Failed to write agent trace: %s", te)

    try:
        from tools.progress import update_progress
        update_progress(meeting_id, "validator", "done", f"Validation complete: {valid_count} valid, {warning_count} warnings, {invalid_count} invalid")
    except Exception as e:
        logger.debug("Non-critical error: %s", e)

    # Update meeting status to in_review
    try:
        execute_write(
            "UPDATE meetings SET status = 'in_review' WHERE id = %s",
            (meeting_id,),
        )
    except Exception as e:
        logger.debug("Non-critical error: %s", e)

    return {
        "candidate_stories": candidate_stories,
        "validation_results": validation_results,
        "errors": errors,
    }
