# Multi-LLM Provider Support Discussion

**Date:** 2025-08-04
**Time:** 11:00 AM — 12:00 PM
**Attendees:** Mike (Architect), Alex (Dev Lead), Sarah (PM)
**Location:** Conference Room B / Teams

---

**Mike (Architect):** So we have a request from management to support all four LLM providers — Anthropic Claude, OpenAI, Google Gemini, and Azure OpenAI — with the ability to switch between them seamlessly. Right now the codebase has integrations for Claude and OpenAI, and there's a partial Gemini integration, but it's not production-ready. I want to lay out a proper architecture for this so we're not bolting things on.

**Sarah (PM):** Before we get into the technical design — is there a business driver for this beyond "we want options"?

**Mike (Architect):** A few things. First, vendor risk. If Anthropic has an outage, we need to be able to switch to OpenAI without code changes. Second, cost optimization. Different providers have different pricing, and management wants the flexibility to route evaluations to the cheapest provider that meets quality thresholds. Third, some government clients have mandates about which AI providers they can use — some can only use Azure OpenAI because of data residency requirements.

**Sarah (PM):** That third point is compelling. OK, so this is a real requirement. Go ahead with the technical approach.

**Mike (Architect):** The core idea is a provider abstraction layer. Right now, the AIService has conditional logic — basically a big if-else that checks which provider is configured and calls the appropriate SDK. That works for two providers but it's going to be a mess with four. What I want instead is a common interface — call it an LLMProvider interface — with methods like `evaluate`, `testConnection`, and `getAvailableModels`. Each provider gets its own implementation class.

**Alex (Dev Lead):** Like a strategy pattern. An AnthropicProvider, OpenAIProvider, GeminiProvider, and AzureOpenAIProvider, all implementing the same interface. The AIService holds a reference to whichever one is active and delegates to it.

**Mike (Architect):** Exactly. And this is the key part: we need the provider abstraction layer before we can add Gemini properly. The current code has Gemini half-wired-in, but it's using the same spaghetti approach as the existing integrations. I want to refactor the existing Claude and OpenAI code into the new pattern first, then add Gemini on top of that clean foundation.

**Sarah (PM):** So there's a dependency chain. Abstraction layer first, then refactor existing providers, then add Gemini?

**Mike (Architect):** Right. And Azure OpenAI comes after Gemini because it's essentially a variant of the OpenAI provider with different authentication and endpoint configuration. So the order is: build the abstraction layer, migrate Claude integration to the new pattern, migrate OpenAI integration, add Gemini as a new provider, then add Azure OpenAI.

**Alex (Dev Lead):** That's a pretty long chain. Can we parallelize any of it?

**Mike (Architect):** The abstraction layer has to come first — everything else depends on it. But once it's in place, the Claude and OpenAI migrations can happen in parallel since they're independent. And then Gemini and Azure OpenAI can also be parallel since Azure is based on the OpenAI SDK pattern anyway, not on the Gemini work.

**Sarah (PM):** Let me map this out. Phase 1: provider abstraction layer. Phase 2: migrate Claude and OpenAI in parallel. Phase 3: add Gemini and Azure OpenAI in parallel. How much effort per phase?

**Alex (Dev Lead):** Phase 1 is probably three days. It's defining the interface, refactoring AIService to use it, and writing the factory logic that instantiates the right provider based on configuration. Phase 2 is maybe two days each — we're mostly moving existing code into the new structure. Phase 3 is trickier for Gemini because the Google AI SDK has a different response format. I'd say four days for Gemini and two for Azure since we can reuse the OpenAI patterns.

**Mike (Architect):** There's a technical requirement I want to flag. Each provider has different capabilities — different context windows, different token limits, different rate limits. The abstraction layer needs to expose this metadata so the evaluation pipeline can make decisions. For example, if someone uploads a 200-page PDF, we need to know if the selected model can handle that much text in its context window.

**Alex (Dev Lead):** So each provider implementation exposes something like a `getCapabilities` method that returns max tokens, context window size, supported features. And the evaluation pipeline checks those before sending the request.

**Mike (Architect):** Yes. And here's where it gets interesting. We want the ability to configure a fallback provider. If the primary provider fails — rate limit, outage, whatever — the system automatically retries with the fallback. That requires both providers to be configured and ready, not just the active one.

