"""Scoring functions implementing rubrics R1-R9 from scoring_rubric.md."""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from statistics import mean
from typing import Optional

from difflib import SequenceMatcher

from eval.matchers import (
    Match, match_stories, normalize_tags, precision_recall_f1,
    find_story_match, find_check, fuzzy_find_citation, fuzzy_match,
)
from eval.llm_judge import llm_judge

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Score dataclasses
# ---------------------------------------------------------------------------

@dataclass
class M1Score:
    """R1: Story Extraction Completeness."""
    matched: int = 0
    partial: int = 0
    missing: int = 0
    extra: int = 0
    total_golden: int = 0
    score: float = 0.0


@dataclass
class M2Score:
    """R2: Story Quality (LLM-as-Judge)."""
    per_story: list[dict] = field(default_factory=list)
    avg_clarity: float = 0.0
    avg_actionability: float = 0.0
    avg_completeness: float = 0.0
    avg_criteria: float = 0.0
    overall: float = 0.0


@dataclass
class M3Score:
    """R3: Feature Tag F1."""
    avg_f1: float = 0.0
    per_story: list[float] = field(default_factory=list)


@dataclass
class M4Score:
    """R4: Epic Assignment Accuracy."""
    correct: int = 0
    total: int = 0
    score: float = 0.0


@dataclass
class M5Score:
    """R5: Check Detection Precision/Recall."""
    tp: int = 0
    fp: int = 0
    fn: int = 0
    precision: float = 0.0
    recall: float = 0.0
    f1: float = 0.0


@dataclass
class M7Score:
    """R6: Grounding Verification."""
    valid: int = 0
    paraphrase: int = 0
    not_found: int = 0
    score: float = 0.0


@dataclass
class M8Score:
    """R7: Confidence Calibration."""
    is_monotonic: bool = False
    details: dict = field(default_factory=dict)
    status: str = "fail"


@dataclass
class M9Score:
    """R8: Backlog Hygiene Precision."""
    tp: int = 0
    fp: int = 0
    fn: int = 0
    precision: float = 0.0


@dataclass
class M10Score:
    """R9: Meeting Quality."""
    ambiguity_delta: int = 0
    actionability_match: bool = False
    status: str = "fail"


# ---------------------------------------------------------------------------
# R1: Story Extraction Completeness (M1)
# ---------------------------------------------------------------------------

def score_story_extraction(
    system_stories: list[dict],
    golden_stories: list[dict],
) -> tuple[M1Score, list[Match]]:
    """Match system stories to golden by semantic similarity."""
    matches = match_stories(golden_stories, system_stories)

    matched = len([m for m in matches if m.match_type == "full"])
    partial = len([m for m in matches if m.match_type == "partial"])
    missing = len([m for m in matches if m.match_type == "missing"])
    matched_system_count = len([m for m in matches if m.system is not None])
    extra = len(system_stories) - matched_system_count

    total = len(golden_stories)
    score = (matched + partial) / total if total > 0 else 1.0

    return M1Score(
        matched=matched,
        partial=partial,
        missing=missing,
        extra=extra,
        total_golden=total,
        score=score,
    ), matches


# ---------------------------------------------------------------------------
# R2: Story Quality (M2, LLM-as-Judge)
# ---------------------------------------------------------------------------

async def score_story_quality(system_stories: list[dict]) -> M2Score:
    """LLM evaluates each story on 4 dimensions."""
    scores: list[dict] = []
    for story in system_stories:
        try:
            result = await llm_judge(story)
            scores.append(result)
        except Exception as e:
            logger.warning("LLM judge failed for story %s: %s", story.get("title", "?"), e)
            scores.append({
                "clarity": {"score": 3, "rationale": "judge failed"},
                "actionability": {"score": 3, "rationale": "judge failed"},
                "completeness": {"score": 3, "rationale": "judge failed"},
                "acceptance_criteria": {"score": 3, "rationale": "judge failed"},
                "overall": 3.0,
            })

    if not scores:
        return M2Score()

    return M2Score(
        per_story=scores,
        avg_clarity=mean([s.get("clarity", {}).get("score", 3) for s in scores]),
        avg_actionability=mean([s.get("actionability", {}).get("score", 3) for s in scores]),
        avg_completeness=mean([s.get("completeness", {}).get("score", 3) for s in scores]),
        avg_criteria=mean([s.get("acceptance_criteria", {}).get("score", 3) for s in scores]),
        overall=mean([s.get("overall", 3.0) for s in scores]),
    )


