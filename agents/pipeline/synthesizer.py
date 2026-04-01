"""Agent 4: Synthesis — generate candidate stories, map to epics, produce quality feedback."""

from __future__ import annotations

import json
import logging
import time
from typing import Any

from openai import OpenAI
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type
import openai as openai_mod

from models.story import (
    Requirement, Check, CheckType, Confidence, CandidateStory,
    EpicProposal, MeetingQuality, RoutedQuestion,
    RequirementType, Granularity, PrioritySignal, PipelineError,
    Actionability,
)
from tools.backlog import PgBacklogSource
from tools.db import execute_write

logger = logging.getLogger(__name__)

SYNTHESIS_SYSTEM = """You are a synthesis agent that generates candidate user stories from extracted requirements.

Input: requirements with context and cross-reference checks.
Your tasks:

1. **Generate candidate stories** for each requirement:
   - title, description, acceptance_criteria (testable), feature_tags, type, confidence
   - source_citation (copied from the requirement — exact transcript quote)
   - priority_signals (copied from requirement)

2. **Map to epics**:
   - Match to existing epics by feature area/component. Set epic_id to the existing epic's external_id.
   - If no existing epic fits, group related stories and propose a new epic.
     Set proposed_epic to the new epic name.
   - If a story can't map to any epic (existing or proposed), flag it.

3. **Attach checks** from cross-reference to relevant stories.

4. **Route unresolved questions** to roles: PM (priority, scope), Architect (technical), Dev Lead (backlog).

5. **Generate meeting quality feedback**:
   - total_requirements, ambiguous_count, ambiguity_ratio
   - actionability_score: high | medium | low
   - verbal_recommendation: a short human-readable summary

Output JSON:
{
  "stories": [
    {
      "title": "string",
      "description": "string",
      "type": "feature|bug|improvement|tech_debt|nfr",
      "acceptance_criteria": ["string"],
      "feature_tags": ["string"],
      "priority_signals": [{"signal": "string", "urgency": "string"}],
      "confidence": "high|medium|low",
      "source_citation": "exact quote from transcript",
      "epic_id": "ERIS-xxx or null",
      "proposed_epic": "New Epic Name or null",
      "questions": [{"question": "string", "routed_to": "PM|Architect|Dev Lead", "context": "string"}]
    }
  ],
  "epic_proposals": [
    {
      "title": "string",
      "goal": "string",
      "scope": "string",
      "justification": "why existing epics don't fit",
      "confidence": "high|medium|low",
      "story_titles": ["titles of stories under this epic"]
    }
  ],
  "meeting_quality": {
    "total_requirements": N,
    "ambiguous_count": N,
    "ambiguity_ratio": 0.0,
    "actionability_score": "high|medium|low",
    "verbal_recommendation": "string"
  }
}

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
def _call_synthesis_llm(
    requirements: list[Requirement],
    checks: list[Check],
    context: dict[str, list],
    existing_epics: list[dict],
) -> dict:
    """Call GPT-4o for synthesis."""
    req_text = json.dumps(
        [r.model_dump() for r in requirements],
        indent=2,
        default=str,
    )
    checks_text = json.dumps(
        [c.model_dump() for c in checks],
        indent=2,
        default=str,
    )
    epics_text = json.dumps(existing_epics, indent=2) if existing_epics else "(none)"

    # Summarise context
    context_summary_parts = []
    for key, items in context.items():
        if items:
            item_strs = [f"  - ({it.get('type','')}): {it.get('text','')[:150]}" for it in items[:5]]
            context_summary_parts.append(f"[{key}]:\n" + "\n".join(item_strs))
    context_text = "\n".join(context_summary_parts) if context_summary_parts else "(none)"

    user_content = f"""Requirements:
{req_text}

Cross-Reference Checks:
{checks_text}

Context from KB:
{context_text}

