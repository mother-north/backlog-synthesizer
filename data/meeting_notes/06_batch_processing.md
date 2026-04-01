# Meeting Notes — Batch File Processing Requirements

**Date:** 2025-10-16
**Attendees:** Alex (Dev Lead), Mike (Architect), Jordan (QA)
**Duration:** 40 minutes
**Location:** Teams

---

**Alex (Dev Lead):** Alright, let's nail down the batch processing requirements. We've got the basic batch upload working — ERIS-050 is done — but we need to define the performance targets and handling for larger workloads. I've been getting questions from users about how many files they can throw at it at once.

**Mike (Architect):** Good timing. I ran some informal benchmarks last week. Right now, a batch of 10 PDF files takes about 4 minutes because each file is sent to the LLM sequentially. There's no parallelism in the batch evaluation endpoint. The bottleneck is entirely the LLM API call latency — text extraction is fast, maybe 200ms per file.

**Alex (Dev Lead):** So if we want a performance target, what are we looking at? I was thinking something like: must process 100 files in under 5 minutes. Is that realistic?

**Mike (Architect):** Not with sequential processing. At the current rate, 100 files would take around 40 minutes. To hit 5 minutes for 100 files, we'd need to parallelize the LLM calls. Maybe 10 concurrent requests to the LLM API. That's feasible from our end, but we need to check the rate limits on each provider — Anthropic, OpenAI, and Gemini all have different limits.

**Jordan (QA):** What about memory? If we're processing 100 files in parallel, even just 10 at a time, we're holding all those extracted texts in memory simultaneously. Some of those files could be big.

**Mike (Architect):** Right. Memory usage shouldn't exceed 2GB for the entire batch operation. That's our constraint given the server specs we're targeting. The Node.js process is typically sitting at around 200MB baseline, so we have about 1.8GB of headroom. With 10 concurrent file extractions, each averaging maybe 5MB of text content, that's 50MB — well within bounds. The issue would be if someone uploads a batch of 100 Excel files that are each 20MB. That's where we hit ERIS-054 territory.

**Alex (Dev Lead):** So the requirements are: 100 files in under 5 minutes with no more than 2GB memory usage. What about the concurrency model? Should we use a worker pool?

**Mike (Architect):** I'd suggest a simple semaphore pattern — limit concurrent LLM calls to a configurable number, default 10. Each file goes through: extract text, queue for LLM evaluation, collect result. The extraction can happen for the next file while the current one is waiting on the LLM. It's basically a pipeline.

**Alex (Dev Lead):** Makes sense. Now, for error handling in batch — what happens if one file fails?

**Jordan (QA):** That's critical for testing. The current implementation stops the entire batch if one file fails, which is terrible UX. We had a user submit 50 files and file number 3 was a corrupted PDF, and they lost progress on all 50.

**Alex (Dev Lead):** Yeah, that's a bug we should fix as part of this. Each file should be independent — if one fails, log the error, mark it as failed, and continue with the rest. At the end, the user sees a summary: 97 succeeded, 3 failed, with error details for each failure.

**Mike (Architect):** Agreed. And the progress tracking needs to be granular. Right now the batch endpoint returns results only when everything is done. For 100 files, the user would be staring at a spinner for 5 minutes. We should stream progress updates — file X of 100 completed, current file processing, estimated time remaining.

**Jordan (QA):** How would we stream that? We're on a standard HTTP request-response model, no WebSockets.

**Mike (Architect):** Server-Sent Events would be the cleanest approach. Keep the HTTP connection open and push progress events. The frontend already does polling for the review queue badge count, but SSE would be more efficient for batch progress. Alternatively, we could do short polling — the client hits a status endpoint every 2 seconds.

**Alex (Dev Lead):** I'd lean toward SSE for this. It's simpler than WebSockets and supported in all browsers. Let's go with that.

**Mike (Architect):** One more thing I want to discuss — audit logging. Every batch operation needs to be logged. Who submitted it, when, how many files, which files, and the outcome of each. This is a compliance requirement.

