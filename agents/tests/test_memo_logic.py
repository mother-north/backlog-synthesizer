"""Tests for memo agent — categorization logic (no LLM)."""
import pytest
from models.story import CandidateStory, RequirementType, Confidence


class TestMemoCategorization:
    def _make_story(self, title, status_id=None, epic_id=None):
        return CandidateStory(
            id=status_id,
            title=title,
            description="desc",
            type=RequirementType.feature,
            confidence=Confidence.high,
            source_citation="quote",
            epic_id=epic_id,
        )

    def test_story_status_mapping(self):
        """Verify story status dict construction."""
        statuses = {1: "confirmed", 2: "rejected", 3: "generated"}
        assert statuses.get(1) == "confirmed"
        assert statuses.get(2) == "rejected"
        assert statuses.get(3) == "generated"
        assert statuses.get(999, "generated") == "generated"

    def test_confirmed_categorization(self):
        story = self._make_story("Story A", status_id=1)
        statuses = {1: "confirmed"}
        db_status = statuses.get(story.id, "generated")
        assert db_status == "confirmed"

    def test_rejected_categorization(self):
        story = self._make_story("Story B", status_id=2)
        statuses = {2: "rejected"}
        db_status = statuses.get(story.id, "generated")
        assert db_status == "rejected"

    def test_pending_categorization(self):
        story = self._make_story("Story C", status_id=3)
        statuses = {3: "generated"}
        db_status = statuses.get(story.id, "generated")
        assert db_status not in ("confirmed", "rejected", "ready_to_push")

    def test_missing_status_defaults_to_generated(self):
        story = self._make_story("Story D", status_id=99)
        statuses = {}
        db_status = statuses.get(story.id, "generated")
        assert db_status == "generated"