# ---------------------------------------------------------------------------
# R3: Feature Tag F1 (M3)
# ---------------------------------------------------------------------------

def _fuzzy_tag_matches(sys_tags: set[str], gold_tags: set[str], threshold: float = 0.5) -> int:
    """Count how many gold tags have a fuzzy match in sys tags (ratio > threshold)."""
    matched = 0
    for gt in gold_tags:
        for st in sys_tags:
            if SequenceMatcher(None, gt, st).ratio() > threshold:
                matched += 1
                break
    return matched


def score_tags(matches: list[Match]) -> M3Score:
    """Fuzzy set comparison of tags per matched story pair."""
    f1s: list[float] = []
    for m in matches:
        if m.system and m.golden:
            sys_tags = normalize_tags(m.system.get("feature_tags", []))
            gold_tags = normalize_tags(m.golden.get("feature_tags", []))
            if gold_tags:  # only score if golden has tags
                # Fuzzy recall: fraction of gold tags matched by a system tag
                recall_hits = _fuzzy_tag_matches(sys_tags, gold_tags)
                recall = recall_hits / len(gold_tags) if gold_tags else 0.0
                # Fuzzy precision: fraction of system tags matched by a gold tag
                precision_hits = _fuzzy_tag_matches(gold_tags, sys_tags)
                precision = precision_hits / len(sys_tags) if sys_tags else 0.0
                f1 = (2 * precision * recall / (precision + recall)
                       if (precision + recall) > 0 else 0.0)
                f1s.append(f1)
    return M3Score(
        avg_f1=mean(f1s) if f1s else 0.0,
        per_story=f1s,
    )


# ---------------------------------------------------------------------------
# R4: Epic Assignment Accuracy (M4)
# ---------------------------------------------------------------------------

def _normalize_epic(epic: str) -> str:
    """Normalize epic assignment: 'ERIS-001 (existing)' → 'eris-001'."""
    epic = epic.lower().strip()
    # Remove "(existing)", "(proposed)", etc.
    epic = re.sub(r'\s*\(.*?\)\s*', '', epic).strip()
    return epic


def score_epic_accuracy(matches: list[Match]) -> M4Score:
    """Match on epic assignment (normalized)."""
    correct = 0
    total = 0
    for m in matches:
        if m.system and m.golden:
            total += 1
            sys_epic = _normalize_epic(
                m.system.get("epic_assignment", "") or
                m.system.get("epic_id", "") or
                str(m.system.get("proposed_epic", ""))
            )
            gold_epic = _normalize_epic(
                m.golden.get("epic_assignment", "") or
                m.golden.get("epic_id", "") or
                str(m.golden.get("proposed_epic", ""))
            )
            if sys_epic and gold_epic:
                if sys_epic == gold_epic or fuzzy_match(sys_epic, gold_epic) > 0.6:
                    correct += 1
    return M4Score(
        correct=correct,
        total=total,
        score=correct / total if total > 0 else 1.0,
    )


# ---------------------------------------------------------------------------
# R5: Check Detection (M5)
# ---------------------------------------------------------------------------

def score_checks(
    system_checks: list[dict],
    golden_checks: list[dict],
    story_matches: list[Match],
) -> M5Score:
    """Match checks by (story + check_type)."""
    tp = 0
    fn = 0
    matched_sys_checks: set[int] = set()

    for golden_check in golden_checks:
        g_type = golden_check.get("check_type", "")
        g_story_title = golden_check.get("story_title", "").lower()

        # Find any system check with matching type and related content
        found = False
        for i, sc in enumerate(system_checks):
            if i in matched_sys_checks:
                continue
            # Match check_type (handle pipe-separated)
            sc_type_parts = {p.strip() for p in sc.get("check_type", "").split("|")}
            if g_type not in sc_type_parts:
                continue
            # Match content: golden story_title vs system details/story_title
            sc_text = (sc.get("story_title", "") + " " + sc.get("details", "")).lower()
            if (fuzzy_match(g_story_title, sc_text) > 0.3 or
                any(w in sc_text for w in g_story_title.split() if len(w) > 4)):
                tp += 1
                matched_sys_checks.add(i)
                found = True
                break
        if not found:
            fn += 1

    fp = len(system_checks) - len(matched_sys_checks)
    precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
    recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
    f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0.0

    return M5Score(tp=tp, fp=fp, fn=fn, precision=precision, recall=recall, f1=f1)


