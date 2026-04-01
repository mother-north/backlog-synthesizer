# UI Design: Backlog Synthesizer

## Sidebar Navigation

```
┌─────────────────────────┐
│  Backlog Synthesizer    │
│                         │
│  📝 Meetings            │
│  📊 All Stories         │
│  📋 Action List         │
│  📈 Dashboard           │
│  🔍 Knowledge Base      │
│                         │
│  DATA                   │
│  📤 Backlog Data        │
│  📄 Architecture Doc    │
│                         │
│  SETTINGS               │
│  👤 Users               │
│  🔑 Roles               │
│  🔒 Access Control      │
└─────────────────────────┘
```

Menu items filtered by RBAC rules (same pattern as reference app). Empty rules = show all (permissive default).

---

## Page Designs

### 1. Login (`/login`)

Simple email/password form with "Remember Me" checkbox. JWT auth.

```
┌──────────────────────────────────────┐
│       Backlog Synthesizer            │
│                                      │
│   Email:    [________________]       │
│   Password: [________________]       │
│                                      │
│   [✓] Remember me                    │
│                                      │
│          [ Sign In ]                 │
└──────────────────────────────────────┘
```

---

### 2. Action List (`/actions`)

Per-role action queue. Shows only items for the current user's roles. Sorted by creation date.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Action List (showing: PM, Dev Lead)           [Type: All ▼] [Meeting: All ▼]│
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Type            │ Story / Item           │ Meeting          │ Date     │ →  │
│  ────────────────┼────────────────────────┼──────────────────┼──────────┼────│
│  ⚠️ Priority     │ Add Gemini support     │ Multi-LLM        │ Mar 31   │ Go │
│  🏗️ New Epic     │ Multi-LLM Provider     │ Multi-LLM        │ Mar 31   │ Go │
│  ✅ Confirmation │ 3 stories pending      │ Project Kickoff  │ Mar 30   │ Go │
│  🔄 Overlap      │ Gemini integration     │ Multi-LLM        │ Mar 31   │ Go │
│  🔗 Dependency   │ Azure OpenAI           │ Multi-LLM        │ Mar 31   │ Go │
│                                                                              │
│  5 items                                                                     │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Auto-filtered:** Only shows items routed to the current user's roles. If user is PM + Dev Lead, they see both PM and Dev Lead items. Architect-only checks are hidden.
**Filters:** By check type, by meeting.
**Each item links to:** Meeting View → relevant tab/story.

---

### 3. Meetings List (`/meetings`)

All uploaded meetings with status and summary stats.

```
┌──────────────────────────────────────────────────────────────────────┐
│  Meetings                                      [ Upload Transcript ] │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Title                    │ Date       │ Status     │ Stories │ Open │
│  ─────────────────────────┼────────────┼────────────┼─────────┼──────│
│  Project Kickoff          │ Mar 15     │ Completed  │  8 / 8  │  0   │
│  Risk Scoring Review      │ Mar 17     │ In Review  │  4 / 6  │  3   │
│  Review Queue Workflow    │ Mar 19     │ Processing │  — / —  │  —   │
│  Multi-LLM Provider       │ Mar 21     │ In Review  │  2 / 9  │  5   │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

**Status:** Processing (pipeline running) → In Review (human review) → Completed (all stories resolved)
**Click row →** Meeting View

**Upload Transcript dialog:**
- Drag & drop .md file or paste text
- Enter meeting title
- [ Process ] button triggers the agent pipeline

---

### 4. Meeting View (`/meetings/:id`) — Central Hub

Everything for one meeting, organized in tabs.

```
┌──────────────────────────────────────────────────────────────────────┐
│  ← Meetings    Multi-LLM Provider Support         Status: In Review │
│                                                                      │
│  ── Processing Status (shown while pipeline is running) ──────────  │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │ ✅ Extracting requirements from transcript          done      │  │
│  │ ✅ Searching knowledge base for related context     done      │  │
│  │ ▶️ Checking against backlog and architecture...    running    │  │
│  │ ○  Generating candidate stories                    pending    │  │
│  │ ○  Validating grounding and citations              pending    │  │
│  │ ━━━━━━━━━━━━━━━━━━━━━━━━━━━░░░░░░░░░░░░░  60%               │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌─────────┬─────────┬────────┬──────────────┬──────────────┐       │
│  │ Stories │ Checks  │  Memo  │ Audit Trail  │ Meeting Info │       │
│  └─────────┴─────────┴────────┴──────────────┴──────────────┘       │
│                                                                      │
│  [Tab content below — tabs enabled after processing completes]       │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

