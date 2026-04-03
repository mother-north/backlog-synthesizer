"""Tests for crossref agent with mocked LLM."""
import json
import pytest
from unittest.mock import patch, MagicMock
from models.story import (
    Requirement, RequirementType, Granularity, Confidence,
    Check, CheckType, BacklogHygieneFlag, PipelineError,
)


MOCK_LLM_RESPONSE = {
    "content": json.dumps({
        "checks": [
            {
                "check_type": "overlap",
                "details": "Overlaps with ERIS-042 auth feature",
                "confidence": "high",
                "proposed_resolution": "Merge with existing story",
                "routed_to": "Dev Lead",
                "related_item_id": "ERIS-042",
            },
            {
                "check_type": "architecture",
                "details": "Violates single-DB constraint",
                "confidence": "medium",
                "proposed_resolution": "Review with architect",
                "routed_to": "Architect",
            },
        ],
        "hygiene_flags": [
            {
                "external_item_id": "ERIS-010",
                "flag_type": "potentially_obsolete",
                "reason": "Superseded by new auth requirement",
            },
        ],
    }),
    "prompt_tokens": 500,
    "completion_tokens": 200,
}


def _make_requirement(desc="Add authentication"):
    return Requirement(
        id="REQ-001",
        description=desc,
        source_citation="We need to add authentication",
        type=RequirementType.feature,
        granularity=Granularity.story,
        confidence=Confidence.high,
    )


class TestCrossRefParsing:
    """Test the parsing logic after LLM call."""

    def test_parse_checks_from_llm_response(self):
        data = json.loads(MOCK_LLM_RESPONSE["content"])
        checks = []
        for c in data.get("checks", []):
            checks.append(Check(
                story_title="Test Story",
                check_type=CheckType(c.get("check_type", "ambiguity")),
                details=c.get("details", ""),
                confidence=Confidence(c.get("confidence", "medium")),
                proposed_resolution=c.get("proposed_resolution"),
                routed_to=c.get("routed_to"),
                related_item_id=c.get("related_item_id"),
            ))
        assert len(checks) == 2
        assert checks[0].check_type == CheckType.overlap
        assert checks[0].routed_to == "Dev Lead"
        assert checks[0].related_item_id == "ERIS-042"
        assert checks[1].check_type == CheckType.architecture

    def test_parse_hygiene_flags(self):
        data = json.loads(MOCK_LLM_RESPONSE["content"])
        flags = []
        for h in data.get("hygiene_flags", []):
            flags.append(BacklogHygieneFlag(
                external_item_id=h.get("external_item_id", ""),
                flag_type=h.get("flag_type", "potentially_obsolete"),
                reason=h.get("reason", ""),
                source_citation="test citation",
            ))
        assert len(flags) == 1
        assert flags[0].external_item_id == "ERIS-010"

    def test_empty_llm_response(self):
        data = json.loads('{"checks": [], "hygiene_flags": []}')
        assert len(data.get("checks", [])) == 0
        assert len(data.get("hygiene_flags", [])) == 0

    def test_invalid_check_type_handled(self):
        data = {"checks": [{"check_type": "unknown_type", "details": "test"}]}
        with pytest.raises(ValueError):
            CheckType(data["checks"][0]["check_type"])

    def test_missing_fields_use_defaults(self):
        data = {"checks": [{"details": "minimal check"}]}
        c = data["checks"][0]
        check = Check(
            story_title="Test",
            check_type=CheckType(c.get("check_type", "ambiguity")),
            details=c.get("details", ""),
            confidence=Confidence(c.get("confidence", "medium")),
        )
        assert check.check_type == CheckType.ambiguity
        assert check.confidence == Confidence.medium
        assert check.routed_to is None


@pytest.mark.asyncio
async def test_crossref_agent_with_mock():
    """Integration test: run crossref_agent with mocked LLM."""
    from pipeline.crossref import crossref_agent

    req = _make_requirement()

    with patch('pipeline.crossref._call_crossref_llm', return_value=MOCK_LLM_RESPONSE):
        with patch('pipeline.crossref.PgBacklogSource') as MockBacklog:
            MockBacklog.return_value.get_all_items.return_value = []
            with patch('pipeline.crossref.PgArchitectureSource') as MockArch:
                MockArch.return_value.get_constraints.return_value = []
                with patch('pipeline.crossref.execute_write'):
                    result = await crossref_agent({
                        "meeting_id": 1,
                        "requirements": [req],
                        "context": {},
                        "errors": [],
                    })

    assert "checks" in result
    assert len(result["checks"]) == 2
    assert result["checks"][0].check_type == CheckType.overlap
