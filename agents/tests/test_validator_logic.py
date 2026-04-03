"""Tests for validator pure logic — no LLM needed."""
import pytest
from pipeline.validator import _fuzzy_find_citation


class TestFuzzyFindCitation:
    def test_exact_match(self):
        transcript = "We need to add authentication to the system."
        citation = "We need to add authentication to the system."
        score = _fuzzy_find_citation(citation, transcript)
        assert score >= 0.9

    def test_partial_match(self):
        transcript = "Sarah said we need to add authentication to the system for security."
        citation = "we need to add authentication"
        score = _fuzzy_find_citation(citation, transcript)
        assert score >= 0.5

    def test_case_insensitive(self):
        transcript = "We NEED to add AUTHENTICATION."
        citation = "we need to add authentication"
        score = _fuzzy_find_citation(citation, transcript)
        assert score >= 0.5

    def test_not_found_returns_low(self):
        transcript = "The weather is nice today."
        citation = "We need to add a database migration tool."
        score = _fuzzy_find_citation(citation, transcript)
        assert score < 0.3

    def test_empty_citation(self):
        score = _fuzzy_find_citation("", "some transcript text")
        assert score == 0.0

    def test_empty_transcript(self):
        score = _fuzzy_find_citation("some citation", "")
        assert score == 0.0

    def test_both_empty(self):
        score = _fuzzy_find_citation("", "")
        assert score == 0.0

    def test_near_verbatim(self):
        transcript = "**Mike:** We should use JWT tokens for the API."
        citation = "We should use JWT tokens for the API"
        score = _fuzzy_find_citation(citation, transcript)
        assert score >= 0.7