# ---------------------------------------------------------------------------
# R5 variant: M6 — Conflict-type checks only
# ---------------------------------------------------------------------------

def score_conflict_checks(
    system_checks: list[dict],
    golden_checks: list[dict],
    story_matches: list[Match],
) -> M5Score:
    """F1 specifically for conflict-type checks (overlap, prior_decision, architecture)."""
    conflict_types = {"overlap", "duplicate", "prior_decision", "architecture"}
    sys_conflict = [c for c in system_checks
                    if any(p.strip() in conflict_types for p in c.get("check_type", "").split("|"))]
    gold_conflict = [c for c in golden_checks if c.get("check_type") in conflict_types]
    return score_checks(sys_conflict, gold_conflict, story_matches)


# ---------------------------------------------------------------------------
# R6: Grounding Verification (M7)
# ---------------------------------------------------------------------------

def score_grounding(system_stories: list[dict], transcript: str) -> M7Score:
    """Check that source citations exist in transcript."""
    results: list[str] = []
    for story in system_stories:
        citation = story.get("source_citation", "")
        sim = fuzzy_find_citation(citation, transcript)
        if sim >= 0.90:
            results.append("valid")
        elif sim >= 0.70:
            results.append("paraphrase")
        else:
            results.append("not_found")

    valid_count = results.count("valid")
    paraphrase_count = results.count("paraphrase")
    not_found_count = results.count("not_found")

    total = len(system_stories)
    score = (valid_count + paraphrase_count) / total if total > 0 else 1.0

    return M7Score(
        valid=valid_count,
        paraphrase=paraphrase_count,
        not_found=not_found_count,
        score=score,
    )


# ---------------------------------------------------------------------------
# R7: Confidence Calibration (M8)
# ---------------------------------------------------------------------------

def score_calibration(
    system_stories: list[dict],
    golden_stories: list[dict],
    matches: list[Match],
) -> M8Score:
    """
    Group stories by confidence, check that high > medium > low accuracy.
    """
    groups: dict[str, list[bool]] = {"high": [], "medium": [], "low": []}

    for m in matches:
        if m.system:
            conf = m.system.get("confidence", "medium")
            is_matched = m.match_type in ("full", "partial")
            if conf in groups:
                groups[conf].append(is_matched)

    accuracies = {}
    for level in ["high", "medium", "low"]:
        items = groups[level]
        if items:
            accuracies[level] = sum(items) / len(items)
        else:
            accuracies[level] = None

    # Check monotonic ordering
    vals = [accuracies.get(l) for l in ["high", "medium", "low"]]
    defined = [(l, v) for l, v in zip(["high", "medium", "low"], vals) if v is not None]

    # If only one confidence level exists, calibration is trivially satisfied
    if len(defined) <= 1:
        return M8Score(
            is_monotonic=True,
            details={"accuracies": accuracies},
            status="pass",
        )

    # Check for inversions: fail only if a lower confidence level is MORE
    # accurate than a higher one (high >= medium >= low expected)
    has_inversion = False
    for i in range(len(defined) - 1):
        if defined[i][1] < defined[i + 1][1]:
            has_inversion = True
            break

    is_monotonic = not has_inversion

    return M8Score(
        is_monotonic=is_monotonic,
        details={"accuracies": accuracies},
        status="pass" if is_monotonic else "fail",
    )


# ---------------------------------------------------------------------------
# R8: Backlog Hygiene (M9)
# ---------------------------------------------------------------------------

def score_hygiene(
    system_flags: list[dict],
    golden_flags: list[dict],
) -> M9Score:
    """Match system hygiene flags to golden by external_item_id."""
    golden_ids = {f.get("external_item_id", "") for f in golden_flags}
    system_ids = {f.get("external_item_id", "") for f in system_flags}

    tp = len(golden_ids & system_ids)
    fp = len(system_ids - golden_ids)
    fn = len(golden_ids - system_ids)

    # When both system and golden have 0 flags, the system correctly found
    # no issues — precision is perfect.
    if (tp + fp) == 0 and fn == 0:
        precision = 1.0
    else:
        precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0

    return M9Score(tp=tp, fp=fp, fn=fn, precision=precision)


