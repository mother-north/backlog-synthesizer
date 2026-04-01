# Application
## General Understanding
Q1. What does "AI-First SDLC" mean to you, and how does it shift traditional software development practices? Beyond simply using AI tools, give a concrete example of a process you would fundamentally re-architect. How would you measure the success of this new process (e.g., cycle time, defect rate, story point accuracy)?

A1. AI-First SDLC means development processes where AI agents are active participants, not just assistants to humans (AI-Augmentation). Instead of humans doing the work (code, architect, debug) with AI suggestions, AI agents orchestrate workflows, make decisions, and autonomously execute tasks within human-defined guardrails.


Re-architect example.
Autonomous Bug Fixing:
Traditional: Tester finds bug → dev picks up → fixes in dev environment → submits to QA → test in QA → potential rework → review → merge
AI-First: Test agent tests the system and finds bugs → Bugfix agent picks up bugs → fixes and tests → auto-merges when safe, escalates when needed for human review

Success measurement — for the Autonomous Bug Fixing example specifically:
- Bug-to-fix cycle time (time from detection to merged fix)
- Auto-merge rate (% of bugs resolved without human escalation)
- Defect escape rate (bugs reaching production)
- QA overhead (dev time dedicated to QA-related tasks; typically 20–30% in manual testing)

There will be an impact on overall team productivity, so I'd measure the initiative in the broader 360 framework:

Below is an example of a set of KPI categories to measure the 360 success of AI initiatives:
- Business & Monetary Value: Time-to-market reduction, cost savings
- Adoption: AI suggestion acceptance rate, % active users, FTE / Agents ratio, agentic WoW adoption per team
- Productivity: Stories completed per sprint, velocity trend, changes per FTE
- Speed: Requirement-to-deployment cycle time, deployment frequency
- Quality: Defect escape rate, production incident rate
- Team Satisfaction & Success: Team satisfaction score, success stories documented



Q2. Describe the lifecycle of an agentic solution you've built. Where did AI assist you most effectively?
A2. Built an export control compliance system that checks document content against export control regulations (country and client-specific), proposes mitigation to users, and makes decisions on possible routing paths based on classification and country of origin and destination.

Lifecycle:
1. Prototyping & Design: AI was used to develop a prototype to validate routing logic and define success metrics — critical for building client confidence that AI could handle sensitive compliance decisions autonomously
2. Testing Data: AI generated synthetic documents matching real patterns for model training and testing without exposing sensitive data
3. Architecture: AI designed application and integration architecture considering client environment constraints (Azure Gov) and regulatory requirements
4. Development & Deployment: AI-augmented approach throughout development, testing, and production release
5. Iteration: AI SDLC continuously prototypes new routing rules and workflows as regulations evolve

Most Effective AI Contribution:
The design/prototyping phase—where rapid delivery speed significantly impressed the client. AI enabled us to iterate on compliance logic and prototypes in days rather than weeks, demonstrating clear value early. AI to build AI is another great area: prompting, synthetic data generation, evaluation — all was done with the help of AI.

Q3. How do you determine whether a problem is better suited for agentic automation versus traditional programming? Describe your decision framework. What factors (e.g., determinism requirements, cost of failure, data availability, maintenance overhead) would lead you to choose a declarative, hard-coded solution even when an agentic one is possible?

A3. I’d start from traditional logic — it’s usually cheaper and faster to run (and development/change/support cost with the help of AI is completely acceptable). We can use AI to manage non-AI logic, for instance. Prototyping is an edge case; we might use AI in some places to do it quickly and replace it with logic after profiling, cost assessment, etc.

The tree below is indicative; there might be complex, conflicting requirements — cases like unpredictable input with hard latency requirements, for instance — where we need to do something creative.

1. Are inputs predictable with fixed, stable rules?
   YES → hard-coded ↓ NO

2. Is failure cost high? (security, payments, compliance)
   YES → hard-coded (+ human-in-loop) ↓ NO

3. Is full step-by-step auditability required? (GDPR, SOC2, regulated industries)
   YES → hard-coded ↓ NO

