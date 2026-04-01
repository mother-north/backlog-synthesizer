"""Knowledge Base — PostgreSQL + pgvector read/write operations."""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from typing import Optional

import numpy as np
from openai import OpenAI

from tools.db import execute_query, execute_write, get_connection

logger = logging.getLogger(__name__)

# Lazy singleton
_openai_client: Optional[OpenAI] = None


def _get_openai() -> OpenAI:
    global _openai_client
    if _openai_client is None:
        _openai_client = OpenAI()
    return _openai_client


EMBEDDING_MODEL = "text-embedding-3-small"
EMBEDDING_DIM = 1536


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass
class KBResult:
    content_type: str  # meeting_summary | decision | story | architecture
    content_text: str
    similarity: float
    metadata: dict = field(default_factory=dict)


@dataclass
class Decision:
    id: int
    meeting_id: int
    story_id: Optional[int]
    decision_type: str  # confirmed | rejected | modified | epic_approved
    rationale: str
    decided_by: Optional[int] = None
    created_at: str = ""


@dataclass
class FeedbackResult:
    decision_type: str  # rejected | modified
    rationale: str
    original_story_title: str
    meeting_id: int
    similarity: float = 0.0


# ---------------------------------------------------------------------------
# Embedding helpers
# ---------------------------------------------------------------------------

def embed_text(text: str) -> list[float]:
    """Generate embedding using OpenAI text-embedding-3-small."""
    resp = _get_openai().embeddings.create(
        input=text,
        model=EMBEDDING_MODEL,
    )
    return resp.data[0].embedding


def _vec_literal(vec: list[float]) -> str:
    """Format a vector as a pgvector literal string."""
    return "[" + ",".join(f"{v:.8f}" for v in vec) + "]"


# ---------------------------------------------------------------------------
# KnowledgeBase
# ---------------------------------------------------------------------------

