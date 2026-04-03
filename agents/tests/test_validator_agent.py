"""Tests for validator agent — grounding logic with mocked LLM."""
import json
import pytest
from unittest.mock import patch
from models.story import (
    CandidateStory, RequirementType, Confidence, GroundingStatus,
    ValidationResult,
)


def _make_story(title, citation, story_id=1):
    return CandidateStory(
        id=story_id,
        title=title,
        description="desc",
        type=RequirementType.feature,
        confidence=Confidence.high,
        source_citation=citation,
    )


TRANSCRIPT = """**Sarah (PM):** We need to add user authentication to the system. This is critical for launch.

**Mike (Architect):** We should use JWT tokens for the API and bcrypt for password hashing.

**Alex (Dev Lead):** I also want to add rate limiting on the login endpoint."""


class TestGroundingStatusLogic:
    """Test the merge logic: auto fuzzy + LLM → final status."""

    def test_both_valid_returns_valid(self):
        """When both auto and LLM say valid, result is valid."""
        from pipeline.validator import _fuzzy_find_citation
        sim = _fuzzy_find_citation("We need to add user authentication to the system", TRANSCRIPT)
        auto = GroundingStatus.valid if sim >= 0.9 else GroundingStatus.warning if sim >= 0.7 else GroundingStatus.invalid
        llm = GroundingStatus.valid
        status_order = {GroundingStatus.valid: 0, GroundingStatus.warning: 1, GroundingStatus.invalid: 2}
        final = max(auto, llm, key=lambda s: status_order[s])
        assert final == GroundingStatus.valid

    def test_auto_valid_llm_warning_returns_warning(self):
        """Worse of the two wins."""
        auto = GroundingStatus.valid
        llm = GroundingStatus.warning
        status_order = {GroundingStatus.valid: 0, GroundingStatus.warning: 1, GroundingStatus.invalid: 2}
        final = max(auto, llm, key=lambda s: status_order[s])
        assert final == GroundingStatus.warning

    def test_auto_invalid_llm_valid_returns_invalid(self):
        auto = GroundingStatus.invalid
        llm = GroundingStatus.valid
        status_order = {GroundingStatus.valid: 0, GroundingStatus.warning: 1, GroundingStatus.invalid: 2}
        final = max(auto, llm, key=lambda s: status_order[s])
        assert final == GroundingStatus.invalid

    def test_both_invalid_returns_invalid(self):
        auto = GroundingStatus.invalid
        llm = GroundingStatus.invalid
        status_order = {GroundingStatus.valid: 0, GroundingStatus.warning: 1, GroundingStatus.invalid: 2}
        final = max(auto, llm, key=lambda s: status_order[s])
        assert final == GroundingStatus.invalid


MOCK_VALIDATOR_LLM = {
    "content": json.dumps({
        "validations": [
            {
                "story_title": "Add Auth",
                "grounding_status": "valid",
                "issues": [],
                "suggested_fix": None,
            },
            {
                "story_title": "Fabricated Feature",
                "grounding_status": "invalid",
                "issues": ["Not found in transcript"],
                "suggested_fix": "Remove this story",
            },
        ]
    }),
    "prompt_tokens": 300,
    "completion_tokens": 100,
}


@pytest.mark.asyncio
async def test_validator_agent_with_mock():
    """Run validator with mocked LLM and real fuzzy matching."""
    from pipeline.validator import validator_agent

    stories = [
        _make_story("Add Auth", "We need to add user authentication to the system", 1),
        _make_story("Fabricated Feature", "This text does not exist anywhere in the transcript", 2),
    ]

    with patch('pipeline.validator._call_validator_llm', return_value=MOCK_VALIDATOR_LLM):
        with patch('pipeline.validator.execute_write'):
            result = await validator_agent({
                "meeting_id": 1,
                "candidate_stories": stories,
                "transcript": TRANSCRIPT,
                "errors": [],
            })

    assert "validation_results" in result
    vr = {v.story_title: v for v in result["validation_results"]}
    assert vr["Add Auth"].grounding_status == GroundingStatus.valid
    assert vr["Fabricated Feature"].grounding_status == GroundingStatus.invalid


@pytest.mark.asyncio
async def test_validator_empty_stories():
    """Validator with no stories should complete immediately."""
    from pipeline.validator import validator_agent

    with patch('pipeline.validator.execute_write'):
        result = await validator_agent({
            "meeting_id": 1,
            "candidate_stories": [],
            "transcript": TRANSCRIPT,
            "errors": [],
        })

    assert result["validation_results"] == []
