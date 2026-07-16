"""Agent 6: Memo — generate decision memo, store artifacts in KB."""

from __future__ import annotations

import json
import logging
import time
from typing import Any

from openai import OpenAI
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type
import openai as openai_mod

from models.story import (
    CandidateStory, EpicProposal, MeetingQuality, ReviewDecision,
    ValidationResult, PipelineError,
)
from models.memo import DecisionMemo, MemoStoryEntry
from tools.kb import KnowledgeBase
from tools.db import execute_write, execute_query_one

logger = logging.getLogger(__name__)

MEMO_SYSTEM = """You are a decision memo generation agent. Generate a comprehensive decision memo reflecting the current state of a meeting's backlog synthesis.

The memo MUST include these sections in order:

1. **Meeting Summary** — What was this meeting about? Summarize the main topics discussed, key participants, and the overall purpose. 2-3 sentences.

2. **Key Decisions & Outcomes** — What was decided? Highlight the most important outcomes.

3. **Confirmed Stories** (count) — Stories confirmed by human review, grouped by epic. For each: title, type, who raised it (speaker). Show as a bulleted list.

4. **Rejected Stories** (count) — Stories rejected with rationale for each rejection.

5. **In Progress** (count) — Stories still under review, with any open checks or blockers noted.

6. **Epic Proposals** — New epics proposed, their status (approved/pending).

7. **Open Items & Risks** — Unresolved questions, pending decisions, blockers, assigned owners.

8. **Meeting Quality** — Actionability score, ambiguity ratio, recommendation.

Format the full_text as clean markdown with proper headings (##), bullet points, bold for story titles, and counts in section headings.

Output JSON:
{
  "title": "Decision Memo: [meeting title]",
  "summary": "2-3 sentence overview of meeting topic and outcomes",
  "sections": [
    {"heading": "section heading", "content": "section text"}
  ],
  "full_text": "complete memo as formatted markdown"
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
def _call_memo_llm(
    stories: list[CandidateStory],
    story_statuses: dict[int, str],
    review_decisions: list[ReviewDecision],
    epic_proposals: list[EpicProposal],
    meeting_quality: MeetingQuality | None,
    meeting_title: str,
) -> dict:
    """Call GPT-4o to generate memo."""
    # Categorise stories by DB status (primary) or review_decisions (fallback)
    confirmed, rejected, pending = [], [], []
    decision_map = {d.story_title.lower(): d for d in review_decisions}

    for s in stories:
        db_status = story_statuses.get(s.id, "generated") if s.id else "generated"
        dec = decision_map.get(s.title.lower())
        entry = {
            "title": s.title,
            "type": s.type.value,
            "epic": s.epic_id or s.proposed_epic or "unmapped",
            "speaker": s.speaker or "Unknown",
            "source_citation": s.source_citation[:200],
            "checks_count": len(s.checks),
            "grounding_status": s.grounding_status.value if s.grounding_status else "unknown",
        }
        if db_status in ("confirmed", "ready_to_push") or (dec and dec.decision == "confirmed"):
            entry["rationale"] = dec.rationale if dec else ""
            confirmed.append(entry)
        elif db_status == "rejected" or (dec and dec.decision == "rejected"):
            entry["rationale"] = dec.rationale if dec else ""
            rejected.append(entry)
        else:
            entry["status"] = db_status
            pending.append(entry)

    user_content = f"""Meeting: {meeting_title}

Confirmed Stories ({len(confirmed)}):
{json.dumps(confirmed, indent=2)}

Rejected Stories ({len(rejected)}):
{json.dumps(rejected, indent=2)}

Pending Stories ({len(pending)}):
{json.dumps(pending, indent=2)}

Epic Proposals:
{json.dumps([ep.model_dump() for ep in epic_proposals], indent=2, default=str)}