#### Tab: Stories

Stories grouped by epic. Each story shows status, type, confidence, checks count.

```
│  ┌─ Epic: LLM Integration (ERIS-004) ──────────────────────────────│
│  │                                                                  │
│  │  ✅ Migrate Claude to abstraction layer    feature  high   0 ⚠️ │
│  │  ✅ Migrate OpenAI to abstraction layer    feature  high   0 ⚠️ │
│  │  ⏳ Add automatic failover                 feature  med    1 ⚠️ │
│  │                                                                  │
│  ├─ Proposed Epic: Multi-LLM Provider Support 🆕 ──────────────────│
│  │  [Awaiting PM Approval]                                          │
│  │                                                                  │
│  │  ⏳ Provider abstraction layer              feature  high   1 ⚠️ │
│  │  ⏳ Gemini integration                      feature  high   2 ⚠️ │
│  │  ⏳ Azure OpenAI integration                feature  med    1 ⚠️ │
│  │  ⏳ Provider capability metadata            feature  med    0 ⚠️ │
│  │                                                                  │
│  │  Epic Proposal:                                                  │
│  │  "Existing ERIS-004 covers basic LLM config. This new epic      │
│  │   covers provider abstraction, failover, and multi-provider      │
│  │   orchestration — a different scope."                            │
│  │                                                                  │
│  │  [ Approve Epic ] [ Merge into ERIS-004 ▼ ] [ Reject Epic ]     │
│  │                                                                  │
│  │  On Reject Epic → dialog:                                        │
│  │  "What should happen to 4 stories under this epic?"              │
│  │  ( ) Reassign to: [Select existing epic ▼]                       │
│  │  ( ) Reject all stories (with rationale: [___________])          │
│  │  [ Confirm Rejection ]                                           │
│  │                                                                  │
│  └──────────────────────────────────────────────────────────────────│
```

**Click a story →** expands inline to show Story Detail (no separate page needed):

```
│  ┌─ Story: Provider abstraction layer ──────────── feature │ high ──│
│  │                                                                  │
│  │  Epic: [Multi-LLM Provider Support (proposed) ▼]  [ Edit ]       │
│  │  (dropdown: change epic assignment, triggers re-check)           │
│  │                                                                  │
│  │  Description:                                                    │
│  │  Build a unified provider interface that all LLM providers       │
│  │  implement, enabling hot-swapping between providers.             │
│  │  [ Edit ]                                                        │
│  │                                                                  │
│  │  Acceptance Criteria:                                            │
│  │  • Common interface for send/receive across all providers        │
│  │  • Provider config stored in database                            │
│  │  • Zero-downtime provider switching                              │
│  │  [ Edit ]                                                        │
│  │                                                                  │
│  │  Source: "We need a proper abstraction layer... every provider   │
│  │  implements the same interface" — Mike (Architect)               │
│  │  [View in transcript]                                            │
│  │                                                                  │
│  │  ── Checks (1 open) ──────────────────────────────────────────  │
│  │                                                                  │
│  │  🆕 New Epic Proposal          → PM     ⏳ Open                  │
│  │     This story belongs to proposed epic "Multi-LLM Provider      │
│  │     Support". Approve epic first.                                │
│  │                                                                  │
│  │  ── Grounding ───────────────────────────────────── ✅ Valid ──  │
│  │                                                                  │
│  │  [ Confirm ] [ Reject ] [ Flag for Escalation ]                  │
│  │  (Confirm disabled — 1 open check)                               │
│  │  NOTE: Stories without an epic cannot be confirmed.              │
│  │  Orphan stories show a blocking "No Epic" check until assigned.  │
│  │                                                                  │
│  └──────────────────────────────────────────────────────────────────│
```

