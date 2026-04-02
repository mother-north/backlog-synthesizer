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
    Requirement, RequirementType, Granularity, Confidence, Priority,
    PrioritySignal, AmbiguityFlag, PipelineError,
)
from tools.transcript import TranscriptReader
from tools.db import execute_write

logger = logging.getLogger(__name__)

PARSER_SYSTEM = """You are a requirements extraction agent. Extract ALL actionable requirements from the meeting transcript. Be THOROUGH — missing a real requirement is worse than extracting a borderline one.

WHAT TO EXTRACT:
- Bug reports and fixes ("the bug where...", "fix the issue with...")
- New feature requests ("we need...", "we should add...", "I think we need...")
- Improvements and UX suggestions ("we should show...", "it would be better if...", "the UX should...", "explain variability in...")
- Non-functional requirements (performance, security, scalability)
- Tech debt items ("we should refactor...", "we need to clean up...")
- Agreements that add a new action ("I think X is right — we should..." means extract the action after "we should")
- Anything phrased as a suggestion for change, even if embedded in a longer discussion
- Items mentioned in passing if they describe a desired system behavior that doesn't exist yet

WHAT NOT TO EXTRACT:
- Pure status updates on existing work already tracked in the backlog ("ERIS-048 is in progress") — UNLESS a new action is proposed on top
- Completed work ("we shipped X last week")
- Opinions with no actionable outcome ("I don't like how it looks" with no proposed fix)
- Meeting logistics ("let's take a break")

For each requirement:
- Quote the exact source text as source_citation (verbatim from transcript — the exact sentence(s) where the requirement is stated)
- CRITICAL — Identify the speaker who stated or proposed the requirement
- Classify type: feature | bug | improvement | tech_debt | nfr
- Classify granularity: epic | story | task
- Assign priority: critical | high | medium | low (based on urgency cues, deadlines, explicit statements, or implied importance)
- Extract priority signals (urgency cues, deadlines, explicit priority statements)
- Flag ambiguities with specific questions
- Assign confidence: high | medium | low

Output JSON:
{
  "description": "string",
  "source_citation": "exact quote from transcript",
  "speaker": "Name (Role) or Unknown",
  "type": "feature | bug | improvement | tech_debt | nfr",
  "granularity": "epic | story | task",
  "priority": "critical | high | medium | low",
  "priority_signals": [{"signal": "string", "urgency": "low|medium|high|critical", "deadline": "string or null"}],
  "ambiguity_flags": [{"description": "string", "question": "string", "severity": "low|medium|high"}],
  "confidence": "high | medium | low"
}

Return a JSON object with a single key "requirements" containing an array of requirement objects.
Example: {"requirements": [{...}, {...}]}

IMPORTANT: Err on the side of extracting more. When in doubt, extract with low confidence. Do NOT skip suggestions embedded in discussion.
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


import re


def _normalise_text(text: str) -> str:
    """Normalise text for fuzzy matching: lowercase, collapse whitespace, strip quotes/punctuation variance."""
    t = text.lower()
    # Normalise various dash/quote characters
    t = t.replace('\u2014', '-').replace('\u2013', '-').replace('\u2018', "'").replace('\u2019', "'")
    t = t.replace('\u201c', '"').replace('\u201d', '"')
    # Collapse whitespace
    t = re.sub(r'\s+', ' ', t).strip()
    return t


def _extract_speaker_from_transcript(citation: str, transcript: str) -> str:
    """Fallback: find who said the citation by searching the transcript for the speaker label."""
    if not citation or not transcript:
        return "Unknown"
    # Try progressively shorter snippets to find citation in transcript
    idx = -1
    for length in (80, 40, 25):
        snippet = citation[:length].strip()
        if not snippet:
            continue
        # Exact match first
        idx = transcript.find(snippet)
        if idx != -1:
            break
        # Case-insensitive
        lower_t = transcript.lower()
        idx = lower_t.find(snippet.lower())
        if idx != -1:
            break
        # Normalised fuzzy match
        norm_t = _normalise_text(transcript)
        norm_s = _normalise_text(snippet)
        idx = norm_t.find(norm_s)
        if idx != -1:
            # Map normalised index back to original (approximate)
            # Find nearest match in original by scanning around the same position
            search_start = max(0, idx - 50)
            search_end = min(len(transcript), idx + len(snippet) + 50)
            chunk = transcript[search_start:search_end]
            local_idx = _normalise_text(chunk).find(norm_s)
            idx = search_start + max(0, local_idx)
            break
    if idx == -1:
        return "Unknown"
    # Walk backwards from idx to find the speaker label
    before = transcript[max(0, idx - 500):idx]
    # Match patterns: **Sarah (PM):** or **Sarah:** or Sarah (PM): or Sarah:
    # The key is Name followed by optional (Role) followed by : with optional ** around it
    matches = re.findall(
        r'\*{0,2}([A-Z][a-zA-Z]+(?:\s*\([^)]+\))?)\s*:\*{0,2}',
        before,
    )
    if matches:
        return matches[-1]  # last speaker before citation
    return "Unknown"


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
                speaker=item.get("speaker", "Unknown"),
                type=RequirementType(item.get("type", "feature")),
                granularity=Granularity(item.get("granularity", "story")),
                priority=Priority(item.get("priority", "medium")),
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
    meeting_id = state["meeting_id"]
    errors: list[PipelineError] = list(state.get("errors", []))

    # Emit progress: running
    try:
        from tools.progress import update_progress
        update_progress(meeting_id, "parser", "running", "Extracting requirements from transcript...")
    except Exception:
        pass

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
            try:
                from tools.progress import update_progress
                update_progress(meeting_id, "parser", "error", "Transcript is empty or too short.")
            except Exception:
                pass
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

        # Fallback: fill in speaker from transcript if LLM missed it
        for req in requirements:
            if not req.speaker or req.speaker == "Unknown":
                req.speaker = _extract_speaker_from_transcript(req.source_citation, transcript)

    except Exception as e:
        logger.exception("Parser agent failed for meeting %s", meeting_id)
        errors.append(PipelineError(
            agent="parser",
            error_type=type(e).__name__,
            message=str(e),
            recoverable=False,
        ))
        try:
            from tools.progress import update_progress
            update_progress(meeting_id, "parser", "error", "")
        except Exception:
            pass
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
    try:
        from tools.progress import update_progress
        update_progress(meeting_id, "parser", "done", f"Extracted {len(requirements)} requirements")
    except Exception:
        pass

    return {
        "transcript": transcript,
        "requirements": requirements,
        "errors": errors,
    }