Existing Epics:
{epics_text}
"""

    resp = _get_client().chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": SYNTHESIS_SYSTEM},
            {"role": "user", "content": user_content},
        ],
        temperature=0.2,
        response_format={"type": "json_object"},
    )
    content = resp.choices[0].message.content or "{}"
    usage = resp.usage
    return {
        "content": content,
        "prompt_tokens": usage.prompt_tokens if usage else 0,
        "completion_tokens": usage.completion_tokens if usage else 0,
    }


def _parse_stories(data: dict, checks: list[Check]) -> list[CandidateStory]:
    """Parse LLM output into CandidateStory objects and attach checks."""
    stories: list[CandidateStory] = []
    for s in data.get("stories", []):
        try:
            story = CandidateStory(
                title=s.get("title", "Untitled"),
                description=s.get("description", ""),
                type=RequirementType(s.get("type", "feature")),
                acceptance_criteria=s.get("acceptance_criteria", []),
                feature_tags=s.get("feature_tags", []),
                priority_signals=[
                    PrioritySignal(**ps) for ps in (s.get("priority_signals") or [])
                ],
                confidence=Confidence(s.get("confidence", "medium")),
                source_citation=s.get("source_citation", ""),
                epic_id=s.get("epic_id"),
                proposed_epic=s.get("proposed_epic"),
                questions=[
                    RoutedQuestion(**q) for q in (s.get("questions") or [])
                ],
            )

            # Attach relevant checks
            story_checks = [
                c for c in checks
                if c.story_title.lower() in story.title.lower()
                or story.title.lower() in c.story_title.lower()
            ]
            story.checks = story_checks

            # Auto-create "No Epic" check if unmapped
            if not story.epic_id and not story.proposed_epic:
                story.checks.append(Check(
                    story_title=story.title,
                    check_type=CheckType.no_epic,
                    details="Story could not be mapped to any existing or proposed epic.",
                    confidence=Confidence.high,
                    proposed_resolution="Assign to an existing epic or approve a new epic proposal.",
                    routed_to="PM",
                ))

            stories.append(story)
        except Exception as e:
            logger.warning("Failed to parse story: %s", e)
    return stories


def _parse_epic_proposals(data: dict) -> list[EpicProposal]:
    """Parse epic proposals from LLM output."""
    proposals: list[EpicProposal] = []
    for ep in data.get("epic_proposals", []):
        try:
            proposals.append(EpicProposal(
                title=ep.get("title", ""),
                goal=ep.get("goal", ""),
                scope=ep.get("scope", ""),
                justification=ep.get("justification", ""),
                confidence=Confidence(ep.get("confidence", "medium")),
                story_titles=ep.get("story_titles", []),
            ))
        except Exception as e:
            logger.warning("Failed to parse epic proposal: %s", e)
    return proposals


def _parse_meeting_quality(data: dict) -> MeetingQuality:
    """Parse meeting quality from LLM output."""
    mq = data.get("meeting_quality", {})
    return MeetingQuality(
        total_requirements=mq.get("total_requirements", 0),
        ambiguous_count=mq.get("ambiguous_count", 0),
        ambiguity_ratio=mq.get("ambiguity_ratio", 0.0),
        actionability_score=Actionability(mq.get("actionability_score", "medium")),
        verbal_recommendation=mq.get("verbal_recommendation", ""),
    )


async def synthesizer_agent(state: dict, config: dict | None = None) -> dict:
    """
    Agent 4: Synthesis node for LangGraph.

    Generates candidate stories, maps to epics, attaches checks, produces quality feedback.
    """
    config = config or {}
    configurable = config.get("configurable", {})
    progress_cb = configurable.get("progress_callback")
    meeting_id = state["meeting_id"]
    requirements: list[Requirement] = state.get("requirements", [])
    checks: list[Check] = state.get("checks", [])
    context: dict[str, list] = state.get("context", {})
    errors: list[PipelineError] = list(state.get("errors", []))

    if progress_cb:
        progress_cb({
            "agent": "synthesizer",
            "status": "running",
            "message": "Generating candidate stories and mapping to epics...",
        })

    start = time.time()

    # Load existing epics from backlog
    try:
        backlog = PgBacklogSource()
        epic_items = backlog.get_epics()
        existing_epics = [
            {"id": e.id, "title": e.title, "description": e.description or ""}
            for e in epic_items
        ]
    except Exception as e:
        logger.warning("Failed to load epics: %s", e)
        existing_epics = []

    try:
        llm_result = _call_synthesis_llm(requirements, checks, context, existing_epics)
        data = json.loads(llm_result["content"])

        candidate_stories = _parse_stories(data, checks)
        epic_proposals = _parse_epic_proposals(data)
        meeting_quality = _parse_meeting_quality(data)

    except Exception as e:
        logger.exception("Synthesizer agent failed")
        errors.append(PipelineError(
            agent="synthesizer",
            error_type=type(e).__name__,
            message=str(e),
            recoverable=False,
        ))
        candidate_stories = []
        epic_proposals = []
        meeting_quality = MeetingQuality()
        llm_result = {"prompt_tokens": 0, "completion_tokens": 0}

    duration_ms = int((time.time() - start) * 1000)

    # Write stories to DB
    for story in candidate_stories:
        try:
            story_id = execute_write(
                """
                INSERT INTO stories
                    (meeting_id, title, description, type, acceptance_criteria,
                     feature_tags, priority_signals, confidence, source_citation,
                     status, original_content)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, 'generated', %s)
                RETURNING id
                """,
                (
                    meeting_id, story.title, story.description, story.type.value,
                    json.dumps(story.acceptance_criteria),
                    json.dumps(story.feature_tags),
                    json.dumps([ps.model_dump() for ps in story.priority_signals]),
                    story.confidence.value, story.source_citation,
                    json.dumps(story.model_dump(exclude={"checks", "questions"}), default=str),
                ),
            )
            story.id = story_id

            # Write checks to DB
            for check in story.checks:
                try:
                    check_id = execute_write(
                        """
                        INSERT INTO checks
                            (story_id, check_type, details, proposed_resolution, routed_to, status)
                        VALUES (%s, %s, %s, %s, %s, 'open')
                        RETURNING id
                        """,
                        (
                            story_id, check.check_type.value, check.details,
                            check.proposed_resolution, check.routed_to,
                        ),
                    )
                    check.id = check_id
                except Exception as ce:
                    logger.warning("Failed to write check: %s", ce)

        except Exception as se:
            logger.warning("Failed to write story to DB: %s", se)

    # Write epic proposals to DB
    for ep in epic_proposals:
        try:
            execute_write(
                """
                INSERT INTO epics
                    (title, description, status, is_proposed,
                     proposed_by_meeting, proposal_justification)
                VALUES (%s, %s, 'proposed', TRUE, %s, %s)
                """,
                (ep.title, f"{ep.goal}\n\nScope: {ep.scope}",
                 meeting_id, ep.justification),
            )
        except Exception as ee:
            logger.warning("Failed to write epic proposal: %s", ee)

    # Update meeting quality
    try:
        execute_write(
            "UPDATE meetings SET meeting_quality = %s WHERE id = %s",
            (json.dumps(meeting_quality.model_dump(), default=str), meeting_id),
        )
    except Exception as mqe:
        logger.warning("Failed to update meeting quality: %s", mqe)

    # Agent trace
    try:
        execute_write(
            """
            INSERT INTO agent_traces
                (meeting_id, agent_name, input_summary, output_summary,
                 llm_model, llm_prompt_tokens, llm_completion_tokens, duration_ms, errors)
            VALUES (%s, 'synthesizer', %s, %s, 'gpt-4o', %s, %s, %s, %s)
            """,
            (
                meeting_id,
                json.dumps({"requirement_count": len(requirements), "check_count": len(checks)}),
                json.dumps({
                    "story_count": len(candidate_stories),
                    "epic_proposal_count": len(epic_proposals),
                    "actionability": meeting_quality.actionability_score.value,
                }),
                llm_result.get("prompt_tokens", 0),
                llm_result.get("completion_tokens", 0),
                duration_ms,
                json.dumps([e.model_dump() for e in errors if e.agent == "synthesizer"]),
            ),
        )
    except Exception as te:
        logger.warning("Failed to write agent trace: %s", te)

    if progress_cb:
        progress_cb({
            "agent": "synthesizer",
            "status": "done",
            "message": (
                f"Generated {len(candidate_stories)} stories, "
                f"{len(epic_proposals)} epic proposals"
            ),
            "details": {
                "story_count": len(candidate_stories),
                "epic_proposal_count": len(epic_proposals),
            },
        })

    return {
        "candidate_stories": candidate_stories,
        "epic_proposals": epic_proposals,
        "meeting_quality": meeting_quality,
        "errors": errors,
    }