**Edit flow:** User clicks Edit → inline editor → on save → system re-runs cross-reference + validator → shows drift warning if edit conflicts with transcript → updated checks shown.

#### Tab: Checks

All open checks for this meeting, filterable.

```
│  Checks (5 open, 3 resolved)          [Status: Open ▼] [Role: Mine ▼]│
│                                                                      │
│  Type         │ Story              │ Role     │ Status   │ Action    │
│  ─────────────┼────────────────────┼──────────┼──────────┼───────────│
│  🆕 New Epic  │ Provider abstract. │ PM       │ ⏳ Open  │ [Resolve] │
│  ⚠️ Priority  │ Auto failover     │ PM       │ ⏳ Open  │ [Resolve] │
│  🔗 Depend.   │ Gemini integration│ Dev Lead │ ⏳ Open  │ [Resolve] │
│  🔗 Depend.   │ Azure OpenAI      │ Dev Lead │ ⏳ Open  │ [Resolve] │
│  🔄 Overlap   │ Gemini integration│ Dev Lead │ ⏳ Open  │ [Resolve] │
│  ✅ Depend.   │ Claude migration  │ Dev Lead │ Resolved │ —         │
│  ✅ Depend.   │ OpenAI migration  │ Dev Lead │ Resolved │ —         │
│  ✅ Archit.   │ Config UI redesign│ Architect│ Resolved │ —         │
│                                                                      │
│  [Resolve] button enabled ONLY for checks matching current user's    │
│  roles. If user is PM — can resolve PM checks, others are read-only. │
│                                                                      │
│  Click [Resolve] → inline resolution panel:                          │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │ Check: Priority Conflict — "Auto failover"                     │ │
│  │ Details: 3 items already marked high priority in backlog...    │ │
│  │ Proposed: Defer to next sprint                                 │ │
│  │                                                                 │ │
│  │ Resolution: ( ) Accept proposed  ( ) Override: [__________]    │ │
│  │             ( ) Dismiss (not an issue)                          │ │
│  │ [ Save Resolution ]                                            │ │
│  └─────────────────────────────────────────────────────────────────┘ │
```

#### Tab: Memo

Decision memo — generate/regenerate on demand.

```
│  Decision Memo                      Version: 2  │ [ Regenerate ]    │
│  Generated: Mar 31, 2026 14:30                                      │
│                                                                      │
│  ── Summary ─────────────────────────────────────────────────────── │
│  Meeting "Multi-LLM Provider" produced 9 candidate stories.         │
│  2 confirmed, 0 rejected, 7 pending review.                        │
│  1 new epic proposed (awaiting PM approval).                        │
│                                                                      │
│  ── Confirmed Stories ───────────────────────────────────────────── │
│  • Migrate Claude to abstraction layer (ERIS-004)                   │
│  • Migrate OpenAI to abstraction layer (ERIS-004)                   │
│                                                                      │
│  ── Pending ─────────────────────────────────────────────────────── │
│  • 5 stories awaiting epic approval                                 │
│  • 2 stories with open dependency checks                            │
│                                                                      │
│  ── Open Issues ─────────────────────────────────────────────────── │
│  • New epic "Multi-LLM Provider Support" needs PM approval          │
│  • Gemini integration overlaps with ERIS-044 — Dev Lead to decide   │
│                                                                      │
│  ── Meeting Quality ─────────────────────────────────────────────── │
│  Requirements: 9  │  Ambiguous: 0  │  Actionability: High           │
│  Recommendation: "Well-structured meeting with clear decisions.     │
│  All requirements are actionable. Consider splitting the provider   │
│  abstraction discussion into a separate technical design session."  │
│                                                                      │
│  ── Version History ─────────────────────────────────────────────── │
│  v2 — Mar 31, 14:30 — 2 confirmed, 7 pending                       │
│  v1 — Mar 31, 10:15 — 0 confirmed, 9 pending                       │
```

#### Tab: Audit Trail

Pipeline execution and change history for this meeting.

