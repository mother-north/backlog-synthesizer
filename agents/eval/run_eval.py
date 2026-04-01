"""Evaluation pipeline entry point — run the system against golden scenarios and score."""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import os
import sys
from typing import Any

# Ensure agents directory is on the path
_AGENTS_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _AGENTS_DIR not in sys.path:
    sys.path.insert(0, _AGENTS_DIR)

from dotenv import load_dotenv
load_dotenv()

from eval.scorers import score_scenario
from eval.report import ScenarioResult, aggregate_results, save_report, EvalReport

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

GOLDEN_DIR = os.path.join(os.path.dirname(_AGENTS_DIR), "data", "golden")


def load_golden(path: str) -> dict:
    """Load a golden scenario JSON file."""
    with open(path, "r") as f:
        return json.load(f)


async def run_pipeline_for_eval(golden: dict) -> dict:
    """
    Run the agent pipeline on a golden scenario's inputs and collect the output.

    In eval mode we feed the transcript, architecture, and backlog directly
    into the pipeline agents rather than going through the DB. The pipeline
    agents are invoked sequentially.
    """
    from pipeline.parser import parser_agent
    from pipeline.retriever import retriever_agent
    from pipeline.crossref import crossref_agent
    from pipeline.synthesizer import synthesizer_agent
    from pipeline.validator import validator_agent

    inputs = golden.get("inputs", {})
    meeting_id = golden.get("scenario_id", 0)

    # Read transcript from file path if provided
    transcript = inputs.get("transcript", "")
    if not transcript and inputs.get("meeting"):
        meeting_path = inputs["meeting"]
        # Resolve relative to project root
        project_root = os.path.dirname(_AGENTS_DIR)
        abs_path = os.path.join(project_root, meeting_path) if not os.path.isabs(meeting_path) else meeting_path
        if os.path.exists(abs_path):
            with open(abs_path, "r") as f:
                transcript = f.read()
        else:
            logger.warning("Meeting file not found: %s", abs_path)

    # Read architecture from file if provided
    arch_content = inputs.get("architecture_content", "")
    if not arch_content and inputs.get("architecture"):
        arch_path = inputs["architecture"]
        project_root = os.path.dirname(_AGENTS_DIR)
        abs_path = os.path.join(project_root, arch_path) if not os.path.isabs(arch_path) else arch_path
        if os.path.exists(abs_path):
            with open(abs_path, "r") as f:
                arch_content = f.read()

    # Read backlog from file if provided
    backlog_items = inputs.get("backlog_items", [])
    if not backlog_items and inputs.get("backlog"):
        backlog_path = inputs["backlog"]
        project_root = os.path.dirname(_AGENTS_DIR)
        abs_path = os.path.join(project_root, backlog_path) if not os.path.isabs(backlog_path) else backlog_path
        if os.path.exists(abs_path):
            with open(abs_path, "r") as f:
                backlog_items = json.load(f)

    # We need the transcript in the DB for tools that read it.
    from tools.db import execute_write, execute_query_one
    try:
        row = execute_query_one("SELECT id FROM meetings WHERE id = %s", (meeting_id,))
        if row is None:
            execute_write(
                """
                INSERT INTO meetings (id, title, transcript, status)
                VALUES (%s, %s, %s, 'processing')
                """,
                (meeting_id, golden.get("description", f"Eval scenario {meeting_id}"), transcript),
            )
        else:
            execute_write(
                "UPDATE meetings SET transcript = %s, status = 'processing' WHERE id = %s",
                (transcript, meeting_id),
            )
    except Exception as e:
        logger.warning("Could not insert eval meeting into DB: %s", e)

    # Similarly insert backlog items if provided
    if backlog_items:
        try:
            # Clear existing for this eval run and re-insert
            for item in backlog_items:
                execute_write(
                    """
                    INSERT INTO backlog_items (external_id, type, title, description, status, epic_id, priority, labels, acceptance_criteria, dependencies)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT DO NOTHING
                    """,
                    (
                        item.get("id"), item.get("type", "story"), item.get("title", ""),
                        item.get("description"), item.get("status", "backlog"),
                        item.get("epic_id"), item.get("priority", "medium"),
                        json.dumps(item.get("labels", [])),
                        json.dumps(item.get("acceptance_criteria", [])),
                        json.dumps(item.get("dependencies", [])),
                    ),
                )
        except Exception as e:
            logger.warning("Could not insert eval backlog: %s", e)

    # Insert architecture doc if provided
    if arch_content:
        try:
            execute_write(
                """
                INSERT INTO architecture_docs (file_name, content, version)
                VALUES ('eval_arch.md', %s, 1)
                ON CONFLICT DO NOTHING
                """,
                (arch_content,),
            )
        except Exception as e:
            logger.warning("Could not insert eval architecture: %s", e)

    # Run pipeline sequentially
    state: dict[str, Any] = {
        "meeting_id": meeting_id,
        "transcript": transcript,
        "requirements": [],
        "context": {},
        "checks": [],
        "candidate_stories": [],
        "epic_proposals": [],
        "meeting_quality": None,
        "validation_results": [],
        "review_decisions": [],
        "memo": None,
        "errors": [],
    }

    # Agent 1: Parser
    logger.info("  [Eval] Running parser...")
    result = await parser_agent(state)
    state.update(result)

    # Agent 2: Retriever
    logger.info("  [Eval] Running retriever...")
    result = await retriever_agent(state)
    state.update(result)

    # Agent 3: Cross-reference
    logger.info("  [Eval] Running crossref...")
    result = await crossref_agent(state)
    state.update(result)

    # Agent 4: Synthesizer
    logger.info("  [Eval] Running synthesizer...")
    result = await synthesizer_agent(state)
    state.update(result)

    # Agent 5: Validator
    logger.info("  [Eval] Running validator...")
    result = await validator_agent(state)
    state.update(result)

    # Collect output in the format scorers expect
    stories = [s.model_dump(mode="json") if hasattr(s, "model_dump") else s
               for s in state.get("candidate_stories", [])]
    checks = [c.model_dump(mode="json") if hasattr(c, "model_dump") else c
              for c in state.get("checks", [])]
    mq = state.get("meeting_quality")
    meeting_quality = mq.model_dump(mode="json") if mq and hasattr(mq, "model_dump") else (mq or {})

    return {
        "stories": stories,
        "checks": checks,
        "transcript": state.get("transcript", ""),
        "meeting_quality": meeting_quality,
        "hygiene_flags": [],  # collected from DB if needed
    }


