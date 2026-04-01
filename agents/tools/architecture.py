"""Architecture document reader — abstract interface + PG implementation."""

from __future__ import annotations

import logging
import re
from abc import ABC, abstractmethod
from dataclasses import dataclass, field

from tools.db import execute_query, execute_query_one

logger = logging.getLogger(__name__)


@dataclass
class ArchitectureSection:
    title: str
    content: str
    components: list[str] = field(default_factory=list)


@dataclass
class Constraint:
    description: str
    component: str
    source_text: str


class IArchitectureSource(ABC):
    """Abstract interface — agents depend on this, never on the implementation."""

    @abstractmethod
    def get_full_doc(self) -> str:
        ...

    @abstractmethod
    def get_sections(self) -> list[ArchitectureSection]:
        ...

    @abstractmethod
    def get_constraints(self) -> list[Constraint]:
        ...


class PgArchitectureSource(IArchitectureSource):
    """Reads architecture doc from PostgreSQL architecture_docs table."""

    # ---- interface methods ----

    def get_full_doc(self) -> str:
        row = execute_query_one(
            "SELECT content FROM architecture_docs ORDER BY uploaded_at DESC LIMIT 1"
        )
        return row["content"] if row else ""

    def get_sections(self) -> list[ArchitectureSection]:
        doc = self.get_full_doc()
        if not doc:
            return []
        return self._split_into_sections(doc)

    def get_constraints(self) -> list[Constraint]:
        doc = self.get_full_doc()
        if not doc:
            return []
        return self._extract_constraints(doc)

    # ---- helpers ----

    @staticmethod
    def _split_into_sections(doc: str) -> list[ArchitectureSection]:
        """Split a markdown document by ## headings."""
        sections: list[ArchitectureSection] = []
        current_title = "Introduction"
        current_lines: list[str] = []

        for line in doc.splitlines():
            heading_match = re.match(r"^##\s+(.+)", line)
            if heading_match:
                if current_lines:
                    content = "\n".join(current_lines).strip()
                    sections.append(
                        ArchitectureSection(
                            title=current_title,
                            content=content,
                            components=PgArchitectureSource._extract_components(content),
                        )
                    )
                current_title = heading_match.group(1).strip()
                current_lines = []
            else:
                current_lines.append(line)

        if current_lines:
            content = "\n".join(current_lines).strip()
            sections.append(
                ArchitectureSection(
                    title=current_title,
                    content=content,
                    components=PgArchitectureSource._extract_components(content),
                )
            )
        return sections

    @staticmethod
    def _extract_components(text: str) -> list[str]:
        """Heuristic: find capitalised compound names or known keywords."""
        component_keywords = [
            "database", "api", "frontend", "backend", "auth", "queue",
            "cache", "storage", "gateway", "service", "engine", "worker",
            "scheduler", "pipeline", "vector", "embedding",
        ]
        found = set()
        lower = text.lower()
        for kw in component_keywords:
            if kw in lower:
                found.add(kw)
        return sorted(found)

    @staticmethod
    def _extract_constraints(doc: str) -> list[Constraint]:
        """Extract lines that look like constraints (must / shall / cannot / limit)."""
        constraints: list[Constraint] = []
        constraint_patterns = re.compile(
            r"(?i)(must|shall|cannot|must not|should not|limit|constraint|require)"
        )
        for line in doc.splitlines():
            line = line.strip()
            if constraint_patterns.search(line) and len(line) > 20:
                components = PgArchitectureSource._extract_components(line)
                constraints.append(
                    Constraint(
                        description=line,
                        component=components[0] if components else "general",
                        source_text=line,
                    )
                )
        return constraints
