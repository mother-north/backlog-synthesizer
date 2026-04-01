"""Backlog reader — abstract interface + PG implementation."""

from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Optional

from tools.db import execute_query

logger = logging.getLogger(__name__)


@dataclass
class BacklogItem:
    id: str  # e.g. ERIS-001
    type: str  # epic | story | bug | improvement | task
    title: str
    description: Optional[str] = None
    status: str = "backlog"  # backlog | in_progress | done | blocked
    epic_id: Optional[str] = None
    priority: str = "medium"  # critical | high | medium | low
    labels: list[str] = field(default_factory=list)
    acceptance_criteria: list[str] = field(default_factory=list)
    dependencies: list[str] = field(default_factory=list)


class IBacklogSource(ABC):
    """Abstract interface for backlog data access."""

    @abstractmethod
    def get_all_items(self) -> list[BacklogItem]:
        ...

    @abstractmethod
    def get_epics(self) -> list[BacklogItem]:
        ...

    @abstractmethod
    def get_items_by_epic(self, epic_id: str) -> list[BacklogItem]:
        ...

    @abstractmethod
    def search(self, query: str, limit: int = 10) -> list[BacklogItem]:
        ...


class PgBacklogSource(IBacklogSource):
    """Reads backlog items from PostgreSQL backlog_items table."""

    def _row_to_item(self, row: dict) -> BacklogItem:
        return BacklogItem(
            id=row.get("external_id") or str(row.get("id", "")),
            type=row.get("type", "story"),
            title=row.get("title", ""),
            description=row.get("description"),
            status=row.get("status", "backlog"),
            epic_id=row.get("epic_id"),
            priority=row.get("priority", "medium"),
            labels=row.get("labels") or [],
            acceptance_criteria=row.get("acceptance_criteria") or [],
            dependencies=row.get("dependencies") or [],
        )

    def get_all_items(self) -> list[BacklogItem]:
        rows = execute_query("SELECT * FROM backlog_items ORDER BY id")
        return [self._row_to_item(r) for r in rows]

    def get_epics(self) -> list[BacklogItem]:
        rows = execute_query(
            "SELECT * FROM backlog_items WHERE type = 'epic' ORDER BY id"
        )
        return [self._row_to_item(r) for r in rows]

    def get_items_by_epic(self, epic_id: str) -> list[BacklogItem]:
        rows = execute_query(
            "SELECT * FROM backlog_items WHERE epic_id = %s ORDER BY id",
            (epic_id,),
        )
        return [self._row_to_item(r) for r in rows]

    def search(self, query: str, limit: int = 10) -> list[BacklogItem]:
        """Search backlog items using trigram similarity on title + description."""
        rows = execute_query(
            """
            SELECT *,
                   GREATEST(
                       similarity(title, %(q)s),
                       similarity(COALESCE(description, ''), %(q)s)
                   ) AS sim
            FROM backlog_items
            WHERE similarity(title, %(q)s) > 0.1
               OR similarity(COALESCE(description, ''), %(q)s) > 0.1
            ORDER BY sim DESC
            LIMIT %(limit)s
            """,
            {"q": query, "limit": limit},
        )
        return [self._row_to_item(r) for r in rows]
