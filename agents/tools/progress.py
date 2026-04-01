"""Pipeline progress tracking — writes directly to DB."""

import json
import logging

from tools.db import execute_write, execute_query_one

logger = logging.getLogger(__name__)

_AGENT_ORDER = ["parser", "retriever", "crossref", "synthesizer", "validator"]


def update_progress(meeting_id: int, agent_name: str, status: str, message: str = ""):
    """Update pipeline progress for a specific agent step."""
    try:
        row = execute_query_one("SELECT pipeline_progress FROM meetings WHERE id = %s", (meeting_id,))
        current = row.get("pipeline_progress") if row else None
        if not current or not isinstance(current, list):
            current = [{"agent": a, "status": "pending", "message": ""} for a in _AGENT_ORDER]

        for step in current:
            if step.get("agent") == agent_name:
                step["status"] = status
                step["message"] = message
                break

        execute_write(
            "UPDATE meetings SET pipeline_progress = %s::jsonb WHERE id = %s",
            (json.dumps(current), meeting_id),
        )
    except Exception as e:
        logger.warning("Progress update failed for %s/%s: %s", meeting_id, agent_name, e)