4. Is latency a hard constraint? (sub-100ms, real-time)
   YES → hard-coded; LLM inference adds 100ms–1s+ per call ↓ NO

5. Will LLM inference cost be prohibitive at this volume? (millions of ops/day)
   YES → hard-coded; costs scale linearly and blow up fast ↓ NO

6. Can a single LLM call solve it?
   YES → single LLM call (no orchestration overhead needed) ↓ NO

→ Agentic (multi-step reasoning, tool use, memory, orchestration justified)




Q4. What are the tradeoffs between AI-augmented orchestration and hard-coded pipelines?
A4. Tradeoffs by dimension:

- Predictability: Hard-coded — same input, same output every time. Agentic — non-deterministic; behavior can vary across calls.
- Adaptability: Agentic — handles edge cases and evolving requirements without code changes. Hard-coded — every new case might require a code change and deployment.
- - Reasoning: Agentic — can reason through ambiguous, multi-factor problems dynamically. Hard-coded — can handle memory, state, and context passing, but cannot reason or think through problems; logic must be explicitly defined upfront.
- Latency: Hard-coded — microsecond execution. Agentic — adds 100ms–1s+ per LLM call; compounds in multi-step chains.
- Cost: Hard-coded — usually way smaller predictable compute cost. Agentic —  becomes a stop factor at high throughput and volumes.
- Traceability: Hard-coded — every step is explicit and auditable; full execution path is deterministic and inspectable. Agentic — execution path varies per run; harder to audit what happened, why a decision was made, or reproduce a specific outcome.

------ PAGE 2


Q 2_1. What are the core components of context engineering in agentic systems? Describe how you would architect a system to manage a limited context window (e.g., 128k tokens) for a task that requires processing millions of tokens. What are the trade-offs between different RAG strategies, summarization layers, and fine-tuning?

A 2_1. Context engineering is about deciding what goes into the limited context window at each step — and what stays outside it.

Architecture for 128k window over millions of tokens:
1. [RAG] Chunk and embed all content into a vector DB at ingestion
2. [RAG] At each agent step, retrieve only the most relevant chunks (semantic + keyword hybrid search)
3. [Summarization] For sequential tasks (e.g. document processing), use a sliding window with rolling summarization — keep a compressed summary of past steps, drop raw content
4. [Summarization] Use hierarchical summarization for large documents: chunk → summarize chunks → summarize summaries
5. [Memory] Store intermediate agent outputs externally; retrieve them as tools, not as raw context
6. [Fine-tuning] Use a fine-tuned model for domain-specific format and behaviour — reduces prompt overhead for repeated patterns 

Trade-offs:

- RAG: fast and updatable, but retrieval quality caps answer quality — misses cross-chunk reasoning, sensitive to chunking strategy. 
- Summarization: preserves narrative flow and sequential context. Loses specifics (exact numbers, verbatim quotes). Errors compound in long chains — a bad summary early corrupts everything downstream.
- Fine-tuning: zero retrieval latency, consistent style/format. Expensive to update; knowledge has a cutoff. Cannot handle private or dynamic data without continuous retraining. Best for behaviour and format, not factual recall.

In practice: RAG for factual/document retrieval, summarization for long sequential workflows, fine-tuning for domain style and task format — used together, not as alternatives.



Q. 2_2. How do you approach the challenge of designing memory systems for long-lived or collaborative agents? 

A 2_2. The main challenge is that memory is never static — for long-lived agents it grows, goes stale, and can be corrupted over time; for collaborative agents it must stay consistent across agents writing simultaneously with potentially conflicting observations. Both cases break the simple assumption that "store it and retrieve it" is enough.

Key challenges:

- Retrieval relevance — As memory grows, finding the right context at the right time gets harder.

- Staleness and contradiction — Facts change. Without expiration or active invalidation, the agent reasons from outdated facts confidently.

- Maintain Abstraction level  — Raw logs are too noisy; over-summarized memories lose critical detail. Needs layered memory (raw events → summaries → facts) with clear promotion rules.

