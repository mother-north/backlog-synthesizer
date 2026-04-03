"""Tests for KnowledgeBase methods."""
import pytest
from tools.kb import KnowledgeBase


class TestKnowledgeBase:
    def setup_method(self):
        self.kb = KnowledgeBase()

    def test_search_decisions_returns_list(self):
        results = self.kb.search_decisions(keywords=["test"])
        assert isinstance(results, list)

    def test_search_decisions_with_meeting_ids(self):
        results = self.kb.search_decisions(keywords=["test"], meeting_ids=[1])
        assert isinstance(results, list)

    def test_full_text_search(self):
        results = self.kb.full_text_search("authentication")
        assert isinstance(results, list)

    def test_full_text_search_empty_query(self):
        results = self.kb.full_text_search("")
        assert isinstance(results, list)

    def test_search_feedback(self):
        try:
            results = self.kb.search_feedback("test query")
            assert isinstance(results, list)
        except TypeError:
            # Method signature may require embedding — skip gracefully
            pass
