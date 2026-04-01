# Risk Scoring Algorithm Review

**Date:** 2025-07-17
**Time:** 2:00 PM — 3:00 PM
**Attendees:** Mike (Architect), Alex (Dev Lead), Jordan (QA)
**Location:** Conference Room A / Teams

---

**Mike (Architect):** So the purpose of today is to go through the risk scoring algorithm design and make sure we're all aligned on how the thresholds work, how the categories get assigned, and what edge cases we need to handle. Alex, you've been prototyping this — walk us through what you've got.

**Alex (Dev Lead):** Sure. So the flow is: document text goes to the LLM along with our evaluation prompt, the LLM returns a structured response that includes a numeric risk score between 0 and 100, a suggested risk category, the reasoning, and the specific trigger paragraphs. What we do on the server side is take that numeric score and apply our own threshold rules to determine the final category, regardless of what the LLM suggested. The thresholds are configured in risk-category-rules.json.

**Mike (Architect):** Right, so the LLM is advisory on category but the thresholds are the source of truth.

**Alex (Dev Lead):** Exactly. Current thresholds are: 0 to 20 is Minimal, 21 to 40 is Low, 41 to 60 is Medium, 61 to 80 is High, and 81 to 100 is Restricted. These are all configurable through the admin settings UI.

**Jordan (QA):** What happens at the boundaries? If a document scores exactly 40, is that Low or Medium?

**Alex (Dev Lead):** Right now the boundaries are inclusive on the lower end. So 40 is Low, 41 is Medium. But honestly, I should double-check that the comparison operators are consistent. That's a good thing to add to the test cases.

**Mike (Architect):** Let's make it explicit: the lower bound is inclusive, the upper bound is exclusive for each range. So Minimal is 0 to 20 inclusive, Low is 21 to 40 inclusive, and so on. Document that in the code and in the configuration schema.

**Alex (Dev Lead):** Will do.

**Jordan (QA):** I ran into something yesterday while testing. If you submit an empty document — literally an empty text field — the risk score comes back as NaN. The UI just shows "NaN%" which is obviously not great.

**Alex (Dev Lead):** Yeah, I know about that one. The problem is that the LLM returns an unparseable response when there's no content to evaluate. Sometimes it returns a score of null, sometimes it doesn't include the score field at all. Our parsing code does `parseInt` on whatever comes back and doesn't handle the null case.

**Mike (Architect):** That's a bug we need to fix. What's the right behavior for empty documents?

**Alex (Dev Lead):** I'd say: if the document has no extractable text, we short-circuit before even calling the LLM. Return a score of 0, category Minimal, and a note that says "No text content was found in the submitted document." We shouldn't waste an API call on an empty string.

**Jordan (QA):** Same issue happens with image-only PDFs. If someone uploads a scanned PDF without OCR, pdf-parse returns an empty string and we get the NaN. Since OCR is out of scope for v1, we need to handle that path.

**Mike (Architect):** Agreed. Let's file that as a bug. The fix should cover empty text input, empty file uploads, and image-only PDFs. In all cases, the user should see a clear message, not NaN.

**Alex (Dev Lead):** I'll tag it against ERIS-012 — I think that bug is already in the backlog actually.

**Jordan (QA):** It is. I logged it last week. ERIS-012, "Risk score shows NaN for empty documents." It's currently marked as in-progress.

**Mike (Architect):** Good. Now let's talk about the threshold configuration itself. Right now it's a JSON file that gets read on every evaluation. That's fine for our current scale, but I want to think about what happens when we need to audit threshold changes. Who changed the thresholds and when? JSON files don't give us that.

**Alex (Dev Lead):** There's a backlog item — ERIS-013 — about migrating the risk category rules from JSON to the SQLite database. That would give us versioning and audit capability. But the tradeoff is complexity. Right now the JSON approach is dead simple — file read, apply thresholds, done.

**Mike (Architect):** And there's a constraint here. SQLite's single-writer limitation means if we put thresholds in the database, any threshold update blocks concurrent evaluation writes. It's not a huge deal given our current user count, but it's something to be aware of. The JSON file approach actually sidesteps that because it's a filesystem read, not a database transaction.

**Alex (Dev Lead):** Good point. We could also keep it simple and just add a timestamp and user field to the JSON file itself. Not a full audit trail, but at least we'd know who last modified it.

**Mike (Architect):** Let's keep it in JSON for now and add that metadata. We can revisit the database migration if we get requirements for a full audit trail on configuration changes. Decision: thresholds stay in risk-category-rules.json with added last-modified-by and last-modified-at fields.

**Jordan (QA):** I have a question about the scoring consistency. If I evaluate the same document twice, do I get the same score?

**Alex (Dev Lead):** In theory, yes, if you're using the same LLM, same model, same prompt, and the temperature is set to 0. In practice, there can be slight variations even at temperature 0 because of how the models work internally. We've seen scores vary by 2-3 points across repeated evaluations.

**Jordan (QA):** That's a problem for testing. If I can't get deterministic results, how do I verify the scoring is correct?

**Mike (Architect):** You can't verify the exact score — that's the nature of LLM-based evaluation. What you can verify is: the score is always within 0-100, the category matches the thresholds for the given score, the trigger paragraphs are present in the original document, and the response format is valid JSON.

**Alex (Dev Lead):** We should also add validation on the server side. If the LLM returns a score outside 0-100, we clamp it. If it returns a non-numeric score, we flag it as an error rather than displaying NaN.

**Jordan (QA):** Makes sense. So my test strategy is: validate the pipeline mechanics and threshold application, not the AI judgment itself.

**Mike (Architect):** Exactly. The AI evaluation quality is a separate concern — we'll handle that through prompt engineering and user feedback. Your job is to make sure the system handles whatever the LLM throws at it gracefully.

**Alex (Dev Lead):** One more thing on scoring. We need to think about what happens when different LLM providers return different score ranges. Claude might score a document at 65, OpenAI might score the same document at 48. Same prompt, different model, different result.

**Mike (Architect):** That's expected and acceptable for v1. The prompt instructs the model to return a score on a 0-100 scale, and we trust each model to interpret that as best it can. We're not going to normalize scores across providers. If an organization switches providers, they should recalibrate their thresholds.

**Alex (Dev Lead):** OK. I'll document that as a known limitation.

**Mike (Architect):** Let me summarize the decisions. One: threshold boundaries are lower-inclusive, upper-exclusive. Two: empty documents get short-circuited with score 0 and a clear message — that's the ERIS-012 fix. Three: thresholds stay in JSON with added metadata fields. Four: score validation clamps to 0-100 on the server side. Five: cross-provider score variation is a known limitation, not a bug.

**Jordan (QA):** I'll update my test plan with the boundary cases and the empty document scenarios. I want to also test what happens if someone sets the thresholds to overlapping ranges through the API — like what if Minimal goes up to 50 and Low starts at 30?

**Alex (Dev Lead):** Good catch. We need validation on the threshold save endpoint. No overlapping ranges, no gaps, must cover the full 0-100 spectrum. I'll add that to the acceptance criteria for the settings endpoint.

**Mike (Architect):** Alright, I think we're in good shape. Alex, the priority is fixing ERIS-012 and adding the server-side validation. Jordan, get your test cases documented and we'll review them next week.

**Jordan (QA):** Will do.
