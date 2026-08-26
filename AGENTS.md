# Bankrate Triage Support

## Objective

Within 3–4 hours, produce an RFC and a working prototype for customer-service triage and support. The prototype should credibly demonstrate a path to resolving roughly 80% of representative intakes with AI; the remaining cases must be clearly escalated to a human. This system is a proposed replacement for an existing, manual process today.

Optimize for a coherent, correct vertical slice and visible product judgment—not feature breadth, production hardening, or speculative architecture. Reasonable assumptions, clearly stated,
are a positive signal, not a gap.

## Delivery Bar

The RFC and prototype must make these points concrete:

- Which intake types the system handles and which it escalates.
- The route from intake to AI resolution or human handoff.
- The assumptions, decision rules, and limits behind the 80% target.
- Safe behavior for ambiguity, low confidence, missing information, and out-of-scope requests.
- A small set of representative scenarios that demonstrate expected outcomes.

Use synthetic data only. Do not invent Bankrate policy, account data, integrations, or claims of measured performance.

## Scope Discipline

- Build the smallest end-to-end flow that proves the core idea.
- Prefer explicit rules, fixtures, and understandable state over generalized frameworks or hidden behavior.
- Production code has one pipeline: Layer 1 (Sensitive Signal, empty text, scrub) then `classify` then policy or draft. Do not add a production phrase matcher so CI can avoid `classify`.
- “No live model” means FakeModelGateway, not “do not call classify.” Intent veto fixtures belong on the fake and in tests, not in `src/` detectors, unless the raw text must never enter a prompt (Sensitive Signals, Direct Identifiers).
- Keep the AI decision, its rationale, and the escalation path visible in the prototype.
- State consequential assumptions and tradeoffs in the RFC or beside the relevant code.
- Do not add authentication, real integrations, persistence, analytics, configurability, or edge-case handling unless they are necessary to demonstrate the core flow.
- Remove code made obsolete by a change. Mention unrelated issues without fixing them.

## Working Conventions

- Clarify only ambiguity that blocks a material implementation choice; otherwise make the smallest reasonable assumption and record it.
- Touch only files needed for the requested outcome and match the existing style.
- Every meaningful feature needs a runnable or inspectable demonstration path.
- Before calling a case AI-resolved, verify that the response is actionable and that the case does not meet an escalation condition.
- Escalate rather than guess when the system lacks enough information or a response could create material customer, compliance, or financial risk.
- Do not grow a production phrase library for out-of-scope or advice. Misses are eval or Shadow Run labels.

## Documentation

Keep one concise RFC as the source of truth for the prototype's scope, flows, assumptions, risks, and validation. Keep implementation notes next to the work they explain.
