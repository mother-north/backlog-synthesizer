"""Tests for backlog tool."""
import pytest
from tools.backlog import PgBacklogSource, BacklogItem


class TestBacklogSource:
    def setup_method(self):
        self.source = PgBacklogSource()

    def test_get_all_items(self):
        items = self.source.get_all_items()
        assert isinstance(items, list)
        if items:
            assert isinstance(items[0], BacklogItem)
            assert items[0].id is not None
            assert items[0].title is not None

    def test_get_epics(self):
        epics = self.source.get_epics()
        assert isinstance(epics, list)
        for e in epics:
            assert e.type == 'epic'

    def test_search(self):
        results = self.source.search("test", limit=5)
        assert isinstance(results, list)
        assert len(results) <= 5

    def test_search_empty_query(self):
        results = self.source.search("", limit=5)
        assert isinstance(results, list)
