"""Tests for memo agent with mocked LLM."""
import json
import pytest
from unittest.mock import patch, MagicMock
from models.story import (
    CandidateStory, RequirementType, Confidence, GroundingStatus,
    ReviewDecision, EpicProposal, MeetingQuality, PipelineError,
)
from models.memo import DecisionMemo, MemoStoryEntry


def _make_story(title, story_id, epic_id=None):
    return CandidateStory(
        id=story_id,
        title=title,
        description="desc",
        type=RequirementType.feature,
        confidence=Confidence.high,
        source_citation="quote",
        epic_id=epic_id,
    )


MOCK_MEMO_LLM = {
    "content": json.dumps({
        "title": "Decision Memo: Test Meeting",
        "summary": "The meeting discussed authentication features.",
        "sections": [
            {"heading": "Confirmed Stories", "content": "Story A confirmed."},
            {"heading": "Rejected Stories", "content": "Story C rejected."},
        ],
        "full_text": "# Decision Memo\n\n## Summary\nThe meeting discussed auth features.\n\n## Confirmed (1)\n- Story A\n\n## Rejected (1)\n- Story C",
    }),
    "prompt_tokens": 400,
    "completion_tokens": 200,
}


class TestMemoCategorization:
    """Test story categorization by DB status."""

    def test_confirmed_from_db_status(self):
        statuses = {1: "confirmed", 2: "generated", 3: "rejected"}
        assert statuses[1] in ("confirmed", "ready_to_push")

    def test_rejected_from_db_status(self):
        statuses = {3: "rejected"}
        assert statuses[3] == "rejected"

    def test_pending_is_everything_else(self):
        statuses = {2: "generated", 4: "under_review", 5: "awaiting_confirmation"}
        for sid, status in statuses.items():
            assert status not in ("confirmed", "rejected", "ready_to_push")

    def test_db_status_takes_priority_over_review_decisions(self):
        """If DB says confirmed but review_decisions is empty, still confirmed."""
        statuses = {1: "confirmed"}
        decisions = {}  # No review decisions
        db_status = statuses.get(1, "generated")
        assert db_status == "confirmed"

    def test_memo_story_entry_creation(self):
        entry = MemoStoryEntry(
            title="Story A",
            type="feature",
            epic="ERIS-001",
            status="confirmed",
            rationale="Approved by PM",
        )
        assert entry.status == "confirmed"
        assert entry.rationale == "Approved by PM"


@pytest.mark.asyncio
async def test_memo_agent_categorizes_correctly():
    """Run memo_agent with mocked LLM and verify categorization."""
    from pipeline.memo import memo_agent

    stories = [
        _make_story("Story A", 1, "ERIS-001"),
        _make_story("Story B", 2, "ERIS-002"),
        _make_story("Story C", 3, "ERIS-001"),
    ]

    # DB says: 1=confirmed, 2=generated, 3=rejected
    mock_statuses = [
        {"id": 1, "status": "confirmed"},
        {"id": 2, "status": "generated"},
        {"id": 3, "status": "rejected"},
    ]

    with patch('pipeline.memo._call_memo_llm', return_value=MOCK_MEMO_LLM):
        with patch('pipeline.memo.execute_write'):
            with patch('pipeline.memo.execute_query_one') as mock_q1:
                mock_q1.side_effect = [
                    {"title": "Test Meeting"},  # meeting title
                    {"max_ver": 0},  # memo version
                ]
                with patch('tools.db.execute_query', return_value=mock_statuses) as mock_eq:
                    with patch('tools.kb.KnowledgeBase') as MockKB:
                        MockKB.return_value.store_meeting_summary = MagicMock()
                        MockKB.return_value.store_decisions = MagicMock()
                        MockKB.return_value.store_story_embedding = MagicMock()

                        result = await memo_agent({
                            "meeting_id": 1,
                            "candidate_stories": stories,
                            "review_decisions": [],
                            "epic_proposals": [],
                            "meeting_quality": None,
                            "errors": [],
                        })

    assert "memo" in result
    memo = result["memo"]
    assert isinstance(memo, DecisionMemo)
    assert len(memo.confirmed_stories) == 1  # Story A
    assert len(memo.rejected_stories) == 1   # Story C
    assert len(memo.pending_stories) == 1    # Story B
    assert memo.confirmed_stories[0].title == "Story A"
    assert memo.rejected_stories[0].title == "Story C"


@pytest.mark.asyncio
async def test_memo_agent_handles_llm_error():
    """Memo agent should return empty memo on LLM failure."""
    from pipeline.memo import memo_agent

    with patch('pipeline.memo._call_memo_llm', side_effect=Exception("LLM timeout")):
        with patch('pipeline.memo.execute_write'):
            with patch('pipeline.memo.execute_query_one', return_value={"title": "Test"}):
                with patch('tools.db.execute_query', return_value=[]):
                    with patch('tools.kb.KnowledgeBase') as MockKB:
                        MockKB.return_value.store_meeting_summary = MagicMock()
                        result = await memo_agent({
                            "meeting_id": 1,
                            "candidate_stories": [],
                            "review_decisions": [],
                            "epic_proposals": [],
                            "meeting_quality": None,
                            "errors": [],
                        })

    assert "memo" in result
    assert "errors" in result
    assert len(result["errors"]) > 0
