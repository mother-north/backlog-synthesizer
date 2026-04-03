"""Tests for retriever agent with mocked dependencies."""
import json
import pytest
from unittest.mock import patch, MagicMock
from models.story import (
    Requirement, RequirementType, Granularity, Confidence, PipelineError,
)


def _make_requirement(desc="Add authentication"):
    return Requirement(
        id="REQ-001",
        description=desc,
        source_citation="We need to add authentication",
        type=RequirementType.feature,
        granularity=Granularity.story,
        confidence=Confidence.high,
    )


class TestFilterRelevance:
    """Test relevance filtering logic."""

    def test_parse_filtered_response(self):
        """Simulate LLM relevance filter output parsing."""
        llm_response = json.dumps({
            "filtered": [
                {"index": 0, "relevant": True, "reason": "matches"},
                {"index": 1, "relevant": False, "reason": "unrelated"},
                {"index": 2, "relevant": True, "reason": "partial match"},
            ]
        })
        data = json.loads(llm_response)
        indices = {e["index"] for e in data["filtered"] if e.get("relevant")}
        items = ["item_a", "item_b", "item_c"]
        filtered = [item for i, item in enumerate(items) if i in indices]
        assert filtered == ["item_a", "item_c"]

    def test_empty_filtered_response(self):
        data = {"filtered": []}
        indices = {e["index"] for e in data["filtered"] if e.get("relevant")}
        assert len(indices) == 0

    def test_all_relevant(self):
        data = {"filtered": [
            {"index": 0, "relevant": True},
            {"index": 1, "relevant": True},
        ]}
        indices = {e["index"] for e in data["filtered"] if e.get("relevant")}
        assert indices == {0, 1}

    def test_none_relevant(self):
        data = {"filtered": [
            {"index": 0, "relevant": False},
            {"index": 1, "relevant": False},
        ]}
        indices = {e["index"] for e in data["filtered"] if e.get("relevant")}
        assert len(indices) == 0


class TestAmbiguityDetection:
    """Test ambiguity flag detection heuristics."""

    def test_vague_requirement_flagged(self):
        """Requirements with vague words should get ambiguity flags."""
        vague_words = ["maybe", "possibly", "might", "could", "perhaps", "somehow"]
        for word in vague_words:
            desc = f"We {word} need to add this feature"
            assert word in desc.lower()

    def test_specific_requirement_not_flagged(self):
        desc = "Add JWT authentication with bcrypt password hashing"
        vague_words = ["maybe", "possibly", "might", "perhaps"]
        assert not any(w in desc.lower() for w in vague_words)


@pytest.mark.asyncio
async def test_retriever_agent_with_mocks():
    """Integration test: run retriever_agent with all dependencies mocked."""
    from pipeline.retriever import retriever_agent

    req = _make_requirement()

    mock_kb = MagicMock()
    mock_kb.search_similar.return_value = []
    mock_kb.search_decisions.return_value = []
    mock_kb.search_feedback.return_value = []

    with patch('pipeline.retriever.KnowledgeBase', return_value=mock_kb):
        with patch('pipeline.retriever.PgBacklogSource') as MockBacklog:
            MockBacklog.return_value.search.return_value = []
            with patch('pipeline.retriever.PgArchitectureSource') as MockArch:
                MockArch.return_value.get_sections.return_value = []
                with patch('pipeline.retriever.execute_write'):
                    result = await retriever_agent({
                        "meeting_id": 1,
                        "requirements": [req],
                        "errors": [],
                    })

    assert "context" in result
    assert "requirements" in result
    assert isinstance(result["context"], dict)
