# ERIS Architecture Description

**System:** Export Risk Insight Solution (ERIS)
**Version:** 0.7.5
**Last Updated:** 2025-11-06
**Owner:** GenAI Platform Team

---

## 1. Overview

ERIS is a web application for evaluating documents against export control regulations using AI-powered analysis. It supports multi-user authentication, document review workflows, configurable risk scoring, and integration with multiple LLM providers (Anthropic Claude, OpenAI, Google Gemini, Azure OpenAI).

The system is designed as a single-server monolithic application optimized for internal team use within a controlled network environment.

---

## 2. Technology Stack

| Layer | Technology | Version | Notes |
|---|---|---|---|
| Runtime | Node.js | 18+ | ES6 modules, CommonJS require |
| Web Framework | Express.js | 4.18.x | With CORS, trust proxy enabled |
| Database | SQLite3 | via better-sqlite3 12.x | WAL mode, synchronous writes |
| Session Store | session-file-store | 1.5.x | File-based session persistence |
| Authentication | bcrypt | 6.x | 10 salt rounds |
| Validation | Joi | 18.x | Schema-based request validation |
| AI - Anthropic | @anthropic-ai/sdk | latest | Claude 3.5 Sonnet, Opus |
| AI - OpenAI | openai | 6.x | GPT-4o, GPT-4 Turbo |
| AI - Google | @google/generative-ai | 0.24.x | Gemini models |
| Document Parsing | pdf-parse, mammoth, officeparser, xlsx | various | PDF, DOCX, PPTX, XLSX support |
| Image Processing | sharp, pdf-to-png-converter | 0.34.x / 3.10.x | PDF page rendering, image resizing |
| Logging | winston | 3.18.x | Structured logging |
| Frontend | Vanilla JavaScript | ES6 modules | No framework, SPA pattern |
| Process Manager | PM2 | production | Auto-restart, log management |

---

## 3. Component Architecture

```
+------------------------------------------------------------------+
|                        ERIS Application                          |
+------------------------------------------------------------------+
|                                                                  |
|  +------------------+    +-----------------------------------+   |
|  |   Express.js     |    |         Static Assets             |   |
|  |   Server         |    |  public/                          |   |
|  |   (server.js)    |    |  +-- index.html (SPA shell)       |   |
|  +--------+---------+    |  +-- styles.css                   |   |
|           |              |  +-- js/                           |   |
|           v              |      +-- main.js                  |   |
|  +------------------+    |      +-- api/ (API clients)       |   |
|  |   Middleware      |    |      +-- components/ (UI)         |   |
|  |  +-- CORS        |    |      +-- state/ (state mgmt)      |   |
|  |  +-- JSON body   |    |      +-- utils/ (helpers)         |   |
|  |  +-- Session     |    +-----------------------------------+   |
|  |  +-- Tab Session |                                            |
|  |  +-- Auth        |    +-----------------------------------+   |
|  |  +-- Error Hndlr |    |         Data Layer                |   |
|  +--------+---------+    |                                   |   |
|           |              |  SQLite DB (review-queue.db)       |   |
|           v              |  +-- documents table              |   |
|  +------------------+    |  +-- review_log table             |   |
|  |   Controllers    |    |  +-- ai_prompts table             |   |
|  |  +-- Auth        |    |                                   |   |
|  |  +-- Evaluation  |    |  JSON Files (data/)               |   |
|  |  +-- Review      |    |  +-- users.json                   |   |
|  |  +-- User        |    |  +-- llm-settings.json            |   |
|  |  +-- Prompt      |    |  +-- risk-category-rules.json     |   |
|  |  +-- Settings    |    |  +-- access-permissions.json      |   |
|  |  +-- Log         |    |  +-- global-prompt.txt            |   |
|  |  +-- DocTypes    |    |                                   |   |
|  +--------+---------+    |  File Storage                     |   |
|           |              |  +-- review-documents/            |   |
|           v              |  +-- images/                      |   |
|  +------------------+    |  +-- temp-images/                 |   |
|  |   Services       |    +-----------------------------------+   |
|  |  +-- AIService   |                                            |
|  |  +-- FileService |    +-----------------------------------+   |
|  |  +-- UserService |    |     External AI Providers         |   |
|  |  +-- LogService  |    |  +-- Anthropic API                |   |
|  |  +-- PromptSvc   |    |  +-- OpenAI API                   |   |
|  |  +-- SettingsSvc  |    |  +-- Google Gemini API            |   |
|  |  +-- CleanupSvc  |    |  +-- Azure OpenAI API             |   |
|  |  +-- DocTypesSvc |    +-----------------------------------+   |
|  +------------------+                                            |
+------------------------------------------------------------------+
```

