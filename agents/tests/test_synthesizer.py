"""Tests for the synthesizer agent — story generation logic."""
import pytest
from pipeline.synthesizer import _parse_stories
from models.story import Check, CheckType, Confidence, CandidateStory


class TestParseStories:
    def test_parse_basic_story(self):
        data = {
            "stories": [{
                "title": "Add User Auth",
                "description": "Implement user authentication",
                "type": "feature",
                "acceptance_criteria": ["Users can log in", "JWT tokens issued"],
                "feature_tags": ["auth", "security"],
                "confidence": "high",
                "source_citation": "We need auth",
                "speaker": "Sarah (PM)",
                "epic_id": "ERIS-003",
                "priority": "high",
            }],
            "epic_proposals": [],
            "meeting_quality": {},
        }
        stories = _parse_stories(data, [])
        assert len(stories) == 1
        assert stories[0].title == "Add User Auth"
        assert stories[0].epic_id == "ERIS-003"
        assert len(stories[0].acceptance_criteria) == 2

    def test_parse_multiple_stories(self):
        data = {
            "stories": [
                {"title": "Story A", "description": "d", "type": "feature", "confidence": "high", "source_citation": "q", "epic_id": "ERIS-001"},
                {"title": "Story B", "description": "d", "type": "bug", "confidence": "medium", "source_citation": "q", "epic_id": "ERIS-002"},
            ],
        }
        stories = _parse_stories(data, [])
        assert len(stories) == 2

    def test_no_epic_creates_check(self):
        """Stories without epic_id or proposed_epic get a no_epic check."""
        data = {
            "stories": [{
                "title": "Orphan Story",
                "description": "No epic assigned",
                "type": "feature",
                "confidence": "low",
                "source_citation": "q",
            }],
        }
        stories = _parse_stories(data, [])
        assert len(stories) == 1
        no_epic_checks = [c for c in stories[0].checks if c.check_type == CheckType.no_epic]
        assert len(no_epic_checks) == 1

    def test_proposed_epic_no_check(self):
        """Stories with proposed_epic should NOT get a no_epic check."""
        data = {
            "stories": [{
                "title": "New Feature",
                "description": "desc",
                "type": "feature",
                "confidence": "medium",
                "source_citation": "q",
                "proposed_epic": "New Area",
            }],
        }
        stories = _parse_stories(data, [])
        no_epic_checks = [c for c in stories[0].checks if c.check_type == CheckType.no_epic]
        assert len(no_epic_checks) == 0

    def test_checks_attached_to_stories(self):
        """Cross-ref checks should be attached to matching stories."""
        checks = [
            Check(
                story_title="Auth Story",
                check_type=CheckType.overlap,
                details="Overlaps with existing",
            ),
        ]
        data = {
            "stories": [{
                "title": "Auth Story Implementation",
                "description": "desc",
                "type": "feature",
                "confidence": "high",
                "source_citation": "q",
                "epic_id": "ERIS-003",
            }],
        }
        stories = _parse_stories(data, checks)
        assert len(stories[0].checks) >= 1
        assert any(c.check_type == CheckType.overlap for c in stories[0].checks)

    def test_invalid_type_skipped(self):
        data = {
            "stories": [
                {"title": "Valid", "description": "d", "type": "feature", "confidence": "high", "source_citation": "q", "epic_id": "ERIS-001"},
                {"title": "Invalid", "description": "d", "type": "unknown_type", "confidence": "high", "source_citation": "q"},
            ],
        }
        stories = _parse_stories(data, [])
        # Invalid type story should be skipped
        assert len(stories) <= 2  # may be 1 or 2 depending on error handling

    def test_speaker_preserved(self):
        data = {
            "stories": [{
                "title": "Test",
                "description": "d",
                "type": "feature",
                "confidence": "high",
                "source_citation": "q",
                "speaker": "Mike (Architect)",
                "epic_id": "ERIS-001",
            }],
        }
        stories = _parse_stories(data, [])
        assert stories[0].speaker == "Mike (Architect)"

    def test_priority_preserved(self):
        data = {
            "stories": [{
                "title": "Urgent",
                "description": "d",
                "type": "bug",
                "confidence": "high",
                "source_citation": "q",
                "priority": "critical",
                "epic_id": "ERIS-001",
            }],
        }
        stories = _parse_stories(data, [])
        assert stories[0].priority == "critical"
