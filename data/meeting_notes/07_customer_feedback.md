# Meeting Notes — Customer Feedback: False Positives in Risk Scoring

**Date:** 2025-10-21
**Attendees:** Chris (Product), Sarah (PM), Alex (Dev Lead), Jordan (QA)
**Duration:** 55 minutes
**Location:** Conference Room A / Teams

---

**Chris (Product):** So I spent most of last week on site with the Houston export control team, and... they're frustrated. The main complaint is false positives. They're spending hours reviewing documents that the system flags as High or Restricted risk, and most of them turn out to be perfectly fine. One analyst told me she approved 40 out of 45 documents last Tuesday without any changes. That's almost a 90% false positive rate.

**Sarah (PM):** That's really high. Do we have data on this across all sites, or is this just Houston?

**Chris (Product):** Houston is the worst, but Dallas is reporting similar issues. I don't have hard numbers for Dallas yet. The Houston team gave me a spreadsheet — I can share it — but basically, documents about general manufacturing processes are being flagged as High risk because they mention terms like "precision machining" and "tolerance specifications." Those terms trigger the risk scoring, but in context they're talking about commercial automotive parts, nothing controlled.

**Alex (Dev Lead):** That's actually a known issue with how the prompt works. As we discussed in the risk scoring review, the LLM is pattern-matching on terminology rather than understanding the full context of the document. The trigger paragraphs it extracts often contain the right keywords but in the wrong context. We talked about adding context-aware scoring, but it hasn't been prioritized yet.

**Chris (Product):** Well, it needs to be prioritized now. The Houston team lead literally said, and I quote, "If this doesn't get better, we're going back to the manual spreadsheet process." We're at risk of losing adoption.

**Sarah (PM):** Okay, that's serious. What are the specific asks from the customer? Beyond "make it smarter."

**Chris (Product):** Ha, well that was literally what one person said — "just make it smarter." But when I dug into it, there are a few concrete things. First, they want the ability to mark a false positive and have the system learn from it. Like, if an analyst approves a document and marks it as a false positive, that feedback should somehow improve future scoring.

**Alex (Dev Lead):** That's basically a feedback loop into the prompt or the model. We could do it at the prompt level — accumulate examples of false positives and include them as negative examples in the prompt. But there's a token limit concern. If we keep adding examples, the prompt gets huge and we blow past the context window.

**Chris (Product):** They also reported a bug — and this one's annoying. When a document gets re-evaluated after making changes, the risk score sometimes goes UP even though the risky content was removed. One analyst removed an entire section that contained flagged paragraphs, re-evaluated, and the score went from 72 to 78. That makes no sense.

**Jordan (QA):** That sounds like a caching issue or a stale prompt. Are we caching evaluation results anywhere?

**Alex (Dev Lead):** We're not caching results, but the text extraction might be cached. If the user uploads a modified file but the file name is the same, there's a chance the old extracted text is being used. Let me check — yeah, I think the temp file cleanup might not be happening before re-evaluation. That would explain it.

**Jordan (QA):** I can reproduce this. I'll file a bug. This is definitely something we need to fix before anything else — if re-evaluation uses stale text, no amount of scoring improvement matters.

**Chris (Product):** Agreed. The other bug they hit is with the risk category display. Sometimes a document shows "High" risk in the evaluation results but "Medium" in the review queue. The same document, two different risk labels in two different places.

**Sarah (PM):** How is that possible?

**Alex (Dev Lead):** The risk category in the evaluation is whatever the LLM returns. But when we submit to the review queue, we apply the risk-category-rules.json thresholds to override the LLM's category based on the numeric score. So if the LLM says "High" but the score is 55, and our threshold for High starts at 60, the review queue shows "Medium" because the rules engine overrode it. The display inconsistency is because the evaluation view shows the LLM's label and the review queue shows the rules-engine label.

**Chris (Product):** That's confusing as hell. The customer sees two different categories for the same document and thinks the system is broken.

**Sarah (PM):** That does sound like a UX problem at minimum. We should always show a consistent category — either the LLM's or the rules engine's, but not a mix.