- Shared state in collaboration — Multiple agents writing memory simultaneously create distributed-systems problems: consistency, conflicts, attribution.

A solution per challenge:

Retrieval relevance -> Tiered memory + hybrid retrieval
- Three tiers: working memory (always in-context, small), recall memory (searchable history), archival memory (vector DB / knowledge graph) 
- Hybrid retrieval: semantic search + keyword + re-ranking


Staleness -> Active invalidation + LLM-driven consolidation
- Timestamp every entry with confidence decay — older memories score lower at retrieval
- Periodic LLM consolidation pass: dedup near-identical memories, merge related facts, resolve contradictions by recency/authority
- Separate session memory (staging) from global — promote only after stripping ephemeral context 

Abstraction level -> Three-layer storage 
- History layer: append-only raw log, never summarized — source of truth
- Memory layer: extracted atomic facts with metadata (timestamp, confidence, source) 
- Scratchpad: disposable task-scoped notes


Shared state -> Event sourcing + single-writer partitions
- Least solved problem — concurrent multi-agent writes remain open research
- Each agent owns its memory namespace; a coordinator merges across namespaces periodically
- All writes as immutable events; conflicts resolved at read time by recency or authority 




Q. 2_3. How do you ensure traceability and auditability across agent invocations and decisions?

A. 2_3. The core principle: every agent action must be reconstructable — who did what, with what context, why, and what happened as a result.

Structured trace per invocation — five layers to capture:

- Identity: which agent, user, session, and version triggered the action
- Input: full prompt/context the agent reasoned from
- Reasoning: chain-of-thought, retrieved memories, intermediate LLM outputs — captures *why* the agent chose this action over alternatives
- Action: tool selected, parameters passed, API calls made
- Outcome: result returned, side effects, downstream state changes
- Decision point: when the agent chose between options, log the alternatives considered, the criteria applied, and the selected path

Traceability:
- Hierarchical spans: nest agent steps inside a single trace — workflow -> agent -> individual tool/LLM calls. One correlation ID ties everything together
- Multi-agent: pass trace context across agent handoffs so the full execution tree is reconstructable end-to-end

Auditability:
- Structured queryable logs of every reasoning step 
- Immutable append-only audit log — no edits, no deletes




Q. 2_4. Walk me through a specific time you encountered a critical hallucination in a system you built. What was your root-cause analysis process? What specific guardrails (e.g., validation agents, structured output models, self-correction loops) did you implement to mitigate it? 
A. 2_4. Context: ITAR technical data detection system that scans documents, retrieves relevant ITAR regulation chunks via RAG, and classifies whether the document contains controlled technical data.

The hallucination: The model fabricated regulatory references and technical content in its classification rationale. 

Root-cause analysis:
1. Enabled  logging, reproduced on similar documents
2. Root cause: the model had enough knowledge to generate convincing regulatory language, but no grounding mechanism to anchor it to what the document actually contained

Guardrails implemented:
- Structured output schema — forced the model to output: (1) exact quotes from the document, (2) matched USML category, (3) control rationale referencing only quoted text. 
- Validation agent — second agent verifies every quoted passage exists in the source document and every cited USML reference is a valid subcategory. Catches fabricated evidence before it reaches reviewers
- RAG retrieval improvements — the hallucination was compounded by noisy retrieval: keyword overlap between commercial and defense terminology pulled wrong regulation chunks, giving the model bad context to hallucinate from. 

Result: hallucinated references dropped to near-zero, false positive rate cut from ~30% to ~5%

Q. 2_5. How would you architect the solution to minimize token usage while maintaining quality? What are some of the techniques that would help in this regard? 
A. 2_5. The goal is to send fewer tokens to the model at each step without losing the information that matters for output quality.

Context window management:
- Retrieve only what's needed — targeted RAG with relevance thresholds, not full context stuffing
- Summarize prior steps — rolling summaries for multi-step workflows, keep only the latest step in full
- Drop irrelevant conversation history — filter to only turns relevant to the current task
- Compress tool/function results — extract only the fields the model needs, discard verbose raw outputs
- Cache static prompts — separate instruction from data, only send variable content per request