```
│  Audit Trail                                                        │
│                                                                      │
│  ── Pipeline Execution ──────────────────────────────────────────── │
│  Parser       │ 9 requirements extracted  │ 2.1s  │ 1,240 tokens   │
│  Retriever    │ 23 KB items retrieved     │ 3.4s  │ 890 tokens     │
│  Cross-Ref    │ 8 checks generated        │ 4.2s  │ 2,100 tokens   │
│  Synthesis    │ 9 stories, 1 epic prop.   │ 5.1s  │ 3,400 tokens   │
│  Validator    │ 9/9 grounding valid       │ 1.8s  │ 1,100 tokens   │
│                                                                      │
│  ── Story History ──────────────── [Select story: All ▼] ────────── │
│  Mar 31 10:15  │ Story "Provider abstraction" created by Pipeline   │
│  Mar 31 10:15  │ Check "New Epic" assigned to PM                    │
│  Mar 31 12:00  │ User edited acceptance criteria                    │
│  Mar 31 12:00  │ Re-check triggered — no new issues                 │
│  Mar 31 12:01  │ Drift warning: edit removed "zero-downtime" req    │
```

#### Tab: Meeting Info

Original transcript and metadata.

```
│  Meeting Info                                                       │
│                                                                      │
│  Title:     Multi-LLM Provider Support                              │
│  Uploaded:  Mar 31, 2026 by Sarah (PM)                              │
│  File:      04_multi_llm.md                                         │
│  Status:    In Review                                                │
│                                                                      │
│  ── Transcript ──────────────────────────────────────────────────── │
│  **Mike (Architect):** Alright, let's talk about multi-LLM          │
│  support. Right now we're hardcoded to Claude and OpenAI, but       │
│  we need a proper abstraction layer...                              │
│  [full transcript, scrollable, searchable]                          │
```

---

### 5. All Stories (`/stories`)

Cross-meeting story list with filters.

```
┌──────────────────────────────────────────────────────────────────────┐
│  All Stories                                                         │
│  [Status: All ▼] [Type: All ▼] [Meeting: All ▼] [Epic: All ▼]      │
├──────────────────────────────────────────────────────────────────────┤
│  Title                    │ Meeting      │ Date     │ Type    │ Status    │ ⚠️  │
│  ─────────────────────────┼──────────────┼──────────┼─────────┼───────────┼─────│
│  Provider abstraction     │ Multi-LLM    │ Mar 21   │ feature │ Under Rev │  1  │
│  Risk score NaN fix       │ Risk Scoring │ Mar 17   │ bug     │ Confirmed │  0  │
│  500 concurrent users NFR │ Kickoff      │ Mar 15   │ nfr     │ Confirmed │  0  │
│  Audit logging all APIs   │ Batch Proc   │ Mar 19   │ feature │ Under Rev │  2  │
│  ...                                                                        │
│  Showing 42 stories                                            [Export CSV] │
└──────────────────────────────────────────────────────────────────────┘
```

**Click row →** navigates to Meeting View → Stories tab with that story expanded.

---

### 6. Dashboard (`/dashboard`)

Key metrics at a glance.

```
┌──────────────────────────────────────────────────────────────────────┐
│  Dashboard                                                           │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ── Meetings ────────────────────────────────────────────────────── │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐               │
│  │  Total   │ │Processing│ │In Review │ │Completed │               │
│  │    12    │ │     1    │ │     4    │ │     7    │               │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘               │
│                                                                      │
│  ── Stories ─────────────────────────────────────────────────────── │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│  │ Generated│ │Confirmed │ │ Rejected │ │  Pending │ │Avg Review│  │
│  │    42    │ │    28    │ │     5    │ │     9    │ │  2.3 days│  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘  │
│                                                                      │
│  ── Open Checks by Role ─────────────────────────────────────────── │
│  PM: 4  │  Architect: 2  │  Dev Lead: 3                             │
│                                                                      │
│  ── Stories by Meeting ──────────────────────────── [Bar Chart] ──── │
│  ── Meeting Processing Timeline ─────────────────── [Timeline] ──── │
│  ── Confirmation Rate Over Time ─────────────────── [Line Chart] ── │
│  ── Check Types Distribution ────────────────────── [Pie Chart] ──  │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

---

### 7. Knowledge Base (`/kb`)

Search across all stored knowledge.

```
┌──────────────────────────────────────────────────────────────────────┐
│  Knowledge Base                                                      │
│  Search: [auth decision________________________] [ Search ]          │
│  [Meetings ✓] [Decisions ✓] [Stories ✓] [Architecture ✓]            │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  📝 Meeting Summary — User Roles & Access (Mar 22)       92% match  │
│     "Discussed restructuring roles from 5 to 3..."                  │
│                                                                      │
│  📋 Decision — JWT with 24hr expiry confirmed (Mar 15)   87% match  │
│     "Decided on JWT-based auth with 24-hour rolling sessions"       │
│                                                                      │
│  📊 Story — Implement five-role RBAC (Confirmed)         81% match  │
│     "Five user roles: Admin, Master Analyst, Analyst..."            │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

