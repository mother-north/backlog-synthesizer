# Metrics Definition: Backlog Synthesizer

## Output Types to Evaluate

| Output | Produced By | What to Measure |
|---|---|---|
| Candidate stories | Synthesizer | Completeness, quality, granularity |
| Acceptance criteria | Synthesizer | Specificity, correctness |
| Feature tags | Synthesizer | Accuracy |
| Epic assignment | Synthesizer | Correctness of mapping |
| Checks (conflicts, overlaps, dependencies, etc.) | Cross-Reference | Precision, recall |
| Backlog hygiene flags | Cross-Reference | Precision, recall |
| NFR extraction | Parser | Completeness |
| Priority signals | Parser | Accuracy |
| Grounding/citations | Validator | Citation accuracy |
| Meeting quality feedback | Synthesizer | Usefulness |
| Confidence levels | All agents | Calibration |

---

## Metrics

### M1: Story Extraction Completeness
**What:** Did the system find all extractable requirements from the transcript?
**Formula:** `stories extracted / stories in golden dataset`
**Target:** ≥ 85%
**Evaluated against:** Golden dataset expected stories vs system output
**Why it matters:** Missing a requirement means lost business value

### M2: Story Quality (LLM-as-Judge)
**What:** Are generated stories well-written, actionable, and properly structured?
**Formula:** LLM scores each story 1-5 on: clarity, actionability, completeness, acceptance criteria quality
**Target:** Average ≥ 4.0 / 5.0
**Evaluated by:** GPT-4o as judge, prompted with rubric
**Why it matters:** Stories that need heavy rewriting defeat the purpose

### M3: Feature Tag Accuracy
**What:** Are stories tagged with the correct system components/feature areas?
**Formula:** Precision and recall vs golden dataset tags
**Target:** F1 ≥ 0.80
**Evaluated against:** Golden dataset feature_tags
**Why it matters:** Wrong tags = wrong routing, wrong epic assignment

### M4: Epic Assignment Accuracy
**What:** Are stories assigned to the correct epic (or correctly flagged for new epic)?
**Formula:** `correct epic assignments / total stories`
**Target:** ≥ 80%
**Evaluated against:** Golden dataset epic_assignment
**Why it matters:** Wrong epic = wrong roadmap grouping

### M5: Check Detection (Precision & Recall)
**What:** Did the system detect the right conflicts, overlaps, dependencies, and constraint violations?
**Formula:** Precision = `true checks / all checks raised`. Recall = `true checks / all checks in golden dataset`
**Target:** Precision ≥ 0.75, Recall ≥ 0.80
**Evaluated against:** Golden dataset checks
**Why it matters:** False positives waste reviewer time. Missed checks = undetected conflicts

### M6: Conflict Detection F1
**What:** Specifically for conflict/overlap/prior-decision checks — the hardest detection task
**Formula:** F1 score (harmonic mean of precision and recall)
**Target:** F1 ≥ 0.70
**Evaluated against:** Golden dataset checks where check_type in (overlap, prior_decision, architecture)
**Why it matters:** This is the core differentiator of the system

### M7: Grounding Accuracy
**What:** Do source citations actually exist in the transcript? Are there fabricated requirements?
**Formula:** `stories with valid citations / total stories`
**Target:** ≥ 95%
**Evaluated by:** String matching — check that source_citation text exists in transcript
**Why it matters:** Hallucinated requirements undermine trust

### M8: Confidence Calibration
**What:** Do confidence levels match actual quality? High-confidence stories should be more accurate than low-confidence.
**Formula:** Compare accuracy rates across confidence levels. High > Medium > Low should hold.
**Target:** Monotonic relationship (high confidence items are more accurate than low)
**Evaluated by:** Group stories by confidence, measure M1+M3+M4 per group
**Why it matters:** Uncalibrated confidence is misleading

### M9: Backlog Hygiene Precision
**What:** Are flagged "potentially obsolete" items actually obsolete?
**Formula:** `true positives / all flags raised`
**Target:** Precision ≥ 0.70
**Evaluated against:** Golden dataset backlog_hygiene flags
**Why it matters:** False hygiene flags create noise

### M10: Meeting Quality Score Accuracy
**What:** Does the meeting quality assessment (ambiguity count, actionability) match reality?
**Formula:** Compare system's ambiguous_count and actionability_score to golden dataset
**Target:** Ambiguity count within ±1 of golden. Actionability score matches.
**Evaluated against:** Golden dataset meeting_quality
**Why it matters:** Inaccurate quality feedback reduces trust in recommendations

---

## Evaluation Methods

### Method 1: Golden Dataset Comparison (M1, M3, M4, M5, M6, M9, M10)
Run system on golden dataset inputs → compare outputs to expected outputs.
Automated scoring via exact match, fuzzy match, and set comparison.

### Method 2: LLM-as-Judge (M2)
GPT-4o evaluates each generated story against a rubric:

```
Rate this story on a scale of 1-5 for each dimension:

1. Clarity: Is the title and description clear and unambiguous?
2. Actionability: Could a developer implement this without further clarification?
3. Completeness: Does it capture the full requirement from the source?
4. Acceptance Criteria Quality: Are criteria specific, testable, and sufficient?

Source transcript excerpt: "{source_citation}"
Generated story: {story JSON}

Score each dimension and provide brief rationale.
```

### Method 3: Citation Verification (M7)
Automated string matching: for each story's `source_citation`, check if the text exists (exact or fuzzy match with >90% similarity) in the original transcript.

### Method 4: Statistical Analysis (M8)
Group all stories by confidence level → compute M1+M3+M4 accuracy per group → verify high > medium > low.

---

## Pass/Fail Thresholds

| Metric | Pass | Acceptable | Fail |
|---|---|---|---|
| M1 Story Completeness | ≥ 85% | 70-84% | < 70% |
| M2 Story Quality | ≥ 4.0 | 3.5-3.9 | < 3.5 |
| M3 Tag F1 | ≥ 0.80 | 0.65-0.79 | < 0.65 |
| M4 Epic Accuracy | ≥ 80% | 65-79% | < 65% |
| M5 Check Precision | ≥ 0.75 | 0.60-0.74 | < 0.60 |
| M5 Check Recall | ≥ 0.80 | 0.65-0.79 | < 0.65 |
| M6 Conflict F1 | ≥ 0.70 | 0.55-0.69 | < 0.55 |
| M7 Grounding | ≥ 95% | 85-94% | < 85% |
| M8 Calibration | Monotonic | Mostly monotonic | Inverted |
| M9 Hygiene Precision | ≥ 0.70 | 0.55-0.69 | < 0.55 |
| M10 Quality Score | Within ±1 | Within ±2 | Off by ≥3 |

**Overall pass:** All metrics at "Pass" or "Acceptable" with zero "Fail".

---

## AI Prompts Used

**Session 3.1 — Metrics Design (AI Build)**

Prompt: "Define metrics for every output type of the Backlog Synthesizer. Include formula, target, evaluation method, and pass/fail thresholds."

Key decisions:
- 10 metrics covering all output types
- 4 evaluation methods: golden comparison, LLM-as-judge, citation verification, statistical analysis
- Three-tier thresholds (pass/acceptable/fail) rather than binary
- Grounding accuracy (M7) has the highest bar (95%) — trust is critical
- Conflict detection F1 (M6) has a lower bar (0.70) — this is the hardest task