# ---------------------------------------------------------------------------
# R9: Meeting Quality (M10)
# ---------------------------------------------------------------------------

def score_meeting_quality(
    system_quality: dict,
    golden_quality: dict,
) -> M10Score:
    """Direct comparison of numeric and categorical values."""
    sys_amb = system_quality.get("ambiguous_count", 0)
    gold_amb = golden_quality.get("ambiguous_count", 0)
    delta = abs(sys_amb - gold_amb)

    sys_act = system_quality.get("actionability_score", "medium")
    gold_act = golden_quality.get("actionability_score", "medium")
    act_match = sys_act == gold_act

    if delta <= 1 and act_match:
        status = "pass"
    elif delta <= 2 or act_match:
        status = "acceptable"
    else:
        status = "fail"

    return M10Score(
        ambiguity_delta=delta,
        actionability_match=act_match,
        status=status,
    )


# ---------------------------------------------------------------------------
# Aggregate scorer
# ---------------------------------------------------------------------------

async def score_scenario(
    system_output: dict,
    golden_expected: dict,
) -> dict:
    """
    Score a system output against golden expected output.
    Returns a dict of all metric scores.
    """
    sys_stories = system_output.get("stories", [])
    gold_stories = golden_expected.get("candidate_stories", golden_expected.get("stories", []))
    sys_checks = system_output.get("checks", [])
    gold_checks = golden_expected.get("checks", [])
    transcript = system_output.get("transcript", "")

    # R1: Story extraction
    m1, matches = score_story_extraction(sys_stories, gold_stories)

    # R2: Story quality
    m2 = await score_story_quality(sys_stories)

    # R3: Tag F1
    m3 = score_tags(matches)

    # R4: Epic accuracy
    m4 = score_epic_accuracy(matches)

    # R5: Check detection
    m5 = score_checks(sys_checks, gold_checks, matches)

    # M6: Conflict checks
    m6 = score_conflict_checks(sys_checks, gold_checks, matches)

    # R6/M7: Grounding
    m7 = score_grounding(sys_stories, transcript)

    # R7/M8: Calibration
    m8 = score_calibration(sys_stories, gold_stories, matches)

    # R8/M9: Hygiene
    sys_hygiene = system_output.get("hygiene_flags", [])
    gold_hygiene = golden_expected.get("backlog_hygiene", golden_expected.get("hygiene_flags", []))
    m9 = score_hygiene(sys_hygiene, gold_hygiene)

    # R9/M10: Meeting quality
    sys_quality = system_output.get("meeting_quality", {})
    gold_quality = golden_expected.get("meeting_quality", {})
    m10 = score_meeting_quality(sys_quality, gold_quality)

    return {
        "M1_story_completeness": {"score": m1.score, "matched": m1.matched, "partial": m1.partial,
                                   "missing": m1.missing, "extra": m1.extra, "total": m1.total_golden},
        "M2_story_quality": {"score": m2.overall, "avg_clarity": m2.avg_clarity,
                              "avg_actionability": m2.avg_actionability,
                              "avg_completeness": m2.avg_completeness,
                              "avg_criteria": m2.avg_criteria},
        "M3_tag_f1": {"score": m3.avg_f1},
        "M4_epic_accuracy": {"score": m4.score, "correct": m4.correct, "total": m4.total},
        "M5_check_precision": {"score": m5.precision},
        "M5_check_recall": {"score": m5.recall},
        "M5_check_f1": {"score": m5.f1},
        "M6_conflict_f1": {"score": m6.f1},
        "M7_grounding": {"score": m7.score, "valid": m7.valid, "paraphrase": m7.paraphrase,
                          "not_found": m7.not_found},
        "M8_calibration": {"status": m8.status, "details": m8.details},
        "M9_hygiene_precision": {"score": m9.precision},
        "M10_quality_score": {"status": m10.status, "ambiguity_delta": m10.ambiguity_delta,
                               "actionability_match": m10.actionability_match},
    }
