# Eval Pipeline Design: Backlog Synthesizer

## Overview

The evaluation pipeline runs the system against golden scenarios, scores outputs using the rubrics, and produces a report with pass/fail per metric.

```
Golden Scenario (input)
       ↓
   [ Run Pipeline ]
   Feed meeting + architecture + backlog through agents
       ↓
   System Output (stories, checks, hygiene flags, quality)
       ↓
   [ Score Against Golden Expected Output ]
   Apply rubrics R1-R9
       ↓
   Eval Report (per metric, per scenario, overall)
```

---

## Pipeline Structure

**File:** `agents/eval/run_eval.py`

```python
# Eval pipeline entry point
async def run_evaluation(scenarios: list[str] = None):
    """
    Run evaluation on golden scenarios.
    
    Args:
        scenarios: list of scenario file paths. 
                   Default: all files in data/golden/
    
    Returns:
        EvalReport with per-scenario and aggregate scores
    """
    
    results = []
    for scenario_path in scenarios:
        # 1. Load golden scenario
        golden = load_golden(scenario_path)
        
        # 2. Run pipeline on the scenario's inputs
        system_output = await run_pipeline(
            meeting_path=golden["inputs"]["meeting"],
            architecture_path=golden["inputs"]["architecture"],
            backlog_path=golden["inputs"]["backlog"]
        )
        
        # 3. Score outputs against golden expected
        scores = score_scenario(system_output, golden["expected_output"])
        
        results.append(ScenarioResult(
            scenario_id=golden["scenario_id"],
            scores=scores,
            system_output=system_output,
            golden_expected=golden["expected_output"]
        ))
    
    # 4. Aggregate scores across scenarios
    report = aggregate_results(results)
    
    # 5. Output report
    save_report(report)
    return report
```

## Scoring Implementation

**File:** `agents/eval/scorers.py`

```python
# R1: Story Extraction Completeness
def score_story_extraction(system_stories, golden_stories) -> M1Score:
    """Match system stories to golden by semantic similarity."""
    matches = []
    for golden in golden_stories:
        best_match, similarity = find_best_match(golden, system_stories)
        if similarity > 0.85:
            matches.append(Match(golden, best_match, "full"))
        elif similarity > 0.60:
            matches.append(Match(golden, best_match, "partial"))
        else:
            matches.append(Match(golden, None, "missing"))
    
    return M1Score(
        matched=len([m for m in matches if m.type == "full"]),
        partial=len([m for m in matches if m.type == "partial"]),
        missing=len([m for m in matches if m.type == "missing"]),
        extra=len(system_stories) - len([m for m in matches if m.system]),
        score=len([m for m in matches if m.type in ("full", "partial")]) / len(golden_stories)
    )

# R2: Story Quality (LLM-as-Judge)
async def score_story_quality(system_stories, transcript) -> M2Score:
    """LLM evaluates each story on 4 dimensions."""
    scores = []
    for story in system_stories:
        result = await llm_judge(
            source_citation=story["source_citation"],
            story=story,
            rubric=QUALITY_RUBRIC  # from scoring_rubric.md
        )
        scores.append(result)
    
    return M2Score(
        per_story=scores,
        avg_clarity=mean([s["clarity"]["score"] for s in scores]),
        avg_actionability=mean([s["actionability"]["score"] for s in scores]),
        avg_completeness=mean([s["completeness"]["score"] for s in scores]),
        avg_criteria=mean([s["acceptance_criteria"]["score"] for s in scores]),
        overall=mean([s["overall"] for s in scores])
    )

# R3: Feature Tag F1
def score_tags(system_stories, golden_stories, matches) -> M3Score:
    """Set comparison of tags per matched story pair."""
    f1s = []
    for match in matches:
        if match.system and match.golden:
            sys_tags = normalize_tags(match.system["feature_tags"])
            gold_tags = normalize_tags(match.golden["feature_tags"])
            p, r, f1 = precision_recall_f1(sys_tags, gold_tags)
            f1s.append(f1)
    return M3Score(avg_f1=mean(f1s), per_story=f1s)

# R5: Check Detection
def score_checks(system_checks, golden_checks, story_matches) -> M5Score:
    """Match checks by (story + check_type)."""
    tp, fp, fn = 0, 0, 0
    for golden_check in golden_checks:
        matched_story = find_story_match(golden_check["story_title"], story_matches)
        if matched_story:
            sys_check = find_check(system_checks, matched_story, golden_check["check_type"])
            if sys_check:
                tp += 1
            else:
                fn += 1
        else:
            fn += 1
    
    fp = len(system_checks) - tp
    precision = tp / (tp + fp) if (tp + fp) > 0 else 0
    recall = tp / (tp + fn) if (tp + fn) > 0 else 0
    f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0
    
    return M5Score(tp=tp, fp=fp, fn=fn, precision=precision, recall=recall, f1=f1)

# R6: Grounding Verification
def score_grounding(system_stories, transcript) -> M7Score:
    """Check that source citations exist in transcript."""
    results = []
    for story in system_stories:
        citation = story.get("source_citation", "")
        similarity = fuzzy_match(citation, transcript)  # Levenshtein ratio
        if similarity >= 0.90:
            results.append("valid")
        elif similarity >= 0.70:
            results.append("paraphrase")
        else:
            results.append("not_found")
    
    valid_count = len([r for r in results if r in ("valid", "paraphrase")])
    return M7Score(
        valid=len([r for r in results if r == "valid"]),
        paraphrase=len([r for r in results if r == "paraphrase"]),
        not_found=len([r for r in results if r == "not_found"]),
        score=valid_count / len(system_stories) if system_stories else 1.0
    )
```