**Sarah (PM):** Automatic fallback is a nice feature but it adds complexity. Is that essential for the initial multi-provider release?

**Mike (Architect):** I'd call it essential. The whole point of having multiple providers is resilience. If we can't fail over automatically, operators have to manually switch in the settings when there's an outage. That defeats the purpose.

**Alex (Dev Lead):** Agreed, but I want to scope it carefully. For the first iteration, let's do simple failover: if the primary returns an error on the API call, try the fallback. No fancy circuit breakers, no health checking, just try-primary-then-try-fallback.

**Mike (Architect):** That's reasonable for v1. We can add circuit breaker patterns later.

**Sarah (PM):** Now the big question. I've looked at our backlog and the existing LLM Integration epic — ERIS-004 — covers basic provider selection and the current Claude and OpenAI work. But what you're describing — the abstraction layer, multi-provider support, automatic failover, capability metadata — feels like it's beyond what ERIS-004 was scoped for. Do we need a new epic for this?

**Mike (Architect):** I think we do. ERIS-004 is about "the LLM integration works." What we're talking about is a strategic multi-provider platform. Different scope, different success criteria.

**Alex (Dev Lead):** There's also the configuration side of this. Right now LLM settings are a single entry in llm-settings.json — one provider, one model, one API key. For multi-provider, we need settings for every provider simultaneously — four API keys, four model selections, primary/fallback designation. The settings UI needs a complete redesign.

**Sarah (PM):** OK. So we're proposing a new epic. What would we call it?

**Mike (Architect):** Something like "Multi-LLM Provider Platform" or "LLM Provider Abstraction and Failover."

**Sarah (PM):** Let's go with "Multi-LLM Provider Support." And the stories under it would be: provider abstraction layer, Claude migration, OpenAI migration, Gemini integration, Azure OpenAI integration, multi-provider configuration UI, automatic failover, and provider capability metadata.

**Alex (Dev Lead):** Don't forget testing. We need integration tests that can run against each provider. And Jordan is going to want a way to mock the providers for unit tests without hitting real APIs.

**Mike (Architect):** Right. Add a story for a mock provider implementation that the test suite can use. It should implement the same LLMProvider interface but return deterministic results.

**Sarah (PM):** How does this interact with the existing backlog? ERIS-044 is "Add Gemini as a third LLM provider option" — that would fold into this new epic.

**Alex (Dev Lead):** Correct. ERIS-044 should be moved under the new epic and its scope adjusted. It should depend on the abstraction layer story rather than being a standalone addition.

**Mike (Architect):** And any future provider additions — like if someone asks for Mistral or Llama — they just implement the interface and plug in. That's the beauty of the abstraction.

**Sarah (PM):** Alright. Let me summarize the decisions and requirements.

**Decision 1:** We're creating a new epic — "Multi-LLM Provider Support" — separate from the existing ERIS-004 LLM Integration epic.

**Decision 2:** The provider abstraction layer is the first deliverable and is a blocking dependency for all other provider work.

**Decision 3:** Implementation order is: abstraction layer, then Claude + OpenAI migration in parallel, then Gemini + Azure OpenAI in parallel.

**Decision 4:** Automatic failover from primary to secondary provider is required in the initial release.

**Decision 5:** Each provider must expose capability metadata including context window size and rate limits.

**Decision 6:** Multi-provider configuration UI supports simultaneous configuration of all providers with primary/fallback designation.

**Decision 7:** ERIS-044 (Gemini integration) moves to the new epic with updated dependencies.

**Mike (Architect):** I'll draft the technical design document for the provider interface by end of week. Alex, can you spike on the abstraction layer — just a proof of concept with the interface definition and one concrete implementation?

**Alex (Dev Lead):** Yeah, I'll have a spike branch by Thursday. I want to validate that the response normalization works across Claude and OpenAI before we commit to the interface contract.

**Sarah (PM):** Good. I'll create the new epic and stories in the backlog and set up the dependency chain. Let's review the technical design next Monday.

**Mike (Architect):** Sounds good. This is going to clean up a lot of the messiness in the AI service code.

**Sarah (PM):** Alright, we're done here. Thanks everyone.
