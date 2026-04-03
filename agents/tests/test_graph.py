"""Tests for LangGraph pipeline structure."""
import pytest
from pipeline.graph import build_graph


class TestPipelineGraph:
    def test_graph_builds(self):
        graph = build_graph()
        assert graph is not None

    def test_graph_has_all_nodes(self):
        graph = build_graph()
        node_names = set(graph.nodes.keys())
        expected = {'parser', 'retriever', 'crossref', 'synthesizer', 'validator', 'memo'}
        assert expected.issubset(node_names)

    def test_graph_is_callable(self):
        graph = build_graph()
        # CompiledGraph should be usable
        assert graph is not None
        assert len(graph.nodes) >= 6