Prompt engineering:
- Shorter, structured prompts — replace natural language instructions with concise structured formats (e.g., schema definitions, bullet points)
- Few-shot -> zero-shot where possible — if the model performs well without examples (or with one instead of five), remove them. Test and measure
- Output constraints — use structured output schemas (JSON, enums) to prevent the model from generating verbose explanations

Architecture-level techniques:
- Use code/algorithms where possible instead of LLM calls
- Route by complexity — use a small and cheap model for simple tasks
- Cascade pattern — start with the cheapest model; escalate to a larger model only when confidence is below threshold
- Cache repeated queries — if the same or near-identical inputs recur, cache the outputs. 
- Chunk strategically — for large documents, process in focused chunks with targeted prompts rather than feeding the entire document

Measurement — every optimization must be validated against quality:
- Track tokens per task — optimize individual prompts and the whole pipeline
- Monitor cost per quality unit — cost per correct classification, cost per resolved ticket, etc.
- Monitor quality before and after optimization and act accordingly

Q. 3_1. Compare LangChain, CrewAI, Autogen, and DSPy. When would you use each in an enterprise environment? These frameworks represent different architectural patterns (e.g., orchestration, multi-agent collaboration, programmatic prompting). Beyond these specific tools, what fundamental patterns do you see emerging? When would you advocate for building a lightweight, in-house framework instead of adopting an off-the-shelf one?

A. 3_1. Framework comparison:

- LangChain / LangGraph — code-first graph orchestration. You define every node, edge, and state transition programmatically — full control over the execution path. Use when: workflows require deterministic control flow, audit trails, and human approval gates (compliance, document processing). Pick over CrewAI when you need to own and audit every decision point.

- CrewAI — declarative multi-agent collaboration. You define agents by role and goal; the framework handles coordination. Use when: the workflow maps naturally to team roles and you want faster delivery over fine-grained control. Pick over LangGraph when speed of development matters more than low-level control.

- AutoGen — conversation-based multi-agent model. Agents collaborate through structured group chat with turn-taking. Use when: building iterative workflows where agents debate, review, and refine. Pick over CrewAI/LangGraph when the problem is best solved through agent dialogue rather than predefined steps.

- DSPy — programmatic prompt optimization. Fundamentally different from the above three — not an orchestration framework but a prompt tuning system. Auto-optimizes prompts against metrics over a training set. Use when: you need measurable, repeatable accuracy on structured tasks (classification, extraction). 

Emerging patterns beyond specific frameworks:

- Multi-agent as the new microservices — single all-purpose agents replaced by orchestrated teams of specialized agents. 
- Agent-native architectures — products built where autonomous agents are the primary interface, not a supplement to traditional software
- Interoperability protocols — standardized communication between agents and tools and between agents themselves 
- Cost optimization as first-class design — treating agent cost as an architectural concern (model routing, token budgets, cascade patterns), similar to cloud cost optimization 
- Governance as enabler, not overhead — embedding governance logic directly into agent workflows so compliance scales alongside automation

When to build in-house instead of adopting a framework:

- Agentic AI is an emerging field — if the team has the required skills and AI frameworks are core to the business, a custom library can be a strategic advantage
- Workflow is narrow and well-defined — a 200-line module using the LLM provider's SDK directly is simpler and fully debuggable
- Need tight control over latency, cost, and error handling that frameworks abstract away



Q. 3_2. How do you integrate AI into each phase of the SDLC?  o	Requirements Engineering o	Architecture & Design o	Development o	Testing & QA o	Monitoring & Maintenance

A. 3_2. The goal is a continuous AI-native pipeline where context flows across phases — not fragmented tools. A requirement change should automatically propagate through architecture, development, testing, and deployment. 

Three maturity levels (augmented → semi-autonomous → fully autonomous) — teams progress as trust and quality gates mature.

