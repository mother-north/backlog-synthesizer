# Meeting Notes — Database & Session Management Architecture Review

**Date:** 2025-10-23
**Attendees:** Mike (Architect), Alex (Dev Lead), Sarah (PM)
**Duration:** 50 minutes
**Location:** Conference Room B

---

**Mike (Architect):** I called this meeting because we need to make some architectural decisions before we take on more feature work. There are a few things coming to a head around the database layer and session management, and I want to make sure we're aligned on constraints before people start building things that won't work.

**Alex (Dev Lead):** Sure. What's on the list?

**Mike (Architect):** Three topics. First, SQLite scalability and what it means for features in the pipeline. Second, session management — the file-based session store is causing issues. Third, the database migration strategy for the schema changes we've been accumulating.

**Alex (Dev Lead):** Let's start with SQLite. I know there have been concerns.

**Mike (Architect):** Right. So SQLite is great for what we're doing — it's embedded, zero-config, fast for reads, and our dataset is small. But it has hard limitations that constrain what we can build. The big one is single-writer. WAL mode gives us concurrent reads, but writes are serialized. One write transaction at a time. Period.

**Sarah (PM):** What does that mean practically?

**Mike (Architect):** It means features that require frequent concurrent writes will bottleneck. The review queue is okay because it's mostly reads with occasional writes when someone claims or approves a document. But if we're talking about features like real-time collaboration — where multiple users are editing or annotating the same document simultaneously — that's not going to work with SQLite. The write contention would kill performance.

**Alex (Dev Lead):** Is anyone asking for real-time collaboration?

**Mike (Architect):** There's been talk about it. I've seen it mentioned in the backlog — collaborative review features, real-time notifications, a live dashboard. Some of those items assume we can push updates to multiple clients simultaneously. We can't. Not with our current architecture. We don't have WebSockets, we don't have a pub/sub layer, and SQLite can't handle the write volume that real-time features generate.

**Sarah (PM):** So are you saying we should drop those features?

**Mike (Architect):** I'm saying we need to be explicit about it. We're not going to implement real-time collaboration. It's too complex for SQLite, and adding a proper real-time layer — WebSockets, Redis pub/sub, a different database — would be a fundamental re-architecture. That's not on the table for this version of ERIS. We're a single-server monolith with an embedded database, and we should design features that fit that model.

**Alex (Dev Lead):** I agree. The in-app notification center and the real-time dashboard items in the backlog — those both assume push-based updates to the client. If we're ruling out WebSockets and real-time push, those features are effectively dead.

**Mike (Architect):** Exactly. We should mark them as won't-do or deferred indefinitely, and make sure nobody picks them up. Any feature that requires real-time server push is out of scope until we revisit the architecture.

**Sarah (PM):** Okay. I'll update the backlog. Which items specifically are we talking about?

**Mike (Architect):** The in-app notification center — the one with the bell icon and real-time alerts. And the real-time evaluation metrics dashboard. Both require a push channel we don't have and won't build.

**Alex (Dev Lead):** The notification center also depends on the email notification system, right? Are we dropping email notifications too?

**Mike (Architect):** No, email notifications are fine. Those are fire-and-forget — the server sends an email via SMTP, no push channel needed. It's just the in-app real-time piece that's the issue. Email notifications can proceed as planned.

**Sarah (PM):** Good distinction. So email notifications stay, in-app real-time notifications go. Got it.

**Mike (Architect):** Now, let's talk about session management. We're using session-file-store, which stores each session as a JSON file on disk. It works, but there are issues.

**Alex (Dev Lead):** The main issue I've seen is performance under load. Every request reads a session file from disk. When we have 20 users active simultaneously, that's a lot of file I/O. The session lookup adds maybe 5-10ms per request normally, but during peak usage I've seen it spike to 50ms.

**Mike (Architect):** It's worse than that. The session-file-store doesn't handle concurrent access gracefully. If two requests from the same user hit the server at almost the same time — which happens constantly with the SPA making parallel API calls — they both try to read the same session file. Occasionally one of them gets a partial read and the session data is corrupted. The user gets logged out randomly.

**Sarah (PM):** Is that the random logout bug users have been reporting?

**Mike (Architect):** I believe so, yes. The fix is to move sessions to SQLite. Better-sqlite3 handles concurrent reads natively with WAL mode, and the synchronous API means we don't have the race conditions that the file store has. We'd use a `sessions` table with the session ID, data, and expiry columns. Reads are fast — SQLite index on session ID, no file I/O latency.

