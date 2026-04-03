"""Tests for database tools."""
import pytest
from tools.db import execute_query, execute_query_one, execute_write


class TestDatabaseQueries:
    def test_execute_query_returns_list(self):
        result = execute_query("SELECT 1 as val")
        assert isinstance(result, list)
        assert len(result) == 1
        assert result[0]["val"] == 1

    def test_execute_query_with_params(self):
        result = execute_query("SELECT %s::int as num", (42,))
        assert result[0]["num"] == 42

    def test_execute_query_one_returns_dict(self):
        result = execute_query_one("SELECT 1 as val")
        assert isinstance(result, dict)
        assert result["val"] == 1

    def test_execute_query_one_returns_none_for_empty(self):
        result = execute_query_one("SELECT 1 WHERE false")
        assert result is None

    def test_query_meetings_table(self):
        result = execute_query("SELECT count(*) as cnt FROM meetings")
        assert isinstance(result[0]["cnt"], int)
        assert result[0]["cnt"] >= 0

    def test_query_stories_table(self):
        result = execute_query("SELECT count(*) as cnt FROM stories")
        assert result[0]["cnt"] >= 0

    def test_parameterized_query_prevents_injection(self):
        """Ensure parameterized queries handle malicious input safely."""
        result = execute_query(
            "SELECT %s as val",
            ("'; DROP TABLE meetings; --",)
        )
        assert result[0]["val"] == "'; DROP TABLE meetings; --"
        # Verify meetings table still exists
        count = execute_query("SELECT count(*) as cnt FROM meetings")
        assert count[0]["cnt"] >= 0
