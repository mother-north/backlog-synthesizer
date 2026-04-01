# Meeting 9: Regulation Document Library — Feature Request

**Date:** 2025-09-18
**Time:** 2:00 PM - 3:15 PM
**Location:** Conference Room B / Teams
**Attendees:** Sarah (PM), Chris (Product), Mike (Architect), Alex (Dev Lead)
**Meeting Type:** Feature Discussion

---

**Sarah:** Alright, thanks for joining everyone. Chris brought this one to me after getting feedback from the compliance team. They want a proper regulation library inside ERIS. Chris, you want to walk us through what they're asking for?

**Chris:** Sure. So right now, when analysts run evaluations, the AI is working from whatever context is baked into the prompt. But the compliance team wants to be able to manage their own library of regulation documents — EAR, ITAR, the EU Dual-Use Regulation, all of that — and have those fed into the evaluation context dynamically. They want to upload regulation documents, keep them organized, and have the system automatically reference the right ones during assessment.

**Mike:** We already have the Regulation Library epic on the backlog — ERIS-006. There's even a story for CRUD operations, ERIS-060, which is in progress. And ERIS-061 covers version control. So some of this is already planned. What's new here?

**Chris:** The new part is — and this is where it gets interesting — they want automated regulatory update tracking. They want the system to monitor external sources for regulation changes and flag when a stored regulation might be out of date. Think of it like a subscription service for regulatory updates. When EAR gets an amendment, the system would detect that and notify the team.

**Sarah:** That's... a significantly bigger scope than what we have in ERIS-006. That epic is mostly about storing and organizing documents. This is talking about external data feeds, change detection, automated notifications.

**Mike:** Right. The existing Regulation Library epic covers CRUD, version control, and integration with the AI prompts. What Chris is describing is more like a Regulatory Intelligence feature — monitoring external sources, diffing documents, alerting on changes. That's a completely different capability.

**Chris:** And they also want document comparison. Like, when a new version of EAR comes out, they want to see a side-by-side diff of what changed between versions. Highlighted additions, deletions, that kind of thing.

**Alex:** Document comparison is non-trivial. Are we talking about plain text diff, or structural comparison that understands sections and clauses? Because regulatory documents have very specific structures — parts, sections, subsections — and a naive text diff would be pretty noisy.

**Chris:** Honestly, I think they'd settle for a good text diff to start, but ideally they want something that understands the document structure. They mentioned wanting to see "Section 744.11 was amended" rather than just a wall of red and green text.

**Mike:** That's getting into NLP territory. We'd need to parse regulatory document formats, understand their structure, and then do semantic comparison. That's a substantial engineering effort. I'd almost call that a separate epic on its own — maybe "Regulatory Intelligence" or "Regulation Change Management."

**Sarah:** I agree. I think we need to split this. The existing ERIS-006 work continues as planned — CRUD, version control, integration with prompts. But the automated monitoring, document comparison, and change alerting should be a new epic proposal. We don't have anything in the backlog that covers that.

**Chris:** Makes sense. But there's a dependency question. We need the document processing pipeline to be rock solid before we start ingesting regulation documents at scale. Some of these regulations are massive PDFs — hundreds of pages. Alex, how's the document processing pipeline looking?

**Alex:** Honestly, it's not great for this use case. We're still dealing with ERIS-052 — the PPTX crash bug — and ERIS-054, the large Excel memory issue. The pipeline works fine for typical business documents, maybe 10-20 pages. But if you're talking about feeding in the full text of ITAR, that's a different ballgame. We need the document processing pipeline stable first before we start throwing 500-page regulatory PDFs at it.

**Mike:** That's a hard dependency. The regulation library feature, even the basic CRUD part, depends on reliable text extraction from large documents. And the comparison feature would need to parse and diff those large documents. We should explicitly track that dependency — Regulation Library depends on Document Processing stability.

**Sarah:** Agreed. Let me capture that. So we have: existing ERIS-006 work continues but is gated on document processing pipeline stability, and we're proposing a new epic for the automated monitoring and comparison capabilities.

**Chris:** While we're at it, could we also add compliance reporting? The compliance team mentioned they'd love a report that shows which regulations were referenced in each evaluation, how many documents were flagged against each regulation, trending risk areas by regulation type. It would really help them with their quarterly compliance reviews.

**Sarah:** Chris, that's yet another feature area. Let's not scope-creep this meeting into a full compliance platform.

**Chris:** I know, I know. But it's related. If we're building a regulation library, the natural next step is reporting on how those regulations are being used. It's not a stretch.

**Mike:** It is a stretch from an engineering perspective. Compliance reporting means aggregation queries, date-range filtering, export to PDF or Excel, maybe scheduled report generation. That touches the database layer, potentially the assessment log, the review queue data. It's cross-cutting.

**Alex:** And we'd need to think about how that interacts with the existing assessment log. Right now the log is just a flat text file — assessment_log.txt. It's append-only with no structure. If you want reporting on which regulations were referenced per evaluation, we'd need to restructure how we capture that data. Probably a new database table linking evaluations to regulations.

**Sarah:** That further proves my point. Compliance reporting is a separate conversation. Let's table it and keep this meeting focused on the regulation library scope.

**Chris:** Fair. But can we at least note it as a future consideration? The compliance team will ask about it.

**Sarah:** Noted. I'll add it to the product roadmap as a future item. So to summarize: we continue the existing Regulation Library epic, ERIS-006, with its current stories. We add a dependency on document processing pipeline stability. We propose a new epic for Regulatory Intelligence — automated update monitoring, document comparison, and change alerting. And compliance reporting is a future roadmap item, not in scope now.

**Mike:** One more thing on the dependency front. The regulation-to-prompt integration, ERIS-062, depends on both the regulation CRUD being done and the prompt management system, ERIS-041. And if we're adding large regulation documents as context, we'll bump into LLM token limits pretty quickly. We need to think about chunking strategies or summarization. That's another dependency on the LLM integration layer.

**Alex:** Right. And the current prompt system doesn't have any token counting. We'd need to add that as a prerequisite — monitoring how much context we're sending to the LLM and trimming or warning when we approach the limit.

**Sarah:** So the dependency chain is: document processing pipeline stability, then regulation CRUD, then version control, then prompt integration with token management. And separately, the new Regulatory Intelligence epic would depend on all of that plus external data feed capabilities.

**Mike:** That's correct. It's a long dependency chain but each piece is well-defined.

**Sarah:** Alright, I think we have enough to write this up. I'll create the new epic proposal and map out the dependencies. Alex, can you give me an estimate on when the document processing pipeline will be stable enough to support large document ingestion?

**Alex:** If we can close out ERIS-052 and ERIS-054 in the next sprint, I'd say two to three sprints from now we'd be confident enough. But that's optimistic — those bugs have been sticky.

**Sarah:** Understood. Thanks everyone, let's revisit this once we have pipeline stability.
