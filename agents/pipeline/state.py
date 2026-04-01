"""Pipeline state definition for LangGraph."""

from __future__ import annotations

from typing import TypedDict, Optional

from models.story import (
    Requirement,
    CandidateStory,
    Check,
    EpicProposal,
    MeetingQuality,
    ValidationResult,
    ReviewDecision,
    PipelineError,
)
from models.memo import DecisionMemo


class PipelineState(TypedDict, total=False):
    """Full state carried through the LangGraph pipeline."""

    # Input
    meeting_id: int
    transcript: str

    # Agent 1 (Parser) output
    requirements: list[Requirement]

    # Agent 2 (Retriever) output — per-requirement context from KB
    context: dict[str, list]

    # Agent 3 (Cross-Reference) output
    checks: list[Check]

    # Agent 4 (Synthesizer) output
    candidate_stories: list[CandidateStory]
    epic_proposals: list[EpicProposal]
    meeting_quality: MeetingQuality

    # Validator output
    validation_results: list[ValidationResult]

    # Human review (set by UI via API)
    review_decisions: list[ReviewDecision]

    # Agent 6 (Memo) output
    memo: DecisionMemo

    # Error tracking
    errors: list[PipelineError]
