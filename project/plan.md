# Master Plan: Backlog Synthesizer

```
Phase 1: Framing → Phase 2: Design → Phase 3: Eval Plan → Phase 4: Build + Eval + Final Check
```

Every step: **AI Explore → Build → AI Review → Gate Check**

---

## Phase 1: Framing

| Step | Do | Gate | Output |
|---|---|---|---|
| 1.1 System Concept | Define value proposition, actors, scope | Scope is clear and bounded | `deliverables/phase1/system_concept.md` |
| 1.2 Workflow | Map data flow, agent roles, memory needs | Workflow validated with 2-3 scenarios | `deliverables/phase1/workflow.md` |
| 1.3 Use Cases | 7+ happy paths, 5+ edge cases | Each has trigger, behavior, output | `deliverables/phase1/use_cases.md` |
| 1.4 Synthetic Data | Generate per `data_generation_rules.md` | Data covers all use cases from 1.3 | `data/*` |
| 1.5 Phase Review | Cross-check against `initial_task.md` | All Phase 1 criteria met | — |

**Data volumes:** 10+ meeting transcripts, 50+ backlog items, 1 architecture doc, 3-5 golden scenarios.
**Rules:** `deliverables/phase1/data_generation_rules.md`

---

## Phase 2: Design

| Step | Do | Gate | Output |
|---|---|---|---|
| 2.1 Agent Architecture | Agent roles, inputs/outputs, orchestration pattern | Handles all Phase 1 use cases | `deliverables/phase2/agent_architecture.md` |
| 2.2 Tool Interfaces | Mocked tool contracts (parsers, JSON reader) | Each contract maps to a data source | `deliverables/phase2/tool_interfaces.md` |
| 2.3 Memory & Audit | Context store choice, persistence rules, trace schema | Supports audit trail requirement | `deliverables/phase2/memory_schema.md` |
| 2.4 Architecture Diagram | Agents, tools, memory, data flows | Reviewed against all use cases | `deliverables/phase2/architecture_diagram.md` |

---

## Phase 3: Eval Plan

| Step | Do | Gate | Output |
|---|---|---|---|
| 3.1 Metrics | Completeness, accuracy, F1, LLM-as-judge quality | Covers all output types | `deliverables/phase3/metrics.md` |
| 3.2 Scoring Rubric | Rubric per metric, pass/fail thresholds | Tested manually on 1-2 golden scenarios | `deliverables/phase3/scoring_rubric.md` |
| 3.3 Eval Pipeline Design | Harness design: inputs → system → score | Runnable against golden dataset | `deliverables/phase3/eval_pipeline.md` |

---

## Phase 4: Build + Eval + Final Check

| Step | Do | Gate | Output |
|---|---|---|---|
| 4.1 Foundation | Project setup, ingestion, parsing | Reads all files in `data/` | `application/` |
| 4.2 Core Agents | Decomposition, synthesis, conflict detection, orchestration | Runs on 2 golden scenarios | `application/` |
| 4.3 Memory & Observability | Context engine, audit logging, error handling + retry | Audit log reviewable for 1 full scenario | `application/` |
| 4.4 Eval Pipeline | Implement eval harness from Phase 3 design | Runs end-to-end on golden dataset | `application/` |
| 4.5 Eval Run & Demo | Run eval, iterate, prepare demo | Metrics meet thresholds | `application/` |
| **4.6 Exit** | **Final check against `initial_task.md`** | **All exit criteria pass** | — |

### Exit Criteria

- [ ] AI prompts and iterations documented in every deliverable
- [ ] Architecture diagram with agent roles, tool interfaces, memory
- [ ] Planned interactions, tool outputs, trace paths
- [ ] Metrics defined + golden dataset (3-5 scenarios)
- [ ] At least one automated evaluation implemented and run
- [ ] Multi-agent framework working
- [ ] Memory persists across stages
- [ ] Modular tool abstractions (all mocked)
- [ ] Error handling and retry logic
- [ ] Audit logs show how conclusions were reached
- [ ] AI usage documented throughout SDLC
- [ ] Working demo

---

## Progress

| Step | Status |
|---|---|
| 1.1 System Concept | done |
| 1.2 Workflow | done |
| 1.3 Use Cases | done |
| 1.4 Synthetic Data | done |
| 1.5 Phase Review | not started |
| 2.1–2.4 | not started |
| 3.1–3.3 | not started |
| 4.1–4.6 | not started |

**Current:** Phase 1 — 1.1 and 1.3 have drafts, need AI review sessions

---

## Decisions Log
_(Scope changes, blockers, key decisions)_