async def run_evaluation(scenario_paths: list[str] | None = None, verbose: bool = False) -> EvalReport:
    """
    Run evaluation on golden scenarios.

    Args:
        scenario_paths: list of scenario file paths.
                        Default: all files in data/golden/
        verbose: if True, print per-story scores

    Returns:
        EvalReport with per-scenario and aggregate scores
    """
    if scenario_paths is None:
        if os.path.isdir(GOLDEN_DIR):
            scenario_paths = sorted([
                os.path.join(GOLDEN_DIR, f)
                for f in os.listdir(GOLDEN_DIR)
                if f.endswith(".json")
            ])
        else:
            logger.error("Golden directory not found: %s", GOLDEN_DIR)
            return aggregate_results([])

    results: list[ScenarioResult] = []

    for path in scenario_paths:
        logger.info("Running scenario: %s", path)
        try:
            golden = load_golden(path)
        except Exception as e:
            logger.error("Failed to load scenario %s: %s", path, e)
            continue

        # Run pipeline
        try:
            system_output = await run_pipeline_for_eval(golden)
        except Exception as e:
            logger.error("Pipeline failed for scenario %s: %s", path, e)
            system_output = {"stories": [], "checks": [], "transcript": "", "meeting_quality": {}}

        # Score
        try:
            scores = await score_scenario(system_output, golden.get("expected_output", {}))
        except Exception as e:
            logger.error("Scoring failed for scenario %s: %s", path, e)
            scores = {}

        results.append(ScenarioResult(
            scenario_id=str(golden.get("scenario_id", os.path.basename(path))),
            description=golden.get("description", ""),
            scores=scores,
            system_output=system_output,
            golden_expected=golden.get("expected_output", {}),
        ))

        if verbose:
            logger.info("  Scores: %s", json.dumps(scores, indent=2, default=str))

    # Aggregate
    report = aggregate_results(results)

    # Save
    report_path = save_report(report)
    logger.info("Eval report saved to: %s", report_path)
    logger.info("Overall status: %s", report.overall_status)
    if report.failures:
        logger.warning("Failures: %s", report.failures)
    if report.warnings:
        logger.info("Warnings: %s", report.warnings)

    return report


def main():
    parser = argparse.ArgumentParser(description="Run Backlog Synthesizer evaluation pipeline")
    parser.add_argument(
        "--scenarios", nargs="*",
        help="Paths to golden scenario JSON files. Default: all in data/golden/",
    )
    parser.add_argument("--verbose", action="store_true", help="Show per-story scores")
    args = parser.parse_args()

    asyncio.run(run_evaluation(scenario_paths=args.scenarios, verbose=args.verbose))


if __name__ == "__main__":
    main()