**Alex (Dev Lead):** I'd say always use the rules engine category, since that's the authoritative one. The LLM's category is just a suggestion. We should override it everywhere, including in the evaluation results view.

**Jordan (QA):** I've seen this in testing but I wasn't sure if it was intentional. Good to know it's a bug.

**Chris (Product):** There's another thing — the analysts want to be able to configure exclusion lists. Like, "never flag documents from department X" or "ignore these specific terms in the scoring." Right now the only customization is the prompt, and they don't feel comfortable editing the prompt because they're afraid they'll break the scoring entirely.

**Alex (Dev Lead):** An exclusion list is interesting. We could implement it as a pre-processing step — before sending to the LLM, strip out or annotate terms from the exclusion list. Or we could add it as a section in the prompt: "Do not flag the following terms as risky: [list]."

**Sarah (PM):** That's a feature request, not a bug. Let's capture it but not promise a timeline. What else?

**Chris (Product):** One more thing. Several analysts mentioned that when they evaluate a batch of documents, they can't easily compare results across the batch. They want a summary view — like a table showing all documents in the batch with their scores, sorted by risk. Right now they have to click into each result individually.

**Sarah (PM):** That sounds like an enhancement to the batch results UI. Reasonable ask.

**Chris (Product):** And honestly, the biggest implicit ask was just confidence. They want to trust the system. Right now they feel like they have to manually verify every single result because they don't know when the system will be wrong. If we can get the false positive rate down to even 30%, they'd be happy. Right now it's close to 90% for certain document types.

**Alex (Dev Lead):** The false positive rate is going to vary hugely by document type and by prompt quality. We should track it. Every time an analyst marks something as a false positive in the review queue, we should log that and compute metrics. That gives us a baseline and lets us measure improvement.

**Jordan (QA):** Can I ask about the testing angle? If we change the scoring to reduce false positives, how do we make sure we don't introduce false negatives? A false negative — where a genuinely risky document gets scored as Low — is way worse than a false positive from a compliance perspective.

**Sarah (PM):** Great point. We need to be really careful here. Any changes to the scoring model or prompt need to be validated against a known set of documents with confirmed risk levels.

**Alex (Dev Lead):** We could build a test corpus — a set of documents where we know the correct risk category — and run it through after every change to make sure we haven't regressed on true positives while we're reducing false positives.

**Sarah (PM):** I like that. Okay, let me try to pull this together. We've got two bugs, several feature requests, and some underlying scoring improvements.

**Bugs:**
1. Re-evaluation uses stale extracted text, causing incorrect score changes
2. Risk category mismatch between evaluation view and review queue

**Feature Requests:**
1. False positive feedback mechanism that improves future scoring
2. Term/department exclusion lists for risk scoring
3. Batch results summary table with sortable scores
4. False positive rate tracking and metrics dashboard

**Chris (Product):** And the overarching theme: reduce false positive rates, especially for manufacturing and general commercial documents.

**Sarah (PM):** Alex, can you estimate effort for the two bugs?

**Alex (Dev Lead):** The stale text bug is probably a day — fix the temp file cleanup before re-evaluation. The category mismatch is more like two days because we need to decide on the canonical label source and update both the evaluation and review queue paths.

**Sarah (PM):** Let's prioritize those two bugs for this sprint. The feature requests go to the backlog for sizing.

**Chris (Product):** Fair, but please don't let the false positive feedback sit too long. Houston is getting impatient.

**Sarah (PM):** Noted. Jordan, can you add the two bugs to the tracker and start on reproduction steps?

**Jordan (QA):** Already on it. I'll have repro steps by end of day.

---

**Action Items:**
- Jordan: File bugs for stale text re-evaluation and category mismatch, with repro steps by EOD
- Alex: Fix both bugs in current sprint
- Chris: Share Houston false positive spreadsheet data with the team
- Sarah: Add feature requests to backlog, schedule sizing discussion
- Alex: Investigate feasibility of false positive feedback loop for next sprint
