# Meeting 12: Q1 2026 Quarterly Planning

**Date:** 2025-10-16
**Time:** 9:00 AM - 11:30 AM
**Location:** Main Conference Room / Teams
**Attendees:** Sarah (PM), Mike (Architect), Alex (Dev Lead), Chris (Product), Jordan (QA)
**Meeting Type:** Quarterly Planning

---

**Sarah:** Good morning everyone. This is our quarterly planning session for Q1. We have a lot of ground to cover — I want to go through every feature area and come out with a prioritized plan. I've grouped the agenda by area: risk engine, review queue, user management, LLM integration, document processing, regulation library, and deployment. Let's be disciplined and get through all of them. Starting with the risk engine.

## Risk Assessment Engine

**Sarah:** Alex, where are we with the risk engine backlog?

**Alex:** The core scoring algorithm is done and in production. Configurable thresholds are done. The NaN bug for empty documents — ERIS-012 — is almost closed, just finishing the edge case for image-only PDFs. For Q1, the main item is the risk score trend analysis — ERIS-014. Users want to see how risk scores change when they re-evaluate documents over time.

**Chris:** That's a popular request. Analysts evaluate the same documents after making redactions or edits, and they want to see the score trajectory. We should track evaluation history per document, identified by content hash, and show a trend indicator — up, down, or stable — next to the current score.

**Mike:** Implementation-wise, we'll need a new database table linking document hashes to score history. The lookup needs to be fast — sub-200ms — so we should index on the content hash column.

**Sarah:** Got it. What about the assessment log CSV export issue? ERIS-082?

**Alex:** That's the truncation bug — reasoning text gets cut off at 500 characters in exports. Straightforward fix. We just need to remove the character limit in the export function and handle CSV escaping properly for long text fields.

**Sarah:** Let's schedule that for early Q1. Next — I want to add a new requirement here. Chris, you mentioned that the compliance team wants the ability to customize which risk categories trigger automatic review queue submission. Right now any document over a certain threshold goes to the queue, but they want per-category rules.

**Chris:** Exactly. They want Restricted documents to always go to the queue, High documents to go to the queue only if the score is above 80, and Medium documents to be optional. Basically configurable auto-submission rules per risk category.

**Mike:** That's a settings change plus some business logic in the evaluation flow. After the risk score is computed and the category assigned, we'd check the auto-submission rules and route accordingly. Store the rules in risk-category-rules.json or maybe a new config file.

**Sarah:** Let's write that up as a new story under ERIS-001. Moving on.

## Review Queue

**Sarah:** Jordan, review queue status?

**Jordan:** Filtering and sorting — ERIS-022 — is partially done. We have status filtering working but risk category filtering and date range filtering still need implementation. The count badge bug — ERIS-023 — is in progress, Alex said it's a quick fix.

**Alex:** Yes. The fix is to emit a custom event after any queue action and have the sidebar component listen for it. I'll have it done this week.

**Sarah:** Good. What new work do we need for Q1?

**Chris:** Two things. First, we need a reviewer assignment system. Right now it's a free-for-all — anyone with the right role can claim any document. The compliance team wants the ability to assign specific documents to specific reviewers based on expertise or workload. Like, documents flagged for ITAR should go to reviewers with ITAR experience.

**Jordan:** That's going to change the whole claim workflow. Right now the flow is: document enters queue, any reviewer claims it. With assignment, you'd have an assignment step in between — either manual assignment by a lead or automatic assignment based on rules.

**Mike:** We should support both. Manual assignment by a team lead, plus optional auto-assignment rules based on risk category or document type. The database already has the assigned_reviewer column, so we can extend the existing schema.

**Sarah:** Okay, that's a significant story. Second item, Chris?

**Chris:** Review SLA tracking. The compliance team wants to set time-based SLAs for review completion — like, Restricted documents must be reviewed within 4 hours, High within 24 hours. If the SLA is approaching, it should escalate — maybe reassign or send an alert.

**Alex:** That requires a background process to check for overdue reviews. We don't have any background workers right now — everything runs in the Express request lifecycle. We'd need to add a scheduled task, either via node-cron inside the app or a separate PM2 process.

**Mike:** I'd recommend node-cron inside the existing process. Keeps the deployment simple. It checks for approaching SLA deadlines every 5 minutes and triggers alerts.