### 3.1 Server Layer (server.js)

Entry point for the application. Responsibilities:
- Express app initialization and middleware pipeline configuration
- Service and controller dependency injection (manual, constructor-based)
- Route mounting under configurable `BASE_PATH` (default: `/ai-ex`)
- Static file serving for the SPA frontend
- Health check endpoints
- HTTP and optional HTTPS listener startup
- JSON body size limit: 50 MB

### 3.2 Middleware Pipeline

Requests pass through middleware in this order:

1. **CORS** -- open CORS policy (internal tool)
2. **JSON body parser** -- 50 MB limit for large document text
3. **JSON error handler** -- catches malformed JSON payloads
4. **Session** -- express-session with file-based store, 24-hour rolling expiration
5. **Tab session** -- maps browser tabs to independent user sessions for multi-tab, multi-user support
6. **Route-level auth** -- per-route authentication and role checks

### 3.3 Controllers

Thin request/response handlers. Each controller receives injected services and delegates business logic. Controllers handle:
- Request parameter extraction
- Calling service methods
- Formatting HTTP responses
- Error propagation to error middleware

### 3.4 Services

Business logic layer. Each service is instantiated once at startup and shared across controllers.

| Service | Responsibility |
|---|---|
| AIService | LLM provider abstraction -- routes requests to Claude, OpenAI, Gemini, or Azure OpenAI based on configuration |
| FileService | Document text extraction (PDF, DOCX, PPTX, XLSX, TXT), image extraction, temporary file management |
| UserService | User CRUD, password hashing/verification, role management. Reads/writes `users.json` |
| LogService | Assessment log append/read/clear. Writes to `assessment_log.txt` |
| PromptService | Per-user and global prompt management. Reads/writes prompt files in data directory |
| SettingsService | LLM settings, risk category rules, access permissions. Reads/writes JSON config files |
| CleanupService | Periodic cleanup of temporary images and orphaned files |
| DocumentTypesService | Document type classification configuration |

### 3.5 Database Layer (database.js)

Single SQLite database file (`data/review-queue.db`) using `better-sqlite3` (synchronous API).

**Configuration:**
- WAL (Write-Ahead Logging) mode enabled for improved concurrent read performance
- Schema migrations handled inline via `ALTER TABLE ... ADD COLUMN` with try/catch (idempotent)
- Indexes on `review_status`, `assigned_reviewer`, `submitted_date`, `document_id`

**Tables:**

| Table | Purpose | Key Columns |
|---|---|---|
| `documents` | Document metadata and review state | document_id, document_name, owner, review_status, risk_score, risk_category, assessment_outcomes, assigned_reviewer, file_path, file_type, file_size, parsed_text, parsed_images_dir |
| `review_log` | Audit trail for review actions | document_id, reviewer, action_type, previous_status, new_status, reviewer_comment, review_date |
| `ai_prompts` | Versioned AI prompt library | prompt_id, prompt_name, prompt_text, document_type, status, version, user, visibility |

### 3.6 Frontend (public/)

Single-page application served as static files. No build step or bundler.

