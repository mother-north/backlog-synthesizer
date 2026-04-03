# Backlog Synthesizer — RDE Certification

## Git Commits
- Do NOT include "Co-Authored-By: Claude" or any AI attribution in commit messages
- Keep commit messages clean and professional — describe what changed, not who/what wrote it

Multi-agent system: meeting transcripts + architecture docs + backlog → structured stories, epics, acceptance criteria, tags, gap/conflict analysis.

**Reference system:** AI-EX (ERIS) in `../AI-EX/`. All synthetic data is about ERIS. No real integrations.

**Structure:**
- `project/plan.md` — master plan, progress, exit criteria
- `project/initial_task.md` — original certification task
- `deliverables/phaseN/` — all produced artifacts (requirements, designs, AI prompts inline)
- `data/` — synthetic test data (meetings, architecture, backlog, golden scenarios)
- `backend/` — Express API gateway (TypeScript)
- `frontend/` — React SPA (TypeScript)
- `agents/` — Python agent pipeline (LangGraph + OpenAI)

## Testing Requirements

**MANDATORY: All code changes must be tested.**

### After every development task:
1. Run the relevant test suite for the layer you changed:
   - Backend changes → `npm run test:backend`
   - Frontend changes → `npm run test:frontend`
   - Agent/pipeline changes → `npm run test:agents`
2. Fix any test failures before considering the task done
3. Run `npm run build` to verify no TypeScript errors

### When modifying existing features:
1. Update affected tests to match the new behavior
2. If a test assertion changes, verify the change is intentional (not a regression)
3. Run the full suite: `npm run test`

### When adding new features:
1. Write tests for the new feature BEFORE or IMMEDIATELY AFTER implementation
2. Backend: add integration tests in `backend/tests/` (use helpers from `helpers.ts`)
3. Frontend: add component tests in `frontend/tests/` (use Vitest + React Testing Library, mock APIs with `vi.mock`)
4. Agents: add tests in `agents/tests/` (use pytest, mock LLM calls with `unittest.mock.patch`)
5. Tests that create data MUST clean up in `afterAll` / teardown

### Before deploying:
1. Run full test suite: `npm run test` (all 212+ tests must pass)
2. For E2E validation: `npm run test:e2e` (requires running backend + agents servers)
3. Verify build: `npm run build`

### Test commands:
```bash
npm run test            # All unit tests (~212 tests)
npm run test:backend    # Backend API tests (Jest)
npm run test:frontend   # Frontend component tests (Vitest)
npm run test:agents     # Python agent tests (Pytest)
npm run test:e2e        # E2E pipeline tests (requires servers running)
```

### Test file locations:
- `backend/tests/*.test.ts` — Backend API integration tests
- `frontend/tests/*.test.tsx` — Frontend component/page tests
- `agents/tests/test_*.py` — Python agent unit + integration tests
- `backend/tests/e2e-pipeline.test.ts` — End-to-end pipeline test