**Sarah:** Write it up. SLA monitoring with escalation. Let's also add a requirement for bulk review actions — the ability to approve or decline multiple documents at once. Jordan, I've seen analysts clicking through 20 documents one at a time.

**Jordan:** Yes, bulk actions would save a lot of time. Select multiple documents, click "Approve All" or "Decline All." Each still gets its own audit log entry, but the reviewer doesn't have to click through each one individually.

**Sarah:** Good. And one more on review queue — the document preview bug with special characters in filenames, ERIS-091. Let's fix that in Q1.

## User Management & Authentication

**Sarah:** Moving to user management. Mike, any architectural concerns?

**Mike:** Yes, two things. First, password complexity — ERIS-034. We need to implement this for compliance. The security audit flagged that we have no password policy enforced. Minimum 12 characters, mixed case, number, special character, 90-day expiration. This is a must-have for Q1.

**Sarah:** Agreed, it's a compliance blocker. What else?

**Mike:** Second — we need to add multi-factor authentication. This wasn't in the original scope but the security review recommended it for any tool handling export-controlled data. Time-based one-time password, TOTP, using an authenticator app. It should be optional per user but enforceable by admin policy.

**Chris:** That's big. How long?

**Alex:** Two to three weeks for a solid implementation. We need TOTP secret generation, QR code display for setup, verification during login, and recovery codes. Plus the admin settings to enforce it. We'd integrate a library like speakeasy or otpauth for the TOTP logic.

**Sarah:** Let's plan it for mid-Q1. Before MFA, let's fix the self-deletion bug — ERIS-035 — where an admin can delete their own account and lock everyone out.

**Jordan:** That's an easy one. API check: if user_id equals current session user_id, return 403. Plus a check that at least one admin always exists.

**Sarah:** And one more — we need a user activity log. Not just the assessment log, but a log of user actions: login, logout, password changes, role changes, settings modifications. This is for the security audit.

**Mike:** That ties into ERIS-080, the cross-cutting audit logging requirement. If we implement ERIS-080 properly, user activity logging comes for free.

## LLM Integration

**Sarah:** LLM area. Where are we on Gemini support?

**Alex:** ERIS-044 is in the backlog. The @google/generative-ai SDK is already in our package.json — we added it a while back. The main work is extending AIService to support Gemini's API format, adding it to the provider dropdown, and testing. I'd estimate one sprint.

**Chris:** Users are also asking about model version pinning. Right now when we select "Claude 3.5 Sonnet" we get whatever the latest version is. If Anthropic updates the model, our risk scores might change overnight without us knowing. We should let admins pin to a specific model version and get notified when newer versions are available.

**Mike:** Good point. We should store the full model identifier, including version, in llm-settings.json. And add a check on startup or daily that queries the provider API for available models and flags if a newer version exists.

**Sarah:** New story: LLM model version pinning with update notifications. What about the connection test bug — ERIS-042?

**Alex:** That one's in progress. The fix is to send a minimal real evaluation request during the connection test instead of just validating the API key. We'll send a short test string and verify we get a properly formatted response. That catches quota issues and model access problems.

**Sarah:** And we need to add LLM response time monitoring. Track how long each evaluation API call takes, store it, and surface it in the metrics dashboard. This helps us detect when a provider is degrading.

**Mike:** We can add timing instrumentation in AIService.evaluate(). Start timer before the API call, stop after response. Store the duration alongside the evaluation result in the assessment log. We'd need to extend the log format to include response_time_ms.

**Sarah:** Great. One more — we need configurable token limits per provider. Each LLM has different context windows. We should warn users when their document plus prompt plus regulation context approaches the token limit for their configured model.

**Alex:** That requires a token counting utility. Anthropic has a token counting API, OpenAI has tiktoken, Gemini has its own. We'd need provider-specific token counting integrated into the evaluation flow. Show a warning if we're within 10% of the model's context limit.

## Document Processing

**Sarah:** Document processing. The big one is the Excel memory crash — ERIS-054.

**Alex:** Yes, it's critical and in progress. The fix is to switch from loading the entire workbook into memory to a streaming approach using the xlsx library's stream reader. For files over 10MB, we process sheet by sheet and row by row. I expect it done within the first two weeks of Q1.

