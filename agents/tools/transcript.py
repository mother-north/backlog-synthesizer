"""Transcript reader tool — reads meeting transcripts from PostgreSQL."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Optional

from tools.db import execute_query_one

logger = logging.getLogger(__name__)


@dataclass
class TranscriptResult:
    meeting_id: int
    title: str
    raw_text: str
    word_count: int
    is_empty: bool  # True if < 10 actionable words


class TranscriptReader:
    """Read meeting transcript from the database."""

    def read(self, meeting_id: int) -> TranscriptResult:
        """
        Read transcript for a given meeting_id.

        Current implementation: reads from PostgreSQL meetings.transcript
        Future: could fetch from Confluence, Google Docs, etc.
        """
        row = execute_query_one(
            "SELECT id, title, transcript FROM meetings WHERE id = %s",
            (meeting_id,),
        )
        if row is None:
            raise ValueError(f"Meeting {meeting_id} not found")

        raw = row["transcript"] or ""
        words = raw.split()
        return TranscriptResult(
            meeting_id=row["id"],
            title=row["title"] or f"Meeting {meeting_id}",
            raw_text=raw,
            word_count=len(words),
            is_empty=len(words) < 10,
        )
