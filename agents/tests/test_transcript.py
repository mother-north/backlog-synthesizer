"""Tests for transcript reader tool."""
import pytest
from tools.transcript import TranscriptReader


class TestTranscriptReader:
    def test_read_existing_meeting(self):
        reader = TranscriptReader()
        # Meeting 1 should exist in test DB
        result = reader.read(1)
        assert result.meeting_id == 1
        assert result.title is not None
        assert len(result.raw_text) > 0
        assert result.word_count > 0
        assert result.is_empty is False

    def test_read_nonexistent_meeting_raises(self):
        reader = TranscriptReader()
        with pytest.raises(ValueError, match="not found"):
            reader.read(99999)

    def test_is_empty_for_short_text(self):
        """Verify the is_empty threshold (< 3 words)."""
        reader = TranscriptReader()
        # Meeting 1 has a full transcript, should not be empty
        result = reader.read(1)
        assert result.is_empty is False
        assert result.word_count >= 3