**Jordan:** I need to mention the PPTX crash bug too — ERIS-052. It's been blocked for a while. The issue is that officeparser chokes on embedded video elements. We need to either patch officeparser or use a try-catch wrapper that skips non-text elements gracefully.

**Alex:** I'd go with the try-catch wrapper. We wrap each element extraction in error handling and skip anything that fails, logging what was skipped. That's resilient to any unexpected content type, not just videos.

**Sarah:** Do it. What new work for Q1?

**Chris:** OCR for image-only PDFs. ERIS-053. This keeps coming up. Analysts upload scanned documents and get empty evaluations because there's no text to extract. We need Tesseract or a similar OCR library integrated into the extraction pipeline.

**Mike:** Tesseract via tesseract.js would work without native dependencies. But OCR is slow — a 10-page scanned PDF could take 30 seconds to process. We need progress indication and should consider processing OCR asynchronously.

**Alex:** Async OCR is a problem because we don't have background workers. We discussed this in the review queue SLA section too. Maybe Q1 is the quarter we introduce a basic job queue — even if it's just an in-process queue using something like bull or bee-queue backed by file storage instead of Redis.

**Sarah:** That's a bigger conversation. Let's handle OCR synchronously for now with a progress bar, and plan the job queue as a separate initiative. One more document processing item — we need to support MSG and EML email file formats. The compliance team evaluates emails frequently and they're currently copy-pasting email text into the evaluation box.

**Chris:** Good one. MSG is Outlook format, EML is standard. We should support both with metadata extraction — from, to, subject, date, body, and any attachment text.

**Alex:** There's an npm package, msg-reader, for MSG files, and EML is basically MIME parsing which we can do with mailparser. Attachments within emails should be recursively processed through our existing extraction pipeline.

**Sarah:** New story: email file format support for MSG and EML. 

## Regulation Library

**Sarah:** We covered a lot of this in meeting 9, but let me capture the Q1 specifics. The existing CRUD work — ERIS-060 — should be completed. Version control — ERIS-061 — is next. Then integration with AI prompts — ERIS-062.

**Mike:** For Q1, I think we can realistically get CRUD done and version control started. The prompt integration is gated on token counting, which we just discussed under LLM integration. So there's a dependency chain: token counting first, then regulation-to-prompt integration.

**Chris:** Can we also get the initial seed data loaded? ERIS-064 — populating the library with EAR, ITAR, and EU Dual-Use Regulation summaries. That way when we demo the feature, there's actually content in there.

**Sarah:** Yes. And from the new epic discussion in meeting 9, we should start scoping the regulatory change monitoring feature. Not building it in Q1, but documenting the requirements so we can plan it for Q2.

**Alex:** Agreed. For the regulation document storage, one thing to decide — do we store regulation text in SQLite or as files on disk? The architecture pattern for uploaded documents is files on disk with a database reference. Regulations might be the same, but they're also reference data that needs to be queryable and searchable.

**Mike:** Store them in SQLite. Regulation documents are text content, not binary blobs. We need full-text search across regulations, and SQLite's FTS5 extension handles that well. Keep binary attachments on disk if needed, but the text goes in the database.

**Sarah:** Decision made. Regulation text in SQLite with FTS5 for search.

## Deployment & DevOps

**Sarah:** Last area. Jordan, testing infrastructure?

**Jordan:** ERIS-085 — end-to-end test suite. I've been begging for this. We need automated tests covering login, evaluation, review queue actions, and user management. I want to use Playwright for browser-based E2E tests running against a test database with fixture data. Target: cover the top 10 user workflows with automated tests by end of Q1.

**Alex:** I support this. We should also add API integration tests using something like supertest. Test every endpoint with valid inputs, invalid inputs, and auth checks. These run faster than E2E tests and catch regressions in the API layer.

**Sarah:** Both. E2E tests for critical user flows, API integration tests for endpoint coverage. What about the deployment issues?

**Alex:** The deploy script SSH failure bug — ERIS-075 — needs fixing. The script should verify SSH connectivity before and after each deployment step, and roll back if anything fails. Right now it just continues blindly.

**Mike:** We should also implement blue-green deployment for zero-downtime updates. Right now we restart PM2, which causes a brief outage. With blue-green, we start the new version on a different port, verify it's healthy, then switch the proxy to point to the new instance.

**Sarah:** How complex is blue-green with our setup?