Meeting Quality:
{json.dumps(meeting_quality.model_dump() if meeting_quality else {}, default=str, indent=2)}
"""

    resp = _get_client().chat.completions.create(
        model="gpt-5.4-mini",
        messages=[
            {"role": "system", "content": MEMO_SYSTEM},
            {"role": "user", "content": user_content},
        ],
        temperature=0.2,
        max_completion_tokens=32768,
        response_format={"type": "json_object"},
    )
    content = resp.choices[0].message.content or "{}"
    usage = resp.usage
    return {
        "content": content,
        "prompt_tokens": usage.prompt_tokens if usage else 0,
        "completion_tokens": usage.completion_tokens if usage else 0,
    }


async def memo_agent(state: dict, config: dict | None = None) -> dict:
    """
    Agent 6: Memo node for LangGraph.

    Generates a decision memo reflecting current state, stores artifacts in KB.
    """
    # config handled by LangGraph
    
    
    meeting_id = state["meeting_id"]
    candidate_stories: list[CandidateStory] = state.get("candidate_stories", [])
    review_decisions: list[ReviewDecision] = state.get("review_decisions", [])
    epic_proposals: list[EpicProposal] = state.get("epic_proposals", [])
    meeting_quality: MeetingQuality | None = state.get("meeting_quality")
    errors: list[PipelineError] = list(state.get("errors", []))

    try:
        from tools.progress import update_progress
        update_progress(meeting_id, "memo", "running", "Generating decision memo...")
    except Exception as e:
        logger.debug("Non-critical error: %s", e)

    start = time.time()

    # Get meeting title
    try:
        row = execute_query_one("SELECT title FROM meetings WHERE id = %s", (meeting_id,))
        meeting_title = row["title"] if row else f"Meeting {meeting_id}"
    except Exception as e:
        meeting_title = f"Meeting {meeting_id}"

    # Get current story statuses from DB
    story_statuses: dict[int, str] = {}
    try:
        from tools.db import execute_query
        status_rows = execute_query(
            "SELECT id, status FROM stories WHERE meeting_id = %s", (meeting_id,)
        )
        story_statuses = {r["id"]: r["status"] for r in status_rows}
    except Exception as e:
        logger.debug("Non-critical error: %s", e)

    try:
        llm_result = _call_memo_llm(
            candidate_stories, story_statuses, review_decisions, epic_proposals,
            meeting_quality, meeting_title,
        )
        data = json.loads(llm_result["content"])

        # Categorise stories for the model
        decision_map = {d.story_title.lower(): d for d in review_decisions}
        confirmed_entries, rejected_entries, pending_entries = [], [], []
        for s in candidate_stories:
            db_status = story_statuses.get(s.id, "generated") if s.id else "generated"
            dec = decision_map.get(s.title.lower())
            if db_status in ("confirmed", "ready_to_push"):
                status = "confirmed"
            elif db_status == "rejected":
                status = "rejected"
            elif dec and dec.decision == "confirmed":
                status = "confirmed"
            elif dec and dec.decision == "rejected":
                status = "rejected"
            else:
                status = "pending"
            entry = MemoStoryEntry(
                title=s.title,
                type=s.type.value,
                epic=s.epic_id or s.proposed_epic or "unmapped",
                status=status,
                rationale=dec.rationale if dec else None,
            )
            if entry.status == "confirmed":
                confirmed_entries.append(entry)
            elif entry.status == "rejected":
                rejected_entries.append(entry)
            else:
                pending_entries.append(entry)

        # Determine next memo version
        existing = execute_query_one(
            "SELECT COALESCE(MAX(version), 0) AS max_ver FROM memos WHERE meeting_id = %s",
            (meeting_id,),
        )
        next_version = (existing["max_ver"] if existing else 0) + 1

        memo = DecisionMemo(
            meeting_id=meeting_id,
            version=next_version,
            title=data.get("title", f"Decision Memo: {meeting_title}"),
            summary=data.get("summary", ""),
            confirmed_stories=confirmed_entries,
            rejected_stories=rejected_entries,
            pending_stories=pending_entries,
            epic_proposals=[ep.model_dump() for ep in epic_proposals],
            meeting_quality_summary=meeting_quality.verbal_recommendation if meeting_quality else "",
            full_text=data.get("full_text", ""),
            sections=[
                {"heading": s.get("heading", ""), "content": s.get("content", "")}
                for s in data.get("sections", [])
            ],
        )

    except Exception as e:
        logger.exception("Memo agent failed")
        errors.append(PipelineError(
            agent="memo",
            error_type=type(e).__name__,
            message=str(e),
            recoverable=False,
        ))
        memo = DecisionMemo(meeting_id=meeting_id)
        llm_result = {"prompt_tokens": 0, "completion_tokens": 0}

    # Store memo in DB
    try:
        execute_write(
            """
            INSERT INTO memos (meeting_id, version, content)
            VALUES (%s, %s, %s)
            """,
            (meeting_id, memo.version, memo.full_text),
        )
    except Exception as me:
        logger.warning("Failed to store memo: %s", me)

    # Store artifacts in KB
    kb = KnowledgeBase()

    try:
        kb.store_meeting_summary(meeting_id, memo.summary)
    except Exception as e:
        logger.warning("Failed to store meeting summary embedding: %s", e)

    # Store confirmed decisions as embeddings
    confirmed_decisions = []
    decision_map = {d.story_title.lower(): d for d in review_decisions}
    for s in candidate_stories:
        dec = decision_map.get(s.title.lower())
        if dec:
            confirmed_decisions.append({
                "id": s.id or 0,
                "meeting_id": meeting_id,
                "decision_type": dec.decision,
                "rationale": dec.rationale or "",
            })
    try:
        if confirmed_decisions:
            kb.store_decisions(confirmed_decisions)
    except Exception as e:
        logger.warning("Failed to store decision embeddings: %s", e)

    # Store confirmed story embeddings
    for s in candidate_stories:
        dec = decision_map.get(s.title.lower())
        if dec and dec.decision == "confirmed" and s.id:
            try:
                kb.store_story_embedding(
                    s.id,
                    f"{s.title}: {s.description}\nAcceptance Criteria: {'; '.join(s.acceptance_criteria)}",
                )
            except Exception as e:
                logger.warning("Failed to store story embedding for %s: %s", s.title, e)

    # Store human feedback (rejections, modifications)
    for dec in review_decisions:
        if dec.decision in ("rejected", "modified"):
            try:
                execute_write(
                    """
                    INSERT INTO decisions (meeting_id, decision_type, rationale)
                    VALUES (%s, %s, %s)
                    """,
                    (meeting_id, dec.decision, dec.rationale or ""),
                )
            except Exception as e:
                logger.warning("Failed to store feedback decision: %s", e)

    duration_ms = int((time.time() - start) * 1000)

    # Agent trace
    try:
        execute_write(
            """
            INSERT INTO agent_traces
                (meeting_id, agent_name, input_summary, output_summary,
                 llm_model, llm_prompt_tokens, llm_completion_tokens, duration_ms, errors)
            VALUES (%s, 'memo', %s, %s, 'gpt-4o', %s, %s, %s, %s)
            """,
            (
                meeting_id,
                json.dumps({
                    "story_count": len(candidate_stories),
                    "decision_count": len(review_decisions),
                }),
                json.dumps({
                    "memo_version": memo.version,
                    "confirmed": len(memo.confirmed_stories),
                    "rejected": len(memo.rejected_stories),
                    "pending": len(memo.pending_stories),
                }),
                llm_result.get("prompt_tokens", 0),
                llm_result.get("completion_tokens", 0),
                duration_ms,
                json.dumps([e.model_dump() for e in errors if e.agent == "memo"]),
            ),
        )
    except Exception as te:
        logger.warning("Failed to write agent trace: %s", te)

    # Update meeting status
    try:
        execute_write(
            "UPDATE meetings SET status = 'in_review' WHERE id = %s",
            (meeting_id,),
        )
    except Exception as e:
        logger.debug("Non-critical error: %s", e)

    try:
        from tools.progress import update_progress
        update_progress(meeting_id, "memo", "done", "Memo generated")
    except Exception as e:
        logger.debug("Non-critical error: %s", e)

    return {
        "memo": memo,
        "errors": errors,
    }
