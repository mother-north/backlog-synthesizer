# Meeting 10: Post-Launch Retrospective & Next Priorities

**Date:** 2025-10-02
**Time:** 10:00 AM - 11:30 AM
**Location:** Main Conference Room / Teams
**Attendees:** Sarah (PM), Mike (Architect), Alex (Dev Lead), Chris (Product), Jordan (QA)
**Meeting Type:** Retrospective

---

**Sarah:** Okay everyone, this is our post-launch retro. We've been live on the SSH server and Azure for about three weeks now. Let's talk about what went well, what didn't, and where we go next. Jordan, you've been closest to the bug reports — want to kick us off?

**Jordan:** Sure. Where do I even start. The good news is that the core evaluation flow works. Users are running assessments, the review queue is functioning, roles are enforced. The bad news is we've got a pile of issues. The biggest one hitting users right now is the review queue count badge — ERIS-023. Every time someone approves a document, the badge still shows the old count until they refresh. It's confusing people. They think there are still documents waiting when there aren't.

**Alex:** That's a frontend state management issue. We know exactly what it is — the sidebar component doesn't re-fetch after a queue action. It's a quick fix, probably half a day.

**Jordan:** Yeah well it's been "a quick fix" for two sprints now. Meanwhile I'm getting pinged about it every day. Can we just prioritize it?

**Sarah:** Fair point. Let's flag it. What else?

**Jordan:** The batch evaluation bug — ERIS-087 — where the wrong file name shows up in results. That one's actively causing mistakes. Analysts are looking at a result and seeing a different document's name. It's a trust issue. If they can't trust the UI to show them the right file name, they start questioning the risk scores too.

**Chris:** That's bad for adoption. We're trying to get the export control team fully onboarded and they're already skeptical about AI-generated risk scores. Having the UI show the wrong file name doesn't help.

**Mike:** I want to go back to something more fundamental. We've been live for three weeks and the performance is already degrading. The assessment log page takes forever to load now that we have a few thousand entries. Which brings me to something I've been thinking about — maybe we should consider MongoDB for better scalability. SQLite was fine for prototyping but we're hitting its limits. The single-writer bottleneck is real. When three analysts are running batch evaluations simultaneously, everything slows to a crawl.

**Alex:** Whoa, hold on. We made a deliberate architecture decision to use SQLite. It's embedded, zero-config, the deployment is simple. And we have ERIS-048 on the backlog specifically to optimize SQLite query performance — adding indexes, pagination, the whole thing. We haven't even tried optimizing it yet. Jumping to MongoDB is a massive migration that would touch every service layer.

**Mike:** I'm not saying we do it tomorrow. I'm saying we should evaluate it. The architecture was designed for 20-30 concurrent users and we're already seeing strain at 15. If we're going to scale this to other teams — which Chris keeps talking about — SQLite won't cut it.

**Chris:** I have been talking about expanding to other business units, yes. But I didn't expect us to rearchitect the database for it. Can't we just optimize what we have?

**Alex:** That's exactly what ERIS-048 and ERIS-049 are for. Let's actually do those tasks before we throw out the entire database layer. Plus, as we discussed in the architecture review — meeting 8 — we specifically decided to stay with SQLite and invest in optimization rather than migrate. Are we just going to undo that decision three weeks later?

**Mike:** The architecture review was before we had production load data. I'm updating my recommendation based on what we're seeing. But fine, let's try the optimization first. If it doesn't get us where we need to be, we revisit MongoDB.

**Sarah:** Okay, so we have a disagreement logged. Alex wants to optimize SQLite first per our prior decision, Mike wants to keep MongoDB on the table. Let's do the optimization work and measure. Moving on — Chris, what are you hearing from users about priorities?

**Chris:** Mixed bag. The compliance team is screaming about the regulation library — we covered that in last week's meeting. The analysts want better filtering on the review queue, which I think is ERIS-022. And several people have asked about email notifications when a document gets a review decision. They're tired of checking the queue manually.

**Jordan:** Can I add to the bug list? We're also seeing an issue where PDF evaluations occasionally return different risk scores for the same document. Like, you run the same file twice and get a 72 one time and a 68 the next. That's not a bug in our code — it's the LLM being non-deterministic. But users are reporting it as a bug.