**Mike:** Moderate. We'd need a reverse proxy — nginx — in front of PM2. The deploy script starts the new version on a secondary port, runs the health check against it, and if it passes, updates the nginx config to point to the new port. PM2 can manage both instances.

**Alex:** That's a Q1 deliverable if we commit to it. Maybe two weeks of work including testing.

**Sarah:** Let's plan it. And database backups — ERIS-076. We need automated daily backups of the SQLite database.

**Mike:** Simple cron job that copies review-queue.db to a backup directory with a date stamp. Retain 30 days. We should also backup the JSON config files and the assessment log. The restore script should verify backup integrity by opening the SQLite file and running a quick query before declaring it valid.

**Sarah:** New requirement: the health check endpoint should include disk space monitoring. We've had cases where the review-documents folder grows and the server runs low on disk. The health check should warn when disk usage exceeds 80%.

**Jordan:** And while we're on monitoring — we should add alerting for LLM API errors. Right now if the Anthropic API goes down, users find out when their evaluation fails. We should proactively monitor and display a status banner when a provider is degraded.

**Mike:** That ties into the health check. Extend /api/health to periodically ping each configured LLM provider. If a provider fails the check, set a status flag that the frontend reads and displays as a warning banner.

**Sarah:** Good. Last devops item — we need to implement log rotation for assessment_log.txt. It grows unbounded right now. We should rotate daily, compress old logs, and keep 90 days.

**Alex:** Winston supports log rotation via the winston-daily-rotate-file transport. We swap the current file transport for the rotating one, configure max size and retention, and it handles the rest.

## Priority Summary

**Sarah:** Alright, let me compile everything into priority tiers.

**Tier 1 — Critical fixes and compliance blockers:**
- ERIS-023: Review queue badge fix
- ERIS-087: Batch file name bug
- ERIS-054: Large Excel memory crash
- ERIS-052: PPTX embedded video crash
- ERIS-035: Admin self-deletion prevention
- ERIS-034: Password complexity and expiration
- ERIS-075: Deploy script SSH failure handling
- Cross-cutting audit logging — ERIS-080

**Tier 2 — High-value features:**
- ERIS-022: Review queue filtering completion
- ERIS-014: Risk score trend analysis
- Reviewer assignment system (new story)
- Review SLA tracking with escalation (new story)
- ERIS-044: Gemini LLM provider support
- ERIS-042: LLM connection test fix
- ERIS-060: Regulation CRUD completion
- Automated E2E and API test suites — ERIS-085

**Tier 3 — Important but can slip:**
- Multi-factor authentication (new story)
- LLM model version pinning (new story)
- Token limit monitoring (new story)
- Configurable auto-submission rules per risk category (new story)
- Bulk review queue actions (new story)
- OCR for image-only PDFs — ERIS-053
- Email file format support — MSG and EML (new story)
- ERIS-061: Regulation version control
- Blue-green deployment (new story)
- Database backup automation — ERIS-076
- Metrics dashboard — ERIS-089

**Tier 4 — Stretch goals:**
- ERIS-082: CSV export truncation fix
- ERIS-091: Special character filename fix
- LLM response time monitoring (new story)
- Log rotation for assessment_log.txt (new story)
- Disk space monitoring in health check (new story)
- LLM provider status alerting (new story)
- User activity logging (new story, subset of ERIS-080)
- Regulation library seed data — ERIS-064
- SQLite optimization — ERIS-048, ERIS-049

**Mike:** ERIS-048 should be Tier 2. Performance is degrading now.

**Alex:** Agreed. Move it up.

**Sarah:** Fine. ERIS-048 and ERIS-049 move to Tier 2.

**Chris:** And the metrics dashboard? I need it for the business case.

**Sarah:** It stays Tier 3. We have too many Tier 1 and Tier 2 items already. If we knock those out efficiently, we can pull dashboard forward.

**Jordan:** I count over 20 items across these tiers and only 12 weeks in the quarter. We need to be realistic.

**Sarah:** That's why we have tiers. Tier 1 is the commitment. Tier 2 is the target. Tier 3 and 4 are opportunistic. If we deliver Tier 1 and most of Tier 2, that's a strong quarter.

**Alex:** Works for me. Let's break these into sprint-level plans in the next session.

**Sarah:** Agreed. Thanks everyone — productive session. I'll write up the new stories and get them into the backlog by end of week.
