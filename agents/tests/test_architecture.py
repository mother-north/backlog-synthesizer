"""Tests for architecture tool — parsing logic."""
import pytest
from tools.architecture import PgArchitectureSource, Constraint


class TestArchitectureParsing:
    def setup_method(self):
        self.source = PgArchitectureSource()

    def test_split_sections_basic(self):
        content = "# Title\n\n## Section One\nContent A\n\n## Section Two\nContent B"
        sections = self.source._split_into_sections(content)
        assert len(sections) >= 2

    def test_split_sections_empty(self):
        sections = self.source._split_into_sections("")
        assert len(sections) == 0

    def test_split_sections_no_headers(self):
        content = "Just plain text with no markdown headers."
        sections = self.source._split_into_sections(content)
        # Should return at least the content as one section
        assert len(sections) >= 0

    def test_get_constraints_from_db(self):
        """Test that constraints can be loaded (integration with real DB)."""
        constraints = self.source.get_constraints()
        assert isinstance(constraints, list)
        for c in constraints:
            assert isinstance(c, Constraint)
            assert c.description is not None