---

### 8. Data Loading Pages

#### Backlog Data (`/data/backlog`)

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Backlog Data                              [ Upload JSON ] [ Download ] │
│  Items: 68                                                              │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  [Search by title...]  [Type: All ▼]                                    │
│                                                                          │
│  ID ▲      │ Type ▼  │ Title ▲           │ Epic ▼   │ Priority ▼│Status▼│ │
│  ──────────┼─────────┼───────────────────┼──────────┼───────────┼───────│ │
│  ERIS-001  │ epic    │ Risk Assessment   │ —        │ high      │active │👁│
│  ERIS-010  │ story   │ Risk scoring algo │ ERIS-001 │ medium    │done   │👁│
│  ERIS-012  │ bug     │ NaN for empty doc │ ERIS-001 │ critical  │backlog│👁│
│  ...                                                                     │
│  Showing 1-20 of 68                                    [< ] Page 1 [> ] │
└──────────────────────────────────────────────────────────────────────────┘
```

**Table features:**
- **Column sorting** on ID, Title (click header to toggle ▲/▼)
- **Column filters** on Type, Epic, Priority, Status (dropdown filter in header)
- **View detail** button (👁) or double-click row → opens detail modal
- **Pagination** with configurable page size (20/50/100)

**View Detail Modal:**
- Shows all fields: ID, type, title, description, epic, status, priority, labels, acceptance criteria, dependencies
- Read-only view (editing backlog happens outside this system)
- Labels shown as tags, acceptance criteria as bulleted list, dependencies as linked tags

Upload: validates JSON against schema → truncate + insert in transaction → re-embed for KB search.

#### Architecture Doc (`/data/architecture`)

```
┌──────────────────────────────────────────────────────────────────────┐
│  Architecture Document                        [ Upload New Version ] │
│  Last uploaded: Mar 31, 2026  │  File: eris_architecture.md         │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  [Rendered markdown view of the architecture document]               │
│                                                                      │
│  # ERIS Architecture                                                 │
│  ## Tech Stack                                                       │
│  - Backend: Node.js, Express.js                                      │
│  - Database: SQLite3 with WAL mode...                                │
│  ...                                                                 │
│                                                                      │
│  ── Version History ─────────────────────────────────────────────── │
│  v2 — Mar 31, 2026 — eris_architecture_v2.md                        │
│  v1 — Mar 28, 2026 — eris_architecture.md                           │
└──────────────────────────────────────────────────────────────────────┘
```

Upload: stores new version → old version kept in KB → re-sections and re-embeds for constraint checking.

---

## Confirmation Dialogs

All key actions require an "Are you sure?" confirmation before executing:

| Action | Dialog Message | Extra Input |
|---|---|---|
| Confirm story | "Confirm this story as ready to push?" | — |
| Reject story | "Reject this story?" | Rationale (required text field) |
| Approve epic | "Approve new epic '{name}'? {N} stories will be assigned." | — |
| Reject epic | "Reject epic '{name}'? Choose what happens to {N} stories." | Reassign / Reject all / Keep as orphans |
| Merge epic | "Merge into {epic name}? {N} stories will be reassigned." | — |
| Resolve check | "Save this resolution?" | — |
| Edit story (save) | "Save changes? System will re-check for conflicts." | — |
| Upload backlog | "Replace all backlog data? This cannot be undone." | — |
| Upload architecture | "Upload new version? Previous version will be archived." | — |
| Generate/regenerate memo | "Generate decision memo (version {N})?" | — |

---

## User Flows

### Flow 1: Process a New Meeting
```
User → Meetings List → [ Upload Transcript ] → enters title, drops .md file
  → Pipeline starts (status: Processing)
  → Pipeline completes → status: In Review
  → User opens Meeting View → Stories tab
  → Reviews stories, resolves checks, edits as needed
  → Confirms/rejects each story
  → Generates memo (Memo tab)
  → All stories resolved → status: Completed