- **index.html** -- SPA shell with sidebar navigation
- **styles.css** -- all application styles in a single file
- **js/main.js** -- application initialization and module loading
- **js/api/** -- API client modules (one per backend domain: auth, evaluate, review, settings, etc.)
- **js/components/** -- UI components (evaluation forms, review queue, user admin, settings panels)
- **js/state/** -- Client-side state management
- **js/utils/** -- Shared utility functions

Communication with the backend is via `fetch()` calls to the REST API. No WebSocket or real-time push.

---

## 4. API Contracts

All endpoints are prefixed with `BASE_PATH` (default: `/ai-ex`).

### 4.1 Authentication

| Method | Path | Description | Auth Required |
|---|---|---|---|
| POST | /api/auth/login | Authenticate user, create session | No |
| POST | /api/auth/logout | Destroy session | Yes |
| GET | /api/auth/session | Return current session state and user info | Yes |
| POST | /api/auth/change-password | Change password (requires old password) | Yes |

### 4.2 Document Evaluation

| Method | Path | Description | Auth Required |
|---|---|---|---|
| POST | /api/evaluate | Evaluate raw text against export control regulations | Yes |
| POST | /api/evaluate-file | Upload and evaluate a single file (multipart/form-data) | Yes |
| POST | /api/evaluate-batch | Upload and evaluate multiple files with progress tracking | Yes |

**Supported file types:** PDF, DOC, DOCX, TXT, PPTX, XLSX, XLS

**Response shape (evaluation result):**
```json
{
  "riskCategory": "Restricted|High|Medium|Low|Minimal",
  "riskScore": 0-100,
  "reasoning": "...",
  "triggerParagraphs": ["..."],
  "assessmentOutcomes": { ... }
}
```

### 4.3 Review Queue

| Method | Path | Description | Auth Required |
|---|---|---|---|
| GET | /api/review-queue/documents | List documents in review queue (filterable by status) | Yes |
| POST | /api/review-queue/submit | Submit evaluated document for review | Yes |
| POST | /api/review-queue/claim | Claim a document for review (prevents double-review) | Yes |
| POST | /api/review-queue/approve | Approve a claimed document | Yes |
| POST | /api/review-queue/decline | Decline a claimed document (with reason) | Yes |
| POST | /api/review-queue/release | Release claimed document back to queue | Yes |
| GET | /api/review-queue/document/:id | Get full document details including assessment | Yes |
| POST | /api/review-queue/auto-action | Claim and complete review in a single action | Yes |

### 4.4 User Management

| Method | Path | Description | Auth Required | Role Required |
|---|---|---|---|---|
| GET | /api/users | List all users | Yes | Administrator |
| POST | /api/users | Create new user | Yes | Administrator |
| PUT | /api/users/:id | Update user details and role | Yes | Administrator |
| DELETE | /api/users/:id | Delete user | Yes | Administrator |

### 4.5 Settings and Configuration

| Method | Path | Description | Auth Required |
|---|---|---|---|
| GET | /api/settings/prompt | Get current user's prompt | Yes |
| POST | /api/settings/prompt | Save current user's custom prompt | Yes |
| GET | /api/settings/global-prompt | Get global prompt | Yes |
| POST | /api/settings/global-prompt | Save global prompt | Yes (privileged) |
| POST | /api/settings/push-global-prompt | Overwrite all user prompts with global prompt | Yes (privileged) |
| GET | /api/settings/llm | Get LLM provider settings | Yes |
| POST | /api/settings/llm | Save LLM provider settings | Yes (privileged) |
| POST | /api/settings/llm-test | Test LLM connection with current settings | Yes |
| GET | /api/settings/risk-category-rules | Get risk score threshold rules | Yes |
| POST | /api/settings/risk-category-rules | Save risk score threshold rules | Yes (privileged) |
| GET | /api/settings/access-permissions | Get role-based access permissions | Yes |
| POST | /api/settings/access-permissions | Save role-based access permissions | Yes (privileged) |

### 4.6 Logging

| Method | Path | Description | Auth Required |
|---|---|---|---|
| GET | /api/log | Get assessment log (filtered by user role) | Yes |
| DELETE | /api/log | Clear assessment log | Yes (privileged) |

### 4.7 Health

| Method | Path | Description | Auth Required |
|---|---|---|---|
| GET | /health | Basic health check | No |
| GET | /api/health | Health check with LLM configuration status | No |

---

## 5. Data Flows

### 5.1 Document Assessment Flow

```
User uploads file
       |
       v
[Express Multer middleware]  -- validates file type, enforces size limit
       |
       v
[FileService.extractText()]  -- pdf-parse / mammoth / officeparser / xlsx
       |                        extracts text content from binary format
       v
[PromptService.getPrompt()]  -- resolves user custom prompt or global prompt
       |
       v
[AIService.evaluate()]  -- sends extracted text + prompt to configured LLM
       |                   provider (Claude / OpenAI / Gemini / Azure)
       |                   API call with retry logic for transient failures
       v
[Parse LLM response]  -- extracts risk score, category, reasoning,
       |                  trigger paragraphs from structured AI output
       v
[Apply risk-category-rules.json]  -- overrides LLM category based on
       |                             numeric score thresholds
       v
[LogService.appendLog()]  -- writes assessment record to assessment_log.txt
       |                     (username, IP, timestamp, filename, result)
       v
[Return result to client]  -- JSON response with risk assessment
```

### 5.2 Review Queue Flow

```
                    +------------------+
                    |    submitted     |  <-- analyst submits evaluated document
                    +--------+---------+
                             |
                    reviewer claims doc
                             |
                             v
                    +------------------+
                    |  under_review    |  <-- assigned_reviewer set, assigned_date recorded
                    +--------+---------+
                             |
               +-------------+-------------+
               |             |             |
            approve       decline       release
               |             |             |
               v             v             v
        +-----------+  +-----------+  +------------------+
        |  approved |  | declined  |  |    submitted     |
        +-----------+  +-----------+  | (back to queue)  |
                                      +------------------+

Each state transition is recorded in review_log with:
  - reviewer username
  - action_type (submit, claim, approve, decline, release)
  - previous_status and new_status
  - reviewer_comment
  - timestamp
```

### 5.3 Session and Authentication Flow

```
POST /api/auth/login
       |
       v
[UserService.verifyPassword()]  -- bcrypt.compare against users.json
       |
       v
[express-session creates session]  -- stored as file on disk
       |                              (session-file-store)
       v
[Set HTTP-only cookie]  -- 24-hour rolling expiry
       |                   secure flag in production
       v
[setupTabSession middleware]  -- maps tab ID header to session
       |                        enables multi-tab multi-user
       v
[Subsequent requests]  -- session validated on every authenticated endpoint
```

---

## 6. Data Storage Strategy

ERIS uses a hybrid storage approach:

| Data Type | Storage Mechanism | Rationale |
|---|---|---|
| Review queue documents and audit log | SQLite database (`review-queue.db`) | Relational queries, status filtering, transactional integrity |
| AI prompt library | SQLite database (`review-queue.db`, `ai_prompts` table) | Versioning, querying by type and status |
| User accounts | JSON file (`users.json`) | Simple CRUD, small dataset (<100 users), no relational needs |
| LLM configuration | JSON file (`llm-settings.json`) | Key-value config, rarely changes |
| Risk threshold rules | JSON file (`risk-category-rules.json`) | Simple threshold map |
| Access permissions | JSON file (`access-permissions.json`) | Role-permission matrix |
| Global prompt | Text file (`global-prompt.txt`) | Single large text blob |
| Assessment history | Text file (`assessment_log.txt`) | Append-only log |
| Uploaded documents | File system (`review-documents/`) | Binary files, not suitable for SQLite BLOBs |
| Extracted images | File system (`images/`, `temp-images/`) | Binary image files served statically |
| Sessions | File system (via session-file-store) | Avoids DB dependency for session reads |

**Key design decision:** Uploaded documents are stored as files on disk, not as BLOBs in the database. The database stores only the `file_path` reference. This avoids SQLite database bloat and keeps document serving efficient via Express static middleware.

---

## 7. Constraints

### 7.1 Architectural Constraints

- **Single-server deployment.** No horizontal scaling, load balancing, or clustering. All state (DB, files, sessions) is local to one machine.
- **SQLite single-writer.** SQLite supports only one concurrent write transaction. WAL mode allows concurrent reads during writes but does not solve write contention. Under heavy simultaneous write load (e.g., multiple batch evaluations submitting to the review queue), requests will serialize at the database level.
- **No message queue or background workers.** All processing (including LLM API calls) happens synchronously within the Express request lifecycle. Long-running LLM evaluations block the request until completion.
- **File-based session store.** Sessions are stored as JSON files on disk. Session lookups involve filesystem reads. Not suitable for high session volumes.
- **No CDN or asset pipeline.** Frontend assets are served directly by Express. No minification, bundling, or cache-busting beyond browser defaults.
- **JSON file-based configuration.** User accounts, settings, and permissions are stored as JSON files read/written with `fs.readFileSync`/`fs.writeFileSync`. Concurrent writes to the same JSON file can cause data loss (last-write-wins with no locking).

### 7.2 Security Constraints

- **Session secret must be consistent across restarts** -- changing it invalidates all active sessions.
- **No CSRF protection** -- relies on CORS and HTTP-only cookies.
- **API keys stored in environment variables** -- not rotated automatically.
- **No rate limiting** on authentication endpoints.

### 7.3 Operational Constraints

- **No database backup automation** -- SQLite file must be copied manually or via deployment scripts.
- **No health check beyond HTTP ping** -- no deep checks for LLM provider connectivity or disk space.
- **Log files grow unbounded** -- `assessment_log.txt` is append-only with no rotation.

---

## 8. Deployment Model

### 8.1 Environments

| Environment | Host | Access |
|---|---|---|
| Development | Local machine | `npm start` or `npm run dev` (nodemon) |
| SSH Server | 192.168.1.239 (on-premise) | SSH + PM2 process manager |
| Azure | genai-rtx-eris-ui (App Service) | Azure CLI deployment |

### 8.2 Deployment Process

**Code-only deployment (preserves user data):**
```
Developer machine --[deploy-code.sh]--> Target server
  - Copies application code (server.js, public/, server/, package.json)
  - Runs npm install on target
  - Restarts PM2 process
  - Does NOT overwrite data/ directory
```

**Full deployment (overwrites data):**
```
Developer machine --[deploy-full.sh]--> Target server
  - Copies entire application including data/
  - Runs npm install on target
  - Restarts PM2 process
  - WARNING: Overwrites users, settings, database
```

### 8.3 PM2 Configuration

The application runs under PM2 in production with configuration generated by `generate-ecosystem-config.js`. PM2 provides:
- Automatic restart on crash
- Log management (stdout/stderr)
- Process monitoring
- Startup script for system boot

### 8.4 SSL/HTTPS

- Optional HTTPS listener on configurable port (default 443)
- SSL certificates via Let's Encrypt (certbot)
- Automatic certificate renewal configured via setup-ssl.sh
- PM2 restarts app after certificate renewal

### 8.5 Deployment Topology

```
+---------------------+
|   Client Browser    |
+----------+----------+
           |
      HTTPS (443)
           |
           v
+---------------------+        +---------------------+
|   ERIS Server       |        |   AI Provider APIs  |
|   (PM2 + Node.js)   +------->|   - Anthropic       |
|                     |  HTTPS |   - OpenAI          |
|   Express App       |        |   - Google Gemini   |
|   SQLite DB         |        |   - Azure OpenAI    |
|   File Storage      |        +---------------------+
|   Session Files     |
+---------------------+
     Single server
     (on-prem or Azure)
```

---

## 9. Non-Functional Requirements and Constraints

### 9.1 Performance

| Metric | Target | Rationale |
|---|---|---|
| Max concurrent users | ~20-30 | SQLite single-writer bottleneck; file-based sessions; single Node.js event loop |
| API response time (non-LLM) | < 200 ms | Local SQLite reads and JSON file reads are fast |
| API response time (LLM evaluation) | 5-30 seconds | Determined by LLM provider API latency and document size; not controllable |
| Batch evaluation throughput | ~5 documents/minute | Sequential LLM calls per batch; no parallelism within a batch |
| Maximum request body size | 50 MB | Express JSON body parser limit; covers large document text |
| Maximum upload file size | Configured via Multer | Default varies; typically 10-50 MB per file |

### 9.2 Storage

| Metric | Constraint | Notes |
|---|---|---|
| SQLite database size | Practical limit ~1 GB | Performance degrades with very large databases; WAL mode helps but does not eliminate |
| Review documents on disk | Limited by server disk space | No automatic cleanup of approved/declined documents |
| Temporary images | Cleaned by CleanupService | Periodic cleanup of extracted images |
| Assessment log file | Unbounded growth | No log rotation; manual cleanup required |
| Session files | One file per active session | 24-hour expiry prevents unbounded growth |

### 9.3 Availability

| Metric | Expectation |
|---|---|
| Uptime target | Best-effort; PM2 auto-restart on crash |
| Recovery time | Seconds (PM2 restart) to minutes (manual intervention) |
| Data durability | SQLite WAL mode provides crash recovery; no replication or backup automation |
| Failover | None; single server, no redundancy |

### 9.4 Scalability Limitations

- **Vertical only.** Adding CPU/RAM to the server is the only scaling option.
- **SQLite write serialization.** Under concurrent write load, requests queue at the database. This becomes the bottleneck before CPU or memory.
- **No connection pooling.** `better-sqlite3` uses a single synchronous connection. This is by design (SQLite is an embedded database, not a client-server DBMS).
- **Session file I/O.** Each request reads a session file from disk. At high session volumes (100+), this adds latency.
- **LLM API rate limits.** External provider rate limits (tokens/minute, requests/minute) constrain evaluation throughput independently of server capacity.

### 9.5 Security

| Requirement | Implementation |
|---|---|
| Password storage | bcrypt with 10 salt rounds |
| Session security | HTTP-only cookies, 24-hour rolling expiry, secure flag in production |
| Input validation | Joi schemas on all API endpoints |
| SQL injection prevention | Parameterized queries via better-sqlite3 |
| XSS prevention | No server-side HTML rendering; frontend uses textContent for user data |
| File upload restrictions | File type whitelist, size limits via Multer |
| Role-based access | Configurable per-role permissions checked on each request |

---

## 10. Error Handling

The application uses a structured error hierarchy:

| Error Class | HTTP Status | Usage |
|---|---|---|
| ValidationError | 400 | Invalid request parameters (Joi validation failures) |
| AuthenticationError | 401 | Invalid credentials or expired session |
| AuthorizationError | 403 | Insufficient role/permissions |
| NotFoundError | 404 | Resource not found |
| ConflictError | 409 | Duplicate resource or state conflict (e.g., document already claimed) |
| FileProcessingError | 422 | Document parsing failure |
| AIServiceError | 502 | LLM provider API failure |

A global error handler middleware catches all errors and returns consistent JSON error responses.

---

## 11. User Roles

| Role | Capabilities |
|---|---|
| Administrator | Full access: user management, global settings, all features |
| Master Analyst | Evaluation, review queue, prompt management, settings |
| Analyst | Evaluation, review queue, personal prompt customization |
| Export Control | Review queue access for compliance review |
| User | Basic evaluation only |

Role-based access is configured via `access-permissions.json` and enforced at the middleware level on each route.

---

*This document describes the architecture as implemented in ERIS v0.7.5. It reflects the production codebase deployed to both on-premise (SSH) and Azure environments.*
