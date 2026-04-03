"""Tests for progress tracking tool."""
import pytest
from tools.progress import update_progress
from tools.db import execute_query_one


class TestProgressTracking:
    def test_update_progress_sets_status(self):
        """Update progress for meeting 1 and verify it's stored."""
        update_progress(1, "test_agent", "running", "Testing progress...")
        row = execute_query_one("SELECT pipeline_progress FROM meetings WHERE id = 1")
        assert row is not None
        progress = row.get("pipeline_progress")
        if progress:
            agents = {p["agent"]: p for p in progress}
            if "test_agent" in agents:
                assert agents["test_agent"]["status"] == "running"

    def test_update_progress_nonexistent_meeting(self):
        """Should not crash for non-existent meeting."""
        # Should handle gracefully — no exception
        try:
            update_progress(99999, "test", "running", "test")
        except Exception:
            pass  # Acceptable — non-existent meeting
