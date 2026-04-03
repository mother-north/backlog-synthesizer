"""Tests for the parser agent — requirement extraction logic."""
import pytest
import re
from pipeline.parser import _parse_requirements, _extract_speaker_from_transcript


class TestParseRequirements:
    def test_parse_valid_json(self):
        raw = '{"requirements": [{"description": "Add auth", "source_citation": "We need auth", "type": "feature", "granularity": "story", "confidence": "high"}]}'
        reqs = _parse_requirements(raw)
        assert len(reqs) == 1
        assert reqs[0].description == "Add auth"
        assert reqs[0].id == "REQ-001"

    def test_parse_with_speaker(self):
        raw = '{"requirements": [{"description": "Fix bug", "source_citation": "The bug", "speaker": "Alex (Dev Lead)", "type": "bug", "granularity": "task", "confidence": "high"}]}'
        reqs = _parse_requirements(raw)
        assert reqs[0].speaker == "Alex (Dev Lead)"

    def test_parse_with_priority(self):
        raw = '{"requirements": [{"description": "Urgent", "source_citation": "q", "type": "bug", "granularity": "story", "priority": "critical", "confidence": "high"}]}'
        reqs = _parse_requirements(raw)
        assert reqs[0].priority.value == "critical"

    def test_parse_multiple(self):
        raw = '{"requirements": [{"description": "A", "source_citation": "a", "type": "feature", "granularity": "story", "confidence": "high"}, {"description": "B", "source_citation": "b", "type": "bug", "granularity": "task", "confidence": "low"}]}'
        reqs = _parse_requirements(raw)
        assert len(reqs) == 2
        assert reqs[0].id == "REQ-001"
        assert reqs[1].id == "REQ-002"

    def test_parse_bare_array(self):
        """Handle case where LLM returns bare array instead of {requirements: [...]}."""
        raw = '[{"description": "A", "source_citation": "a", "type": "feature", "granularity": "story", "confidence": "medium"}]'
        reqs = _parse_requirements(raw)
        assert len(reqs) == 1

    def test_parse_invalid_type_falls_back(self):
        """Invalid type should skip the requirement gracefully."""
        raw = '{"requirements": [{"description": "A", "source_citation": "a", "type": "invalid_type", "granularity": "story", "confidence": "high"}]}'
        reqs = _parse_requirements(raw)
        assert len(reqs) == 0  # skipped due to invalid type

    def test_default_confidence(self):
        raw = '{"requirements": [{"description": "A", "source_citation": "a", "type": "feature", "granularity": "story"}]}'
        reqs = _parse_requirements(raw)
        assert reqs[0].confidence.value == "medium"


class TestExtractSpeaker:
    def test_markdown_bold_speaker(self):
        transcript = "**Sarah (PM):** We need to add a new feature for users."
        citation = "We need to add a new feature for users."
        speaker = _extract_speaker_from_transcript(citation, transcript)
        assert speaker == "Sarah (PM)"

    def test_plain_speaker(self):
        transcript = "Alex: The bug is in the login flow."
        citation = "The bug is in the login flow."
        speaker = _extract_speaker_from_transcript(citation, transcript)
        assert speaker == "Alex"

    def test_multiple_speakers_returns_last(self):
        transcript = "**Sarah:** Let's discuss.\n\n**Mike:** We should add caching."
        citation = "We should add caching."
        speaker = _extract_speaker_from_transcript(citation, transcript)
        assert speaker == "Mike"

    def test_not_found_returns_unknown(self):
        transcript = "Some random text"
        citation = "This text does not exist in the transcript"
        speaker = _extract_speaker_from_transcript(citation, transcript)
        assert speaker == "Unknown"

    def test_empty_inputs(self):
        assert _extract_speaker_from_transcript("", "some text") == "Unknown"
        assert _extract_speaker_from_transcript("some text", "") == "Unknown"