**Jordan (QA):** That makes sense for batch. But honestly, we need audit logging on every batch operation — actually, we need it across ALL API endpoints, not just batch. The assessment_log.txt we have now only covers evaluation results. It doesn't log who accessed what, who changed settings, who created or deleted users. For an export control tool, that's a gap. If an auditor asks "who changed the risk thresholds on October 3rd," we can't answer that right now.

**Alex (Dev Lead):** That's a bigger scope than batch processing, though. Are we saying this is a requirement for this sprint?

**Mike (Architect):** It's a cross-cutting requirement. We should design the audit logging infrastructure as part of this work, but implement it incrementally. Start with batch operations, then extend to all endpoints. The architecture should be the same — a middleware that intercepts every request and logs the user, action, resource, timestamp, IP address, and response status.

**Jordan (QA):** And the audit log needs to go into the database, not a text file. The current assessment_log.txt is fine for evaluation history, but an audit log needs to be queryable. We need to search by user, by date range, by action type. You can't do that with a text file.

**Mike (Architect):** Agreed. New SQLite table — `audit_log`. Columns: id, timestamp, user_id, username, action, resource, method, path, request_body_summary, response_status, ip_address. Indexed on timestamp, username, and action for efficient querying.

**Alex (Dev Lead):** How much data are we talking about? Every API call logged could get large fast. We have the assessment endpoint called hundreds of times a day.

**Mike (Architect):** That's why we need a retention policy. Keep 90 days of audit data, auto-purge older entries. And the request_body_summary should be a truncated version — don't store the full document text, just the metadata. File name, file size, that sort of thing.

**Jordan (QA):** For testing, I'll need to verify: batch of 100 mixed file types, including at least one corrupt file and one duplicate; memory stays under 2GB; total processing time under 5 minutes with 10 concurrent LLM calls; progress updates via SSE are accurate; audit log entries created for every file in the batch; and the batch summary is correct.

**Alex (Dev Lead):** Can you write that up as a test plan? I want to make sure we have acceptance criteria before we start coding.

**Jordan (QA):** Sure. I'll also add edge cases: what happens if the user disconnects mid-batch? What if the LLM API goes down after file 50? Does the batch resume or do they have to re-upload?

**Mike (Architect):** Good question. For now, I'd say no resume capability — that's complex. If the connection drops, the batch stops where it is. Files already processed have their results saved. The user can re-submit the remaining files. We can add resume support later if users ask for it.

**Alex (Dev Lead):** Alright, let me summarize the requirements.

**Batch Processing Requirements:**
1. Process 100 files in under 5 minutes using concurrent LLM calls (configurable, default 10).
2. Memory usage must not exceed 2GB for the entire batch operation.
3. Individual file failures don't stop the batch — partial results are retained.
4. Progress tracking via Server-Sent Events: per-file status, overall progress, estimated time remaining.
5. Batch summary at completion: succeeded count, failed count, per-file error details.
6. Audit logging for every batch operation, extensible to all API endpoints.

**Mike (Architect):** And the audit logging infrastructure should be designed as middleware from day one, even if we only hook it up to batch endpoints initially. The schema should support all endpoint types.

**Alex (Dev Lead):** Got it. Jordan, test plan by end of week?

**Jordan (QA):** You'll have it by Thursday.

**Alex (Dev Lead):** Perfect. Let's move on this.

---

**Decisions:**
- Batch concurrency: configurable semaphore, default 10 concurrent LLM calls
- Progress reporting: Server-Sent Events
- Error handling: individual file isolation, no batch-level abort
- Audit log: SQLite table, middleware-based, 90-day retention
- Cross-cutting: audit logging to be extended to ALL API endpoints after batch

**Action Items:**
- Alex: Implement batch concurrency with semaphore pattern
- Mike: Design audit_log table schema and middleware
- Jordan: Test plan by Thursday covering performance, error handling, and audit logging
