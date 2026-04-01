# ERIS Project Kickoff — Scope & Goals

**Date:** 2025-07-14
**Time:** 10:00 AM — 11:15 AM
**Attendees:** Sarah (PM), Mike (Architect), Alex (Dev Lead)
**Location:** Conference Room B / Teams

---

**Sarah (PM):** Alright, let's get started. So this is the official kickoff for ERIS — the Export Risk Insight Solution. I want to make sure we walk out of here with a clear picture of what we're building in the first release and what's explicitly out of scope. Mike, you want to give the thirty-second elevator pitch for anyone reading the notes later?

**Mike (Architect):** Sure. ERIS is a web application for evaluating documents against export control regulations using AI. Users upload a document — could be a PDF, Word doc, PowerPoint, Excel — the system extracts the text, sends it to an LLM with the right prompting, and gets back a risk assessment. Risk score from 0 to 100, a risk category like Restricted, High, Medium, Low, or Minimal, and the specific trigger paragraphs that flagged the content. Then there's a review queue where compliance analysts can review and disposition those assessments.

**Sarah (PM):** Perfect. So let's talk about what's in scope for the initial release. I've got a draft list here. Core evaluation — text and file upload, risk scoring, the five risk categories. Review queue — submit, claim, approve, decline, release. User management with role-based access. And the LLM integration layer. Alex, does that match your understanding?

**Alex (Dev Lead):** Yeah, that's the core. I'd add document processing to that list explicitly — we need to support PDF, DOCX, PPTX, XLSX, and plain text. The file extraction pipeline is a big chunk of work on its own.

**Sarah (PM):** Good call. So five feature areas for v1: risk assessment engine, review queue, user management and auth, LLM integration, and document processing.

**Mike (Architect):** I want to flag the tech stack decisions now so they're on record. We're going with Node.js and Express for the server, SQLite for the database with better-sqlite3, vanilla JavaScript frontend — no React, no Vue, just plain JS modules. The rationale is speed of development and minimal operational overhead. This is an internal tool for a small team, not a consumer-facing product.

**Sarah (PM):** And that's an important constraint. This is designed for internal use within a controlled network. We're not building for the public internet.

**Alex (Dev Lead):** Right. For auth, we'll use bcrypt for password hashing, file-based sessions with express-session, and we're planning five user roles — Administrator, Master Analyst, Analyst, Export Control, and a basic User role. Each role gets different permissions configurable through a JSON file.

**Sarah (PM):** Let's talk about non-functional requirements. I've had conversations with the stakeholders and here's what they need. The system must handle 500 concurrent users. I know that sounds like a lot for an internal tool, but they're planning to roll this out across multiple offices eventually.

**Mike (Architect):** Hold on — 500 concurrent users is a significant number for the architecture I just described. SQLite has a single-writer constraint. With WAL mode we can do concurrent reads, but writes serialize. And we're using file-based sessions, so every request hits the filesystem for session lookup. Realistically, with the current single-server architecture, we're looking at maybe 20 to 30 concurrent users before things start degrading.

**Sarah (PM):** So are you saying 500 is not achievable?

**Mike (Architect):** Not with SQLite on a single server, no. If that's a hard requirement, we need to have a conversation about PostgreSQL and horizontal scaling. But that's a fundamentally different architecture and timeline.

**Alex (Dev Lead):** I think the realistic path is to build for what we need now — the initial user base is probably what, 15 to 20 people? — and architect it so we can swap out the data layer later if we need to scale.

**Sarah (PM):** OK. Let me push back on the stakeholders and get clarity. For now, let's document it this way: target 500 concurrent users as a future NFR, but the initial release targets 30 concurrent users with the current architecture. We'll revisit scaling when usage data tells us we need to. Fair?

**Mike (Architect):** Fair. I'll document the architectural constraints clearly so everyone knows what the ceiling is.

**Sarah (PM):** Second NFR: response time under 2 seconds for non-LLM operations. So loading the review queue, filtering, user management actions — all of that needs to feel snappy.

**Alex (Dev Lead):** That's very doable with SQLite for the data sizes we're talking about. Local database reads are sub-200 milliseconds. The slow part will always be the LLM evaluation itself — that's 5 to 30 seconds depending on the document size and the provider.

**Sarah (PM):** Right, and users understand the AI evaluation takes time. But everything else should be instant. Let's make that a hard requirement: API response time under 2 seconds for all non-LLM endpoints.

**Mike (Architect):** Agreed. And we should add a loading indicator on the frontend for evaluation calls so users know the system is working.

**Sarah (PM):** Now, what's explicitly out of scope for v1?

**Alex (Dev Lead):** I'd say: email notifications, batch processing optimization beyond basic sequential processing, any kind of real-time push like WebSockets, and the regulation document library. Those are all things we've talked about but they're not needed for the initial launch.

**Sarah (PM):** Agreed. Also out of scope: automated deployment pipelines — we'll do manual deployment via SSH scripts initially — and any kind of multi-tenancy.

**Mike (Architect):** One more: OCR for image-only PDFs. We'll handle the case gracefully — if there's no extractable text, we return a meaningful error — but we're not integrating an OCR library in v1.

**Sarah (PM):** Good. Let me summarize the decisions.

**Decision 1:** Initial scope is five feature areas — risk assessment, review queue, user management, LLM integration, document processing.

**Decision 2:** Tech stack is Node.js, Express, SQLite, vanilla JS frontend. Single-server deployment.

**Decision 3:** Initial release targets 30 concurrent users. 500 concurrent users is a future goal that will require architecture changes.

**Decision 4:** Non-LLM API response time must be under 2 seconds.

**Decision 5:** Out of scope for v1: email notifications, regulation library, OCR, real-time push, multi-tenancy, advanced batch optimization.

**Decision 6:** LLM provider support in v1 will include Anthropic Claude and OpenAI. Gemini and Azure OpenAI are stretch goals.

**Alex (Dev Lead):** One thing I want to add — we should plan for the review queue to have an audit trail from day one. Every action — submit, claim, approve, decline, release — gets logged with who did it and when. That's a compliance requirement we shouldn't defer.

**Sarah (PM):** Absolutely. The review audit trail is in scope for v1. Good catch.

**Mike (Architect):** I'll have the architecture document updated by end of week with all of this captured. Data flow diagrams, API contracts, the works.

**Sarah (PM):** Perfect. Alex, can you break these feature areas down into stories by next Monday? We'll review them in sprint planning.

**Alex (Dev Lead):** Will do. I'll also estimate the document processing work separately since that's the piece I'm least sure about in terms of effort.

**Sarah (PM):** Great. Next meeting is Thursday for the technical deep-dive on the risk scoring algorithm. Mike, you're driving that one.

**Mike (Architect):** Got it. I'll prepare some options for how we structure the scoring thresholds.

**Sarah (PM):** Alright, that's a wrap. Thanks everyone.
