"""Tests for Pydantic models."""
import pytest
from models.story import (
    Requirement, RequirementType, Granularity, Confidence, Priority,
    CandidateStory, Check, CheckType, GroundingStatus, PipelineError,
    EpicProposal, ReviewDecision, ValidationResult, MeetingQuality,
    BacklogHygieneFlag, PrioritySignal, AmbiguityFlag,
)


class TestRequirement:
    def test_create_basic(self):
        req = Requirement(
            description="Test requirement",
            source_citation="We need this feature",
            type=RequirementType.feature,
            granularity=Granularity.story,
        )
        assert req.description == "Test requirement"
        assert req.confidence == Confidence.medium  # default

    def test_with_speaker(self):
        req = Requirement(
            description="Test",
            source_citation="quote",
            speaker="Sarah (PM)",
            type=RequirementType.bug,
            granularity=Granularity.task,
        )
        assert req.speaker == "Sarah (PM)"

    def test_with_priority(self):
        req = Requirement(
            description="Urgent fix",
            source_citation="quote",
            type=RequirementType.bug,
            granularity=Granularity.story,
            priority=Priority.critical,
        )
        assert req.priority == Priority.critical

    def test_all_types(self):
        for t in RequirementType:
            req = Requirement(
                description="test",
                source_citation="q",
                type=t,
                granularity=Granularity.story,
            )
            assert req.type == t


class TestCandidateStory:
    def test_create_basic(self):
        story = CandidateStory(
            title="Test Story",
            description="As a user...",
            type=RequirementType.feature,
        )
        assert story.title == "Test Story"
        assert story.checks == []
        assert story.acceptance_criteria == []

    def test_with_epic(self):
        story = CandidateStory(
            title="Test",
            description="desc",
            type=RequirementType.feature,
            epic_id="ERIS-001",
        )
        assert story.epic_id == "ERIS-001"
        assert story.proposed_epic is None

    def test_with_priority(self):
        story = CandidateStory(
            title="Test",
            description="desc",
            type=RequirementType.feature,
            priority="high",
        )
        assert story.priority == "high"


class TestCheckType:
    def test_all_check_types(self):
        expected = {'overlap', 'duplicate', 'architecture', 'prior_decision',
                    'dependency', 'priority', 'no_epic', 'new_epic', 'nfr_violation', 'ambiguity'}
        actual = {ct.value for ct in CheckType}
        assert actual == expected

    def test_create_check(self):
        check = Check(
            story_title="Story 1",
            check_type=CheckType.overlap,
            details="Overlaps with ERIS-042",
        )
        assert check.check_type == CheckType.overlap
        assert check.routed_to is None


class TestPipelineError:
    def test_create(self):
        err = PipelineError(
            agent="parser",
            error_type="ValueError",
            message="Something went wrong",
        )
        assert err.recoverable is True  # default
        assert err.agent == "parser"


class TestMeetingQuality:
    def test_defaults(self):
        mq = MeetingQuality()
        assert mq.total_requirements == 0
        assert mq.ambiguity_ratio == 0.0