**Mike:** That's actually by design. We discussed this way back in the scoring review — meeting 2. LLM outputs aren't perfectly deterministic even with temperature set low. We need better user education about how AI risk scoring works. Or we add a confidence interval display.

**Chris:** Or we cache the first evaluation and return the same result if they re-evaluate. That way you don't get different numbers for the same document.

**Alex:** Caching introduces its own problems. What if they changed the prompt between evaluations? What if the regulation context changed? I think Jordan's right that it's a UX issue — we should show the score range or explain variability in the results panel.

**Jordan:** Speaking of things that came up in earlier meetings, remember the false positive discussion from the customer feedback meeting? Meeting 7? We said we'd look into adding a feedback mechanism where analysts can flag false positives and that would feed back into prompt tuning. Has anyone started on that?

**Sarah:** No, that fell off the radar. We got consumed with launch prep.

**Jordan:** Well it should go back on the list. False positive feedback is more valuable than half the stuff we're talking about. If we can actually improve the model's accuracy based on analyst feedback, that's a game changer.

**Chris:** Agreed. Let me add one more thing — I think we need a metrics dashboard. Like, how many evaluations are we running per day? What's the risk distribution across all evaluated documents? Average review time? We're flying blind. I can't even tell leadership how much the tool is being used without manually counting log entries.

**Sarah:** That's ERIS-089 on the backlog. Dashboard with real-time metrics.

**Chris:** Right, but it's sitting at medium priority in the backlog. I'd bump it to high. We can't justify expanding to other teams without usage data.

**Alex:** I hear you on that, but we have active bugs degrading user trust — the batch file name bug, the stale badge, the large Excel crash. If we shift to building dashboards before fixing these, we'll lose the users we already have.

**Jordan:** I'm with Alex on this. Fix the bugs first. The analysts I talk to care about reliability, not dashboards. Every time the system shows the wrong file name or freezes on a large spreadsheet, we lose credibility.

**Chris:** Fine, bugs first. But dashboard right after. Can we agree on that?

**Sarah:** Let me try to synthesize. Here's what I'm hearing as priorities:

One — fix active bugs: ERIS-023 review badge, ERIS-087 batch file name, ERIS-054 large Excel crash. These are hurting daily users.

Two — SQLite optimization: ERIS-048 and ERIS-049. We need this before the performance gets worse. And this is our answer to the MongoDB question — let's prove SQLite can handle it first.

Three — review queue filtering: ERIS-022. It's partially done, users are asking for it.

Four — metrics dashboard: ERIS-089. Chris needs it for business justification.

Five — analyst feedback loop for false positives. We need to write this up as a new story.

Six — regulation library work continues per last week's discussion.

**Mike:** What about the email notification ask? ERIS-056?

**Chris:** And the compliance reporting I brought up in the regulation meeting?

**Sarah:** Email notifications are medium priority, they can wait a sprint. Compliance reporting isn't even scoped yet, that's a roadmap item.

**Jordan:** I also want to mention — we should really add some automated testing. We're deploying to production every two weeks and the only testing is me manually running through scenarios. ERIS-085 is on the backlog for E2E tests but nobody's touched it. Every deploy is a risk without test coverage.

**Alex:** Jordan's right. We got burned last deploy when a regression in the session middleware almost made it to production. If Jordan hadn't caught it in manual testing, the login page would have been broken for everyone. That's ERIS-093, which we hotfixed, but it shouldn't have gotten that far.

**Sarah:** Okay, testing is important but I can't prioritize everything at once. Let me take these priorities back and build a sprint plan. The top tier is bug fixes and SQLite optimization. Second tier is review queue filtering and the dashboard. Everything else queues behind those.

**Mike:** I still think we should at least do a proof-of-concept with MongoDB. Just a spike, a day of work, to see what the migration path looks like.

**Alex:** I disagree but I won't block it if we do it after the optimization work proves insufficient.

**Sarah:** Noted. Let's revisit the database question after we have optimization results. Thanks everyone — messy meeting but we got somewhere.

**Jordan:** Story of our lives.