## Eval Report Format

**File:** `data/eval_reports/eval_YYYYMMDD_HHMMSS.json`

```json
{
  "run_id": "eval_20260401_143000",
  "timestamp": "2026-04-01T14:30:00Z",
  "scenarios_run": 5,
  
  "per_scenario": [
    {
      "scenario_id": 1,
      "description": "Clean kickoff meeting",
      "scores": {
        "M1_story_completeness": {"score": 0.88, "matched": 7, "total": 8, "status": "pass"},
        "M2_story_quality": {"score": 4.2, "status": "pass"},
        "M3_tag_f1": {"score": 0.85, "status": "pass"},
        "M4_epic_accuracy": {"score": 1.0, "status": "pass"},
        "M5_check_precision": {"score": 1.0, "status": "pass"},
        "M5_check_recall": {"score": 1.0, "status": "pass"},
        "M6_conflict_f1": {"score": null, "status": "n/a", "note": "no conflicts in golden"},
        "M7_grounding": {"score": 1.0, "status": "pass"},
        "M8_calibration": {"status": "pass"},
        "M9_hygiene_precision": {"score": null, "status": "n/a"},
        "M10_quality_score": {"status": "pass"}
      }
    }
  ],
  
  "aggregate": {
    "M1_story_completeness": {"avg": 0.84, "status": "acceptable"},
    "M2_story_quality": {"avg": 4.1, "status": "pass"},
    "M3_tag_f1": {"avg": 0.81, "status": "pass"},
    "M4_epic_accuracy": {"avg": 0.82, "status": "pass"},
    "M5_check_precision": {"avg": 0.78, "status": "pass"},
    "M5_check_recall": {"avg": 0.83, "status": "pass"},
    "M6_conflict_f1": {"avg": 0.72, "status": "pass"},
    "M7_grounding": {"avg": 0.96, "status": "pass"},
    "M8_calibration": {"status": "pass"},
    "M9_hygiene_precision": {"avg": 0.75, "status": "pass"},
    "M10_quality_score": {"status": "pass"}
  },
  
  "overall_status": "pass",
  "failures": [],
  "warnings": ["M1 aggregate is 'acceptable' not 'pass' — consider prompt tuning"]
}
```

## File Structure

```
agents/
├── eval/
│   ├── run_eval.py           # Entry point — run all scenarios
│   ├── scorers.py            # Scoring functions (R1-R9)
│   ├── matchers.py           # Story/check matching utilities
│   ├── llm_judge.py          # LLM-as-judge wrapper
│   └── report.py             # Report generation and formatting
│
data/
├── golden/                   # Input: golden scenarios
│   ├── scenario_1.json
│   ├── scenario_2.json
│   ├── scenario_3.json
│   ├── scenario_4.json
│   └── scenario_5.json
└── eval_reports/             # Output: eval run reports
    └── eval_YYYYMMDD_HHMMSS.json
```

## Running the Eval

```bash
# Run all scenarios
python -m agents.eval.run_eval

# Run specific scenarios
python -m agents.eval.run_eval --scenarios data/golden/scenario_1.json data/golden/scenario_3.json

# Run with verbose output (show per-story scores)
python -m agents.eval.run_eval --verbose
```

## Integration with Phase 4

The eval pipeline is:
1. **Designed** here (Phase 3) — rubrics, scoring logic, report format
2. **Implemented** in Phase 4 step 4.4 — actual Python code
3. **Run** in Phase 4 step 4.5 — against golden dataset, iterate on quality
4. **Checked** in Phase 4 step 4.6 (exit criteria) — all metrics must pass

---

## AI Prompts Used

**Session 3.3 — Eval Pipeline Design (AI Build)**

Prompt: "Design the evaluation pipeline: how to run the system against golden scenarios, score outputs, and produce a report."

Key decisions:
- Single entry point `run_eval.py` runs all or selected scenarios
- Scoring functions match 1:1 to rubrics (R1-R9 in scoring_rubric.md)
- Report is JSON with per-scenario and aggregate scores + pass/fail status
- LLM-as-judge for story quality (M2) — the only metric requiring LLM evaluation
- All other metrics are deterministic (string matching, set comparison, statistics)
- Eval reports stored in `data/eval_reports/` with timestamp for comparison across runs
