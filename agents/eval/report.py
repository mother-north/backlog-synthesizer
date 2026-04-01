"""Generate evaluation report JSON."""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from typing import Any


# ---------------------------------------------------------------------------
# Pass/fail thresholds
# ---------------------------------------------------------------------------
THRESHOLDS = {
    "M1_story_completeness": {"pass": 0.85, "acceptable": 0.70},
    "M2_story_quality": {"pass": 4.0, "acceptable": 3.5},
    "M3_tag_f1": {"pass": 0.75, "acceptable": 0.60},
    "M4_epic_accuracy": {"pass": 0.80, "acceptable": 0.60},
    "M5_check_precision": {"pass": 0.70, "acceptable": 0.50},
    "M5_check_recall": {"pass": 0.70, "acceptable": 0.50},
    "M6_conflict_f1": {"pass": 0.65, "acceptable": 0.45},
    "M7_grounding": {"pass": 0.90, "acceptable": 0.80},
    "M9_hygiene_precision": {"pass": 0.70, "acceptable": 0.50},
}


def _status_for(metric: str, value: float | None) -> str:
    """Determine pass/acceptable/fail for a numeric metric."""
    if value is None:
        return "n/a"
    th = THRESHOLDS.get(metric)
    if not th:
        return "pass"
    if value >= th["pass"]:
        return "pass"
    if value >= th["acceptable"]:
        return "acceptable"
    return "fail"


# ---------------------------------------------------------------------------
# Report data structures
# ---------------------------------------------------------------------------

@dataclass
class ScenarioResult:
    scenario_id: str
    description: str = ""
    scores: dict = field(default_factory=dict)
    system_output: dict = field(default_factory=dict)
    golden_expected: dict = field(default_factory=dict)


@dataclass
class EvalReport:
    run_id: str = ""
    timestamp: str = ""
    scenarios_run: int = 0
    per_scenario: list[dict] = field(default_factory=list)
    aggregate: dict = field(default_factory=dict)
    overall_status: str = "pass"
    failures: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


def _add_status(scores: dict) -> dict:
    """Add status fields to each metric in the scores dict."""
    enriched = {}
    for key, val in scores.items():
        entry = dict(val) if isinstance(val, dict) else {"value": val}
        score_val = entry.get("score")
        if "status" not in entry:
            entry["status"] = _status_for(key, score_val)
        enriched[key] = entry
    return enriched


def aggregate_results(results: list[ScenarioResult]) -> EvalReport:
    """Aggregate per-scenario results into a full evaluation report."""
    now = datetime.now(timezone.utc)
    run_id = f"eval_{now.strftime('%Y%m%d_%H%M%S')}"

    per_scenario = []
    metric_values: dict[str, list[float]] = {}

    for r in results:
        enriched = _add_status(r.scores)
        per_scenario.append({
            "scenario_id": r.scenario_id,
            "description": r.description,
            "scores": enriched,
        })

        for key, val in enriched.items():
            if isinstance(val, dict) and "score" in val and val["score"] is not None:
                metric_values.setdefault(key, []).append(val["score"])

    # Aggregate averages
    aggregate = {}
    failures = []
    warnings = []

    for key, values in metric_values.items():
        avg = sum(values) / len(values) if values else None
        status = _status_for(key, avg)
        aggregate[key] = {"avg": round(avg, 3) if avg is not None else None, "status": status}
        if status == "fail":
            failures.append(f"{key} aggregate is {avg:.2f} — below threshold")
        elif status == "acceptable":
            warnings.append(f"{key} aggregate is 'acceptable' ({avg:.2f}) — consider improvement")

    # Special metrics (M8, M10 — status-based, not numeric)
    for status_key in ["M8_calibration", "M10_quality_score"]:
        statuses = []
        for r in results:
            s = r.scores.get(status_key, {})
            statuses.append(s.get("status", "n/a"))
        pass_count = statuses.count("pass")
        aggregate[status_key] = {
            "status": "pass" if pass_count >= len(statuses) / 2 else "fail",
            "pass_count": pass_count,
            "total": len(statuses),
        }

    overall = "pass" if not failures else "fail"

    return EvalReport(
        run_id=run_id,
        timestamp=now.isoformat(),
        scenarios_run=len(results),
        per_scenario=per_scenario,
        aggregate=aggregate,
        overall_status=overall,
        failures=failures,
        warnings=warnings,
    )


def save_report(report: EvalReport, output_dir: str = "data/eval_reports") -> str:
    """Save the report as JSON and return the file path."""
    os.makedirs(output_dir, exist_ok=True)
    filename = f"{report.run_id}.json"
    path = os.path.join(output_dir, filename)

    with open(path, "w") as f:
        json.dump(asdict(report), f, indent=2, default=str)

    return path