Each phase feeds context forward, creating a seamless flow:

Requirements → structured specs consumed downstream
- Augmented: drafts stories, identifies gaps. 
- Semi-autonomous: generates requirements from stakeholder inputs for human review. 
- Fully autonomous is limited — humans own the "why"; AI surfaces data and proposes candidates, but scoping stays human

Architecture → receives requirements, produces design decisions
- Augmented: suggests patterns, spots gaps. 
- Semi-autonomous: generates options with tradeoff analysis. 
- Fully autonomous: generates design proposals from new requirements, detects drift and proposes refactoring

Development → receives specs and design, produces code
- Augmented: copilots. 
- Semi-autonomous: implements from specs, human reviews before merge. 
- Fully autonomous: ticket → implement → test → merge when gates pass

Testing → receives changes with context (which requirement, which design decision)
- Augmented: suggests test cases, finds untested paths. 
- Semi-autonomous: writes and runs tests with traceability to requirements. 
- Fully autonomous: test → find bugs → fix → retest → auto-merge

Deployment → receives tested artifacts, pushes to production
- Augmented: validates configs, suggests rollback strategies, creates deployment scripts
- Semi-autonomous: orchestrates pipeline, human approves promotion
- Fully autonomous: deploys, monitors health checks, auto-rolls back on degradation

Monitoring, Maintenance & Ops → closes the loop, production signals feed back to requirements
- Augmented: surfaces anomalies, correlates events, identifies trends, suggests root causes. 
- Semi-autonomous: root-cause analysis, proposes remediation, generates bug tickets back to development. Find  outdated dependencies and security vulnerabilities
- Fully autonomous: proactive — detects degradation patterns, patches infrastructure, scales resources, prevents incidents before escalation. Auto-applies security patches and dependency updates within policy

Q. 3_3. How do you build reusable agent patterns or golden paths for your teams?

A. 3_3. The goal is to make proven agent patterns easy to adopt and hard to misuse.

What makes a golden path:
- Opinionated defaults — pre-configured agent templates for specific tasks with built-in guardrails, structured output, tracing, and error handling
- Flexible where it matters — golden paths define the structure but don't lock teams into specific models, tools, settings, or prompts
- Documented decision boundaries — each pattern comes with clear guidance on when to use it, when not to, and what to customize vs. what to leave alone

How to build them:
- Extract from production and generalize into a reusable template
- Standardize the scaffolding — tool registry, structured output schemas, tracing/observability hooks, cost tracking etc.
- Develop a pattern library with examples — a catalog of proven patterns with usage guidance
- Inner-source model — teams contribute patterns back. A pattern that works well in one team gets reviewed, generalized, and published for others

How to maintain them:
- Treat patterns like internal products — versioned, tested, with deprecation policies
- Feedback loop — track adoption, collect friction points. 
- Guard against drift — automated checks that deployed agents conform to golden path standards 

Q. 3_13. Where do you see the most value in a “Human-in-the-Loop” vs. a “Human-on-the-Loop” model? Provide an example for each within the software development lifecycle.

A. 3_13. The difference is when the human intervenes — before the action or after.

Human-in-the-Loop — human approves before the agent acts. The agent proposes, human decides.
- Most value: high-stakes, hard-to-reverse decisions where the cost of a wrong action is high
- SDLC example: code review before merge — agent implements a feature from specs, generates the PR, but a human reviews and approves before it merges to main. The agent does the work, but the human owns the gate
- Also valuable for: architecture decisions, production deployments, compliance classifications

Human-on-the-Loop — agent acts autonomously, human monitors and can intervene if needed. The agent decides, human oversees.
- Most value: high-volume, low-risk, reversible tasks where requiring approval for each action would create a bottleneck
- SDLC example: automated test generation and execution — agent continuously writes tests, runs them, and reports results. Human reviews summaries and trends, but doesn't approve each individual test. If the agent generates a flawed test, human corrects course
- Also valuable for: dependency updates, log analysis, performance monitoring, auto-scaling