**Alex (Dev Lead):** What about the write contention issue you just mentioned? If sessions go into SQLite, every request that touches the session — which is every authenticated request — does a write to update the rolling expiry.

**Mike (Architect):** Good catch. We can mitigate that by only updating the session expiry on a throttled basis — say, once every 5 minutes instead of on every request. The resave interval is configurable in express-session. We set `resave: false` and `saveUninitialized: false`, and only touch the session when we actually modify session data. The rolling window becomes a 5-minute granularity instead of per-request, which is fine for a 24-hour session lifetime.

**Alex (Dev Lead):** That's reasonable. The migration path — how do we get existing sessions from files to SQLite?

**Mike (Architect):** We don't. We deploy the new session store and all existing sessions expire. Users have to re-login once after the upgrade. It's a one-time disruption and it's the simplest approach. Trying to migrate session files into a database table is fragile and not worth the engineering effort.

**Sarah (PM):** Is one forced re-login acceptable? How do we communicate that?

**Mike (Architect):** We add it to the release notes. It's an internal tool, and the session expires in 24 hours anyway. Worst case, someone has to log in one extra time.

**Alex (Dev Lead):** I'm on board. Now, the migration strategy for database schema changes — we've been doing those with the `ALTER TABLE ... ADD COLUMN` pattern wrapped in try/catch. That works for adding columns, but it doesn't handle anything else. We can't rename columns, change types, or drop columns in SQLite without recreating the table.

**Mike (Architect):** Right. Our current "migration" approach is really just additive schema changes that are idempotent because of the try/catch. It's worked so far because we've only added columns. But the audit_log table we discussed for batch processing, the sessions table, and any future schema changes need a proper migration system.

**Alex (Dev Lead):** What are you proposing?

**Mike (Architect):** A simple numbered migration system. Each migration is a SQL file: `001_initial_schema.sql`, `002_add_sessions_table.sql`, `003_add_audit_log.sql`. We track which migrations have been applied in a `schema_migrations` table. On startup, the app checks and runs any pending migrations. It's a pattern used by every framework — Rails, Django, Knex. We just need a lightweight version.

**Alex (Dev Lead):** No dependency? Just raw SQL files and a runner?

**Mike (Architect):** Exactly. We don't need a full ORM or migration framework. A simple function that reads the migration directory, checks which ones are applied, and executes the new ones in a transaction. Maybe 50 lines of code. I can have it ready by end of sprint.

**Sarah (PM):** That sounds low-risk and high-value. Let's do it.

**Mike (Architect):** One last thing. The hybrid storage strategy — SQLite for transactional data, JSON files for configuration, files on disk for documents. I want to confirm we're keeping that architecture. I've heard murmurs about moving everything into SQLite, and I want to push back on that. The JSON files for settings, users, and permissions are simple, human-readable, and easy to debug. Moving them to SQLite adds complexity with no real benefit at our scale.

**Alex (Dev Lead):** I agree. The JSON files work. The only issue is concurrent writes to users.json when two admins create users at the same time, but that's an edge case we can solve with a file lock if it ever becomes a problem.

**Sarah (PM):** So the data storage strategy stays as-is. SQLite for review queue and audit data, JSON for config, files for documents. Sessions move from files to SQLite. Real-time features are dropped. Migration system gets built. Is that the summary?

**Mike (Architect):** That's it. Clean and clear.

---

**Decisions:**
1. Real-time collaboration features are OUT OF SCOPE — SQLite cannot support the write volume, and adding WebSockets/pub-sub is a re-architecture not justified for the current version. In-app notification center and real-time dashboard items in the backlog should be marked as deferred/won't-do.
2. Session store migrates from file-based to SQLite — resolves random logout bugs and improves performance. All existing sessions invalidated on deployment; users re-login once.
3. Database migration system: numbered SQL files tracked in a `schema_migrations` table. Applied on app startup.
4. Hybrid storage strategy confirmed: SQLite for transactional data (review queue, audit log, sessions), JSON files for configuration (users, settings, permissions), file system for documents.

**Action Items:**
- Mike: Build migration runner (numbered SQL files + schema_migrations table) by end of sprint
- Alex: Implement SQLite session store to replace session-file-store
- Sarah: Update backlog — mark real-time notification center and real-time dashboard as deferred/won't-do
- Alex: Create migration files for sessions table and audit_log table
