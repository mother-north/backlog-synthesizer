"""Decision memo model."""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class MemoStoryEntry(BaseModel):
    title: str
    type: str
    epic: str = ""
    status: str  # confirmed | rejected | pending
    rationale: Optional[str] = None


class MemoSection(BaseModel):
    heading: str
    content: str


class DecisionMemo(BaseModel):
    """A decision memo reflecting the current state of a meeting's pipeline."""
    meeting_id: int
    version: int = 1
    title: str = ""
    summary: str = ""
    confirmed_stories: list[MemoStoryEntry] = Field(default_factory=list)
    rejected_stories: list[MemoStoryEntry] = Field(default_factory=list)
    pending_stories: list[MemoStoryEntry] = Field(default_factory=list)
    epic_proposals: list[dict] = Field(default_factory=list)
    open_items: list[str] = Field(default_factory=list)
    conflicts_resolved: list[str] = Field(default_factory=list)
    meeting_quality_summary: str = ""
    full_text: str = ""
    sections: list[MemoSection] = Field(default_factory=list)
