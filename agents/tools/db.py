"""Database connection helper using psycopg2 connection pool."""

from __future__ import annotations

import os
import logging
from contextlib import contextmanager
from typing import Any, Generator, Optional

import psycopg2
import psycopg2.pool
import psycopg2.extras
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

_pool: Optional[psycopg2.pool.ThreadedConnectionPool] = None


def _get_dsn() -> dict[str, Any]:
    return {
        "host": os.getenv("PG_HOST", "localhost"),
        "port": int(os.getenv("PG_PORT", "5432")),
        "dbname": os.getenv("PG_DATABASE", "backlog_synthesizer_db"),
        "user": os.getenv("PG_USER", "postgres"),
        "password": os.getenv("PG_PASSWORD", ""),
        "sslmode": "require" if os.getenv("PG_SSL", "false").lower() == "true" else "prefer",
    }


def get_pool() -> psycopg2.pool.ThreadedConnectionPool:
    """Return (and lazily create) the global connection pool."""
    global _pool
    if _pool is None or _pool.closed:
        dsn = _get_dsn()
        logger.info("Creating PG connection pool -> %s:%s/%s", dsn["host"], dsn["port"], dsn["dbname"])
        _pool = psycopg2.pool.ThreadedConnectionPool(minconn=2, maxconn=10, **dsn)
    return _pool


def close_pool() -> None:
    global _pool
    if _pool and not _pool.closed:
        _pool.closeall()
        _pool = None


@contextmanager
def get_connection() -> Generator:
    """Yield a connection from the pool, returning it on exit."""
    pool = get_pool()
    conn = pool.getconn()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        pool.putconn(conn)


def execute_query(sql: str, params: tuple | list | None = None) -> list[dict]:
    """Execute a SELECT and return rows as list of dicts."""
    with get_connection() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql, params)
            return [dict(row) for row in cur.fetchall()]


def execute_query_one(sql: str, params: tuple | list | None = None) -> Optional[dict]:
    """Execute a SELECT and return a single row or None."""
    rows = execute_query(sql, params)
    return rows[0] if rows else None


def execute_write(sql: str, params: tuple | list | None = None) -> Optional[int]:
    """Execute an INSERT/UPDATE/DELETE. Returns lastrowid for INSERT RETURNING id."""
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            try:
                row = cur.fetchone()
                return row[0] if row else None
            except psycopg2.ProgrammingError:
                return None


def get_dsn_string() -> str:
    """Return a libpq-compatible connection string for libraries that need it."""
    d = _get_dsn()
    return (
        f"host={d['host']} port={d['port']} dbname={d['dbname']} "
        f"user={d['user']} password={d['password']} sslmode={d['sslmode']}"
    )