```

### Flow 2: Resolve a Check
```
User → Action List → clicks pending check
  → Meeting View opens → story expanded with check highlighted
  → User reads check details and proposed resolution
  → User resolves: accept resolution / override / dismiss
  → Check status → Resolved
  → If all checks on story resolved → story status: Awaiting Confirmation
```

### Flow 3: Edit a Story
```
User → Meeting View → Stories tab → expands story → clicks Edit
  → Inline editor opens (description, acceptance criteria, tags)
  → User saves edit
  → System re-runs Cross-Reference + Validator on edited story
  → If drift detected → warning shown: "Edit removed requirement X from transcript"
  → Updated checks displayed
  → User proceeds with confirmation or further edits
```

### Flow 4: Approve a New Epic
```
User (PM) → Action List → "New Epic Proposal" item
  → Meeting View → Stories tab → epic proposal section
  → Reviews: name, goal, justification, stories that would belong
  → [ Approve Epic ] → epic created, stories under it move to Awaiting Confirmation
  → or [ Reject Epic ] → stories reassigned or rejected
  → or [ Merge into existing ] → stories moved to selected epic
```

---

## Backlog Hygiene View

Accessible from Meeting View as a section in the **Checks tab** (hygiene flags are a type of check output).

```
│  ── Backlog Hygiene Flags ─────────────────────────────────────────  │
│                                                                      │
│  Existing Item   │ Flag              │ Reason               │ Action │
│  ────────────────┼───────────────────┼──────────────────────┼────────│
│  ERIS-056        │ Potentially       │ Meeting decided to   │ [Ack]  │
│  Email notifs    │ obsolete          │ drop notifications   │ [Dismiss]│
│  ERIS-057        │ Potentially       │ "Real-time collab    │ [Ack]  │
│  In-app notifs   │ obsolete          │ too complex" — M8    │ [Dismiss]│
│                                                                      │
│  Ack = Acknowledged (item should be removed from backlog)            │
│  Dismiss = Not an issue (keep item in backlog)                       │
```

Also visible in **Dashboard** under a "Hygiene Flags" counter card.

---

## Standard UI Patterns

### Status Colors

| Status | Color | Used On |
|---|---|---|
| Generated | `--gray-400` (gray) | Stories |
| Under Review | `--blue-400` (accent blue) | Stories |
| Awaiting Confirmation | `--blue-700` (primary blue) | Stories |
| Confirmed | `#52c41a` (green) | Stories |
| Rejected | `#ff4d4f` (red) | Stories |
| Ready to Push | `#52c41a` (green, bold) | Stories |
| Pending Decision | `#faad14` (amber) | Stories |
| Open | `#faad14` (amber) | Checks |
| Resolved | `#52c41a` (green) | Checks |
| Dismissed | `--gray-400` (gray) | Checks |
| Processing | `--blue-400` (blue, animated) | Meetings |
| In Review | `#faad14` (amber) | Meetings |
| Completed | `#52c41a` (green) | Meetings |
| High confidence | `#52c41a` (green) | Stories |
| Medium confidence | `#faad14` (amber) | Stories |
| Low confidence | `#ff4d4f` (red) | Stories |
| Grounding valid | `#52c41a` (green) | Stories |
| Grounding warning | `#faad14` (amber) | Stories |
| Grounding invalid | `#ff4d4f` (red) | Stories |

### Standard Table Component

All tables across the system follow the same pattern:

```
┌──────────────────────────────────────────────────────────────────┐
│  Page Title                                    [ Primary Action ] │
│  [Filter ▼] [Filter ▼] [Search: ___________]                    │
├──────────────────────────────────────────────────────────────────┤
│  Column A ▲  │ Column B  │ Column C  │ Column D  │ Actions      │
│  ────────────┼───────────┼───────────┼───────────┼──────────────│
│  Row 1       │ ...       │ ...       │ ...       │ ...          │
│  Row 2       │ ...       │ ...       │ ...       │ ...          │
├──────────────────────────────────────────────────────────────────┤
│  Showing 1-20 of 42                       [ < ] Page 1 [ > ]    │
└──────────────────────────────────────────────────────────────────┘
```

Rules:
- **Filters** always below page title, horizontal row, same Ant Design Select components
- **Sortable columns** indicated with ▲/▼, click to toggle
- **Pagination** on all tables (20 items per page, configurable)
- **Row click** navigates to detail (consistent across all tables)
- **Primary action** button top-right (Upload, Export, etc.)

### Story List Columns (standard across All Stories + Meeting View)

| Column | Always Visible | Shows |
|---|---|---|
| Status icon | Yes | Color-coded status dot |
| Title | Yes | Story title (clickable) |
| Type | Yes | feature / bug / improvement / task / nfr |
| Confidence | Yes | High/Med/Low with color dot |
| Grounding | Yes | Valid/Warning/Invalid icon |
| Checks | Yes | Open check count (⚠️ N) |
| Epic | Yes | Epic name or "No Epic" warning |
| Meeting | All Stories only | Meeting title |
| Date | All Stories only | Meeting date |

### Empty States

Every page/table has a meaningful empty state:

| Page | Empty State Message | Call to Action |
|---|---|---|
| Meetings | "No meetings yet" | [ Upload Your First Transcript ] |
| All Stories | "No stories generated yet" | "Upload a meeting transcript to get started" |
| Action List | "No pending actions — you're all caught up!" | — |
| Dashboard | "No data yet" | "Upload meetings and backlog data to see metrics" |
| Knowledge Base | "Knowledge base is empty" | "Process meetings to build the knowledge base" |
| Backlog Data | "No backlog loaded" | [ Upload Backlog JSON ] |
| Architecture Doc | "No architecture document loaded" | [ Upload Architecture Doc ] |
| Checks tab (meeting) | "No checks found — all stories passed validation" | — |

### Loading States

- **Page load**: Ant Design Skeleton components (gray placeholder blocks matching layout)
- **Pipeline processing**: Progress bar with step labels (shown in Meeting View)
- **Table load**: Skeleton rows (3-5 gray rows with shimmer animation)
- **Action in progress**: Button shows spinner, disabled until complete

### Error States

- **Pipeline failure**: Red banner at top of Meeting View: "Pipeline failed at [agent name]: [error message]. [ Retry ]"
- **API error**: Toast notification (red): "Failed to [action]: [error]. [ Retry ]"
- **Validation error**: Inline below the field (red text): "Invalid JSON format" / "File too large"
- **Network error**: Full-page overlay: "Connection lost. Retrying..." with auto-retry

### Toast Notifications

Success/error feedback after every action:

| Action | Toast |
|---|---|
| Story confirmed | Green: "Story '{title}' confirmed" |
| Story rejected | Red: "Story '{title}' rejected" |
| Check resolved | Green: "Check resolved" |
| Epic approved | Green: "Epic '{name}' approved — {N} stories assigned" |
| Epic rejected | Amber: "Epic '{name}' rejected — {N} stories reassigned" |
| Story edited | Blue: "Story updated — re-checking..." → Green: "Re-check complete" |
| Memo generated | Green: "Decision memo v{N} generated" |
| Data uploaded | Green: "Backlog data uploaded — {N} items loaded" |
| Pipeline started | Blue: "Processing meeting '{title}'..." |
| Pipeline complete | Green: "Meeting processed — {N} stories generated" |
| Error | Red: "Failed to [action]: [message]" with [ Retry ] |

### Notification Badge

Sidebar shows pending action count on the Action List menu item:

```
│  📋 Action List  (5)    │
```

Badge count = open checks + stories awaiting confirmation, filtered to current user's roles. Updates in real-time.

### Bulk Actions

Available on Meeting View → Stories tab when multiple stories have zero open checks:

```
│  [ ✓ Select All Confirmable (3) ]  [ Bulk Confirm ] [ Bulk Reject ] │
```

- **Bulk Confirm**: Confirms all selected stories with zero open checks. Confirmation dialog: "Confirm {N} stories?"
- **Bulk Reject**: Rejects all selected. Requires shared rationale.
- Only stories in "Awaiting Confirmation" status are selectable for bulk actions.

### Breadcrumbs

Shown on all pages below the header:

```
│  Meetings  >  Multi-LLM Provider Support  >  Stories                │
```

- Meetings list → Meeting title → current tab
- All Stories → Story title (links to Meeting View)
- Action List → Meeting title → Story title

### Keyboard Shortcuts

| Key | Action | Context |
|---|---|---|
| `↑` / `↓` | Navigate stories | Meeting View → Stories tab |
| `Enter` | Expand/collapse story | Meeting View → Stories tab |
| `C` | Confirm story (opens dialog) | Story expanded |
| `R` | Reject story (opens dialog) | Story expanded |
| `E` | Edit story | Story expanded |
| `Esc` | Close dialog / collapse story | Any |
| `Tab` | Next tab | Meeting View |
| `?` | Show keyboard shortcuts help | Any |

---

## UI Requirements Coverage

| System Concept Requirement | Page/Component |
|---|---|
| Per-meeting view | Meeting View (central hub with tabs) |
| Per-story view | Meeting View → Stories tab → inline story expand |
| Action list (per role) | Action List page (auto-filtered, badge count in sidebar) |
| Story list with statuses | All Stories page + Meeting View → Stories tab (paginated) |
| Check resolution panel | Story expand → Checks section + Checks tab |
| Story editing with drift detection | Story expand → Edit → re-check → drift warning |
| Final confirmation (all checks resolved) | Story expand → Confirm button + Bulk Confirm |
| Epic proposal approval | Meeting View → Stories tab → epic proposal section |
| Decision memo (on demand, versioned) | Meeting View → Memo tab |
| Metrics dashboard | Dashboard page (meetings + stories + checks) |
| Knowledge base browser | Knowledge Base page |
| Audit trail | Meeting View → Audit Trail tab |
| Data loading (backlog, architecture) | Data → Backlog Data, Architecture Doc pages |
| User/role management | Settings pages |
| Confidence levels displayed | Story list columns + story expand |
| Grounding status displayed | Story list columns + story expand |
| Backlog hygiene flags | Checks tab → Hygiene Flags section + Dashboard counter |
| Processing progress | Meeting View → progress bar with agent steps |
| Orphan story blocking | "No Epic" check prevents confirmation |

---

## AI Prompts Used

**Session 2.4 — UI Design (AI Build)**

Prompt: "Design all UI pages with wireframes, covering every requirement from the system concept. Meeting View is the central hub — memo, audit, stories all as tabs."

Key decisions:
- Meeting View is the hub — all meeting-related content in tabs, no separate pages
- Stories expand inline (no separate story page) — keeps context visible
- Meetings is the landing page, Action List shows badge count in sidebar
- Data loading pages follow the same upload/view/replace pattern
- All stories navigable from both All Stories list and Meeting View
- Check resolution happens inline within story expand

**Session 2.4 — UX Best Practices Review (AI Review)**

Prompt: "Check UI design against best practices, consistency, and requirements coverage."

Gaps found and fixed:
1. Backlog hygiene flags — added section in Checks tab + Dashboard counter
2. Empty/loading/error states — defined for every page
3. Toast notifications — defined for every action
4. Status color scheme — complete mapping for stories, checks, meetings, confidence, grounding
5. Standard table component — pagination, sorting, filters, row click behavior
6. Bulk confirm — select all confirmable stories, bulk action
7. Notification badge — Action List shows pending count in sidebar
8. Confidence + grounding in story list columns — visible without expanding
9. Breadcrumbs — on all pages
10. Keyboard shortcuts — power user navigation
11. Orphan story blocking — "No Epic" check prevents confirmation
12. Epic assignment editable — dropdown in story detail triggers re-check
13. Processing progress bar — agent-by-agent with human-readable labels
