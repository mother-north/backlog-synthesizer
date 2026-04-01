# Review Queue Workflow Discussion

**Date:** 2025-07-22
**Time:** 3:30 PM — 4:45 PM
**Attendees:** Sarah (PM), Alex (Dev Lead), Chris (Product), Jordan (QA)
**Location:** Sarah's Office / Teams (hybrid)

---

**Sarah (PM):** OK so we need to talk about the review queue workflow. Chris, you had some feedback from the compliance team?

**Chris (Product):** Yeah so I sat with them on Friday and they have a bunch of opinions. But before I get into that — Alex, did you ever fix that thing where the count badge doesn't update?

**Alex (Dev Lead):** The stale badge? ERIS-023. It's in progress, should be done this sprint. It's a frontend state management issue — the sidebar component doesn't re-render after an action.

**Chris (Product):** OK cool because they mentioned that too. Anyway. So the big feedback is about the workflow itself. Right now you submit a document, a reviewer claims it, they approve or decline, done. The compliance team wants more steps.

**Sarah (PM):** What kind of steps?

**Chris (Product):** So they want — hold on let me find my notes — OK they want an "escalation" path. If a reviewer looks at a document and isn't sure, they don't want to just decline it. They want to escalate it to a senior reviewer. And the senior reviewer can then make the final call.

**Alex (Dev Lead):** That's basically a two-tier review process. We'd need a new status — "escalated" — and logic for who it gets escalated to. That's not trivial.

**Sarah (PM):** Hang on. As we decided in the kickoff, the initial review queue has four states: submitted, under review, approved, declined. Plus the release action to put it back. Adding escalation is scope creep.

**Chris (Product):** I hear you but the compliance team is really vocal about this. They said they can't use the tool without it.

**Jordan (QA):** Can they just decline with a comment that says "needs senior review" and then someone else claims it?

**Chris (Product):** That's what I suggested but they said it's too informal. They want a formal escalation with a notification to the senior reviewer. Speaking of notifications — oh wait that's out of scope too right?

**Sarah (PM):** Yes, notifications are v2. Let's stay focused. Chris, can you —

**Chris (Product):** Oh also completely unrelated but the team was asking about dark mode. Is that on anyone's radar? Some of them work late shifts reviewing documents and the white background is brutal.

**Alex (Dev Lead):** Dark mode is definitely not on the radar right now.

**Sarah (PM):** Chris. Review queue. Focus.

**Chris (Product):** Right, sorry. OK so besides escalation, they want the ability to add comments at each stage. Like when you approve a document, you should be able to write a note explaining why. Same with decline — they want the decline reason to be mandatory.

**Alex (Dev Lead):** We already have a comment field on the decline action. It's optional though. Making it mandatory is easy. Adding comments to approve is also straightforward — we just add an optional text field to the approve endpoint.

**Jordan (QA):** Does the review_log table already store comments?

**Alex (Dev Lead):** Yeah, there's a reviewer_comment column. It captures the comment on decline. We'd just populate it on approve too.

**Sarah (PM):** OK that sounds reasonable. Let's do it — mandatory comment on decline, optional comment on approve. That's within scope.

**Chris (Product):** Great. Now the other thing — and this is where it gets interesting — they want to be able to reassign a document to a specific reviewer. Not just release it back to the pool, but say "I want Jane to review this because she's the EAR expert."

**Alex (Dev Lead):** That's... possible but it changes the model. Right now the queue is a pull system — reviewers pull work when they're ready. Reassignment makes it a push system. You'd need a user picker, you'd need to handle what happens if the assigned person is on vacation, you'd need —

**Chris (Product):** Yeah they don't care about the technical details, they just want it. Oh and they also want to be able to reassign between offices. I guess there's a team in DC and a team in San Jose.

**Sarah (PM):** We don't have any concept of offices or teams in the system. That's a user management feature we haven't even discussed.

**Jordan (QA):** I have a question. If we do the reassignment thing, does the audit trail still work the same way? Like we'd need to log "User A reassigned document X from User B to User C." That's a new action type for the review_log.

**Alex (Dev Lead):** Right, we'd need a "reassign" action type in addition to submit, claim, approve, decline, and release. And the API contract would change — the reassign endpoint would need a target reviewer parameter.

**Chris (Product):** Can we at least get the reassignment in? Even without the multi-office stuff? My worry is the compliance team starts using the tool and immediately hits this wall.

**Sarah (PM):** Let me think about this. Alex, how much effort is reassignment?

**Alex (Dev Lead):** If it's just "release and claim on behalf of someone else" — maybe two days. If we want a full UI for it with user search and the whole thing, more like a week.

**Sarah (PM):** OK. Here's what I want to do. We add reassignment as a stretch goal for this sprint. Alex, start with the backend API for it — a POST endpoint that takes a document ID and a target reviewer username. The frontend can be a simple dropdown for now. But if it doesn't make it, it doesn't make it.

**Chris (Product):** Fair enough. Oh one more thing — they want to know if there's a way to see all documents they've ever reviewed. Like a personal review history.

**Jordan (QA):** We can build that from the review_log table. Filter by reviewer equals current user. That's basically just a query.

**Alex (Dev Lead):** Yeah that's easy. We already have the data. It's just a new view on the frontend.

**Chris (Product):** Let me tell you what else came up. So Dave from the DC office — you know Dave, he's the one who keeps emailing about the Excel file crashes —

**Sarah (PM):** That's ERIS-054, it's being worked on separately. Chris, please.

**Chris (Product):** Right, right. So Dave asked if the review queue could show a preview of the document content without having to open the full detail view. Like a hover preview or an expandable row.

**Alex (Dev Lead):** That's a UX enhancement. We could do an expandable row that shows the first 200 characters of the document text and the risk score summary. It's not hard but it's extra work.

**Sarah (PM):** Add it to the backlog as a low-priority improvement. It's not blocking anyone.

**Jordan (QA):** I want to circle back to something. The auto-retrieve mode — ERIS-024 — how does that interact with the escalation feature if we build it? If I approve a document and auto-retrieve kicks in, what happens if the next document is one that was escalated to me specifically?

**Alex (Dev Lead):** Good question. If we do escalation, auto-retrieve should probably prioritize escalated documents. But honestly that's a bridge we cross when we get to escalation.

**Sarah (PM):** Alright, let me try to summarize what we're actually committing to from this conversation. One: mandatory decline comments, optional approve comments. Two: reviewer personal history view. Three: document reassignment as a stretch goal — backend first. Everything else — escalation, multi-office teams, document preview, dark mode — goes to the backlog for future consideration.

**Chris (Product):** What about the escalation? The compliance team really —

**Sarah (PM):** It goes to the backlog. We'll discuss it as a feature proposal for v2. I'll set up a meeting with the compliance team lead to manage expectations.

**Alex (Dev Lead):** I'll update the API specs for the decline comment change and start on the reassignment endpoint. Jordan, can you add test cases for the mandatory decline comment? We need to make sure the API rejects a decline request with an empty comment.

**Jordan (QA):** Yep, on it. I'll also add negative tests for the reassignment once the API is defined — things like reassigning to a nonexistent user, reassigning a document you don't have claimed, that sort of thing.

**Sarah (PM):** Perfect. Chris, send me the full list of feedback from the compliance team by end of day. I want to triage all of it properly.

**Chris (Product):** Will do. And seriously, ask about dark mode at some point. It came up three times.

**Sarah (PM):** Noted. We're done.