class KnowledgeBase:
    """Read/write to the knowledge base (PostgreSQL + pgvector)."""

    # ---- Read operations (Agent 2 / Retriever) ----

    def search_similar(
        self,
        query: str,
        content_types: Optional[list[str]] = None,
        limit: int = 10,
    ) -> list[KBResult]:
        """Semantic search via pgvector cosine similarity."""
        query_emb = embed_text(query)
        vec_str = _vec_literal(query_emb)

        type_filter = ""
        params: dict = {"limit": limit}
        if content_types:
            placeholders = ", ".join(f"'{ct}'" for ct in content_types)
            type_filter = f"AND content_type IN ({placeholders})"

        rows = execute_query(
            f"""
            SELECT content_type, content_text, metadata,
                   1 - (embedding <=> %(vec)s::vector) AS similarity
            FROM kb_embeddings
            WHERE 1=1 {type_filter}
            ORDER BY embedding <=> %(vec)s::vector
            LIMIT %(limit)s
            """,
            {"vec": vec_str, "limit": limit},
        )
        results = []
        for r in rows:
            results.append(
                KBResult(
                    content_type=r["content_type"],
                    content_text=r["content_text"],
                    similarity=float(r["similarity"]),
                    metadata=r["metadata"] if isinstance(r["metadata"], dict) else {},
                )
            )
        return results

    def search_decisions(
        self,
        keywords: list[str],
        meeting_ids: Optional[list[int]] = None,
    ) -> list[Decision]:
        """Search prior decisions by keywords, optionally scoped to meetings."""
        conditions = []
        params: dict = {}
        if keywords:
            kw_clauses = []
            for i, kw in enumerate(keywords):
                key = f"kw{i}"
                kw_clauses.append(f"(d.rationale ILIKE %({key})s OR s.title ILIKE %({key})s)")
                params[key] = f"%{kw}%"
            conditions.append("(" + " OR ".join(kw_clauses) + ")")

        if meeting_ids:
            placeholders = ", ".join(str(int(m)) for m in meeting_ids)
            conditions.append(f"d.meeting_id IN ({placeholders})")

        where = "WHERE " + " AND ".join(conditions) if conditions else ""

        rows = execute_query(
            f"""
            SELECT d.id, d.meeting_id, d.story_id, d.decision_type,
                   d.rationale, d.decided_by,
                   d.created_at::text AS created_at
            FROM decisions d
            LEFT JOIN stories s ON d.story_id = s.id
            {where}
            ORDER BY d.created_at DESC
            LIMIT 20
            """,
            params,
        )
        return [
            Decision(
                id=r["id"],
                meeting_id=r["meeting_id"],
                story_id=r["story_id"],
                decision_type=r["decision_type"],
                rationale=r["rationale"] or "",
                decided_by=r["decided_by"],
                created_at=r["created_at"] or "",
            )
            for r in rows
        ]

    def search_feedback(
        self,
        story_title: str,
        story_type: str,
    ) -> list[FeedbackResult]:
        """Search prior rejections/modifications for similar stories."""
        rows = execute_query(
            """
            SELECT d.decision_type, d.rationale, s.title AS original_story_title,
                   d.meeting_id,
                   similarity(s.title, %(title)s) AS sim
            FROM decisions d
            JOIN stories s ON d.story_id = s.id
            WHERE d.decision_type IN ('rejected', 'modified')
              AND (similarity(s.title, %(title)s) > 0.2
                   OR s.type = %(stype)s)
            ORDER BY sim DESC
            LIMIT 10
            """,
            {"title": story_title, "stype": story_type},
        )
        return [
            FeedbackResult(
                decision_type=r["decision_type"],
                rationale=r["rationale"] or "",
                original_story_title=r["original_story_title"],
                meeting_id=r["meeting_id"],
                similarity=float(r.get("sim", 0)),
            )
            for r in rows
        ]

    def full_text_search(
        self,
        query: str,
        table: str = "meetings",
    ) -> list[dict]:
        """PostgreSQL full-text search on raw transcripts/memos."""
        if table == "meetings":
            rows = execute_query(
                """
                SELECT id, title, ts_rank(transcript_tsvector, plainto_tsquery(%(q)s)) AS rank
                FROM meetings
                WHERE transcript_tsvector @@ plainto_tsquery(%(q)s)
                ORDER BY rank DESC
                LIMIT 10
                """,
                {"q": query},
            )
        elif table == "memos":
            rows = execute_query(
                """
                SELECT id, meeting_id,
                       ts_rank(to_tsvector('english', content), plainto_tsquery(%(q)s)) AS rank
                FROM memos
                WHERE to_tsvector('english', content) @@ plainto_tsquery(%(q)s)
                ORDER BY rank DESC
                LIMIT 10
                """,
                {"q": query},
            )
        else:
            rows = []
        return rows

    # ---- Write operations (Agent 6 / Memo) ----

    def store_meeting_summary(self, meeting_id: int, summary: str) -> None:
        """Store meeting summary with embedding in kb_embeddings."""
        emb = embed_text(summary)
        execute_write(
            """
            INSERT INTO kb_embeddings (content_type, content_id, content_text, embedding, metadata)
            VALUES ('meeting_summary', %(mid)s, %(text)s, %(emb)s::vector,
                    %(meta)s::jsonb)
            """,
            {
                "mid": meeting_id,
                "text": summary,
                "emb": _vec_literal(emb),
                "meta": json.dumps({"meeting_id": meeting_id}),
            },
        )

    def store_decisions(self, decisions: list[dict]) -> None:
        """Store confirmed decisions with embeddings."""
        for dec in decisions:
            text = f"{dec.get('decision_type', '')}: {dec.get('rationale', '')}"
            emb = embed_text(text)
            execute_write(
                """
                INSERT INTO kb_embeddings (content_type, content_id, content_text, embedding, metadata)
                VALUES ('decision', %(cid)s, %(text)s, %(emb)s::vector,
                        %(meta)s::jsonb)
                """,
                {
                    "cid": dec.get("id", 0),
                    "text": text,
                    "emb": _vec_literal(emb),
                    "meta": json.dumps({
                        "meeting_id": dec.get("meeting_id"),
                        "decision_type": dec.get("decision_type"),
                    }),
                },
            )

    def store_story_embedding(self, story_id: int, story_text: str) -> None:
        """Store story text with embedding for future retrieval."""
        emb = embed_text(story_text)
        execute_write(
            """
            INSERT INTO kb_embeddings (content_type, content_id, content_text, embedding, metadata)
            VALUES ('story', %(sid)s, %(text)s, %(emb)s::vector,
                    %(meta)s::jsonb)
            """,
            {
                "sid": story_id,
                "text": story_text,
                "emb": _vec_literal(emb),
                "meta": json.dumps({"story_id": story_id}),
            },
        )
