# RFC: AI Customer-Service Triage and Support

**Status:** Approved  
**Purpose:** Specify a focused prototype for triaging authenticated Member Intakes. AI either prepares a grounded Resolution draft or Routes the Intake to Product, Legal & Compliance, or Support. A human approves every Member-Facing Response. The prototype does not send one.

Canonical terms live in [`CONTEXT.md`](../CONTEXT.md).

## Goal

Demonstrate a fail-closed path where AI handles a directional 80% of representative Intakes by **drafting** eligible General Q&A or **routing** Product Feedback and Compliance to the right team. The remaining Intakes fall through to Support.

This prototype does not claim production performance and does not assume a volume mix. Shares of Q&A, feedback, and compliance are unknown.

**AI-Handled Rate** is the directional 80% measure: Intakes whose Decision is a policy-correct `draft_resolution` or a policy-correct `route_to_team` to Product or Legal & Compliance, divided by total production or Shadow Run Intakes. Support fallback does not count.

**Approved-as-is rate** is a later draft-quality metric only (approved-as-is drafts / drafts reviewed). It is not the 80% headline.

## Assumptions

These assumptions make the prototype deliberately narrow; they are not claims about Bankrate’s current systems or policy.

- Every Intake comes from an upstream-authenticated Member. Triage receives an opaque `memberRef` and `claims`, but never authenticates the Member.
- The three initial categories—General Q&A, Product Feedback, and Compliance—are sufficient to demonstrate the policy seam.
- Correct AI Routing to Product or Legal & Compliance counts as resolved through AI. Support is the human leftover.
- Human approval exists conceptually. The prototype does not implement that workflow or send Member-Facing Responses.
- The ticketing/case queue and member-profile service are documented boundaries only. The prototype does not look up Profile Facts, create Cases, or create Approval Tasks.
- Local curated help-center fixtures stand in for a production knowledge base. They prove grounded drafting only; they are not a RAG design.
- `claims` and unused allowlisted metadata (`channel`, `locale`, `surface`) are accepted and ignored. They are reserved for a future profile or retrieval integration. Unknown metadata is dropped.
- A real model can classify and draft often enough to show the flow. Every external dependency client is assumed to enforce an explicit timeout and surface failures as catchable errors; the finite staged pipeline therefore has no separate end-to-end request cutoff.
- Direct Identifier scrubbing in this prototype is pattern replacement on synthetic fixtures (email, phone, SSN-like, account-number-like). It does not catch names or quasi-identifiers and is not production PII removal.
- Synthetic Safety Gates validate architecture and regressions. The directional 80% goal is measured only in Shadow Run or production.

## Scope

### In scope

- One `POST /triage` endpoint and a synthetic scenario runner.
- Three categories with explicit policy: General Q&A, Product Feedback, and Compliance.
- One shared pipeline. Policies are typed code constants, checked in CI.
- A real model behind one `ModelGateway`, with separate `classify` and `draftResolution` operations. The scenario runner can also use deterministic fakes.
- A local curated help-center fixture set and simple lexical retrieval.
- Grounded General Q&A drafts with source citations.
- Deterministic guards (Sensitive Signals, Direct Identifiers, advice, personal-record, missing information, out-of-scope, mixed intent).
- Fail-closed fallback and CI Safety Gates.

### Out of scope

- Authentication, member-profile lookup, ticket/case-queue integration, approval UI, and auto-send.
- Live help-center integration, RAG, vector search, and corpus ingestion.
- Production persistence, analytics, SLOs as a delivery claim, Delivery Status, Profile Facts, and a frontend.
- Actionability / entailment scoring of drafts beyond citation and policy checks.
- Splitting one Intake into multiple actions.

## Existing-System Boundaries

| System | Prototype treatment | Later role |
| --- | --- | --- |
| Upstream channel | Supplies `memberRef`, ignored `claims`, text, and allowlisted metadata. | Authenticates the Member and owns the raw Intake. |
| Help-center knowledge base | Local curated fixtures behind a `KnowledgeBase` boundary. | Supplies approved Knowledge Sources. |
| Member-profile service | Unused. | May later supply an allowlisted Profile Fact after policy permits it. The model never selects fields or identifiers. |
| Ticketing and case system | Unused. Decision JSON is the handoff. | Would host Approval Tasks and Routed Cases. |

## 80% target and rollout

No volume mix is assumed. The prototype proves decision rules, not a percentage.

**AI-handled**

- High-confidence General Q&A with Knowledge Sources → Resolution draft; approval still required before send.
- High-confidence Product Feedback → Product route.
- Sensitive Signal or high-confidence Compliance → Legal & Compliance route.

**Not AI-handled (Support fallback)**

Low or unavailable classification, no Knowledge Sources, advice, personal-record lookup or mutation, missing information, out-of-scope, mixed intent, invalid citations, deadline or dependency failure.

**Rollout**

1. Prototype / CI: Safety Gates on synthetic scenarios.
2. Shadow Run: emit Decisions for review; do not send Member-Facing Responses; do not create Cases or Approval Tasks. There is no Approval Outcome loop in this slice.
3. Assisted live (later): create Approval Tasks and Routed Cases; still no auto-send.
4. Only after a measured AI-Handled Rate and draft-quality sample would anyone consider changing the approval gate.

## Endpoint Contract

### Request

```ts
type TriageRequest = {
  intakeId: string
  memberRef: string // opaque; never sent to the model
  claims: Record<string, string | boolean> // accepted; ignored by policy and model
  text: string
  metadata: {
    channel?: string
    locale?: string
    surface?: string
  }
}
```

Unknown metadata is dropped. Allowlisted metadata and `claims` are not used for policy, retrieval, or model calls.

### Response

```ts
type Decision = {
  intakeId: string
  category: "general_qa" | "product_feedback" | "compliance" | null
  action: "draft_resolution" | "route_to_team"
  classificationConfidence: "high" | "low" | "unavailable"
  humanApprovalRequired: true
  reasonCodes: ReasonCode[]
  draftResponse: { text: string; citations: string[] } | null
  route: {
    destination: "product" | "legal_compliance" | "support"
    safeSummary: string | null
    flags: string[]
    intakeRef: string // same value as intakeId
  } | null
}

type ReasonCode =
  | "knowledge_sources_found"
  | "no_knowledge_sources"
  | "sensitive_signal"
  | "direct_identifiers_scrubbed"
  | "advice_request"
  | "account_record_lookup"
  | "account_mutation"
  | "insufficient_information"
  | "out_of_scope"
  | "mixed_intent"
  | "low_confidence"
  | "classification_unavailable"
  | "deadline_exceeded"
  | "dependency_failed"
  | "citation_invalid"
  | "product_feedback"
  | "protected_complaint"
```

`humanApprovalRequired` is always `true`. The pipeline, not the model, chooses action, Destination, and Reason Codes.

## Category Policies

| Category | Action | Destination / review | Drafting rule | Context |
| --- | --- | --- | --- | --- |
| General Q&A | `draft_resolution` | Support approval (not implemented) | `high` confidence; Knowledge Sources required; not advice, personal-record, mixed, or out-of-scope | Draft plus citations |
| Product Feedback | `route_to_team` | Product | Never draft a Member response | Classifier-produced safe Routing Summary |
| Compliance | `route_to_team` | Legal & Compliance | Never draft a Member response | Compliance Flag and `intakeId` only |

## Guards

Evaluated in order on the raw Intake (Sensitive Signals) or the Sanitized Intake (the rest). The first match wins. These are explicit fixture-backed rules, not a general classifier.

### Sensitive Signal → Legal & Compliance, no model

Compliance-sensitive material, not “mentions money or an account”:

- Regulator, legal, or deceptive-practice claims (for example CFPB, TILA, lawsuit, attorney, “misleading rates” as a legal claim)
- Fraud, identity theft, or unauthorized-access claims
- Privacy-rights demands (delete my data, CCPA, GDPR) as a legal request
- Discrimination or protected-class complaints
- Full payment-card or SSN-like values (also Direct Identifiers; this path wins)

### Direct Identifier → scrub, then continue

Replace email, phone, SSN-like, and account-number-like patterns in synthetic fixtures. Then continue the pipeline. Residual names and quasi-identifiers may still reach the model.

### Support, no draft (and no classify when the guard is deterministic)

| Guard | Examples | Reason Code |
| --- | --- | --- |
| Advice / personalized recommendation | “Should I refinance?”, “which card should I get?”, “is this a good rate for me?” | `advice_request` |
| Personal-record lookup | “What is my APR?”, “where is my application?” | `account_record_lookup` |
| Account mutation | “Change my email”, “delete my saved card” | `account_mutation` |
| Missing information | “How do I update it?”, empty or fragment text | `insufficient_information` |
| Out of scope | Competitor how-to, not-Bankrate ask, “write my appeal” | `out_of_scope` |
| Mixed intent | How-to plus a product suggestion, or Q&A plus a complaint that is not already a Sensitive Signal | `mixed_intent` |

Help-center how-tos stay eligible for General Q&A after scrub: password reset, rate-alert setup, “what does APR mean”, export saved comparisons.

Tradeoff: mixed intent does not split into two actions. The Intake goes to Support rather than drafting the how-to and also routing feedback.

## Shared Pipeline

```text
validate request and drop unknown metadata
  → Sensitive Signal on raw Intake? Legal & Compliance; no model
  → replace Direct Identifiers
  → advice / personal-record / mutation / missing / out-of-scope / mixed?
       Support; no model
  → classify Sanitized Intake
       ├─ unavailable / low: Support
       ├─ high Product Feedback: Product, safe Routing Summary
       ├─ high Compliance: Legal & Compliance; no draft
       └─ high General Q&A:
            lexical KnowledgeBase lookup
            ├─ no sources: Support
            └─ draftResolution with retrieved sources only
                 → citations must be from that set
                 → approval-required draft
```

On a dependency timeout or exception: discard any partial draft and Route to Support with `dependency_timeout` or `dependency_failed`. Rolling timeout and error rates may open a circuit; while open, affected Intakes bypass that dependency and Route to Support.

`classify` returns a category, `high | low` confidence, and, for Product Feedback, an optional safe Routing Summary. `draftResolution` is called only for policy-eligible General Q&A. The model receives the Sanitized Intake and retrieved source excerpts only.

Lexical retrieval matches any article that shares at least one non-stopword term with the query, so a single query can return more than one fixture. The drafting stage must still cite only sources from the returned set.

## Safety and Data Handling

- Triage never authenticates.
- Do not log raw Intake text, prompts, `memberRef`, `claims`, or routing payloads. Log Decision fields and Reason Codes only.
- Direct Identifiers are pattern-replaced before any model call. Residual identity risk remains.
- Sensitive Signals never reach the model.
- No Profile Fact lookup. A later integration may request one allowlisted fact after policy permits it.
- Decisions expose Reason Codes and citations, never free-form model rationale.

## Latency and Degraded Mode

- Keep **p95 ≤3 seconds** as an observational objective, not a control. Slow successful drafts may complete and still count toward AI-Handled Rate.
- Configure an explicit timeout for every external dependency call. On timeout or another dependency exception, discard any partial draft and Route to Support.
- Use rolling timeout and error rates to open a circuit. While open, bypass the unhealthy dependency and Route affected Intakes to Support. Thresholds and recovery timing require production evidence.
- Report total and per-stage latency, fallback rate, circuit-open rate, and AI-Handled Rate independently.
- The prototype assumes all external work occurs through bounded dependency clients and the local pipeline cannot loop indefinitely; it adds no separate per-request ceiling.

## Prototype Implementation

- **Runtime:** TypeScript.
- **HTTP/schema/test tooling:** Hono, Zod, Vitest.
- **Model:** `ModelGateway.classify` and `ModelGateway.draftResolution`; fakes in CI and as a runner option.
- **Knowledge:** local curated articles behind a lexical `KnowledgeBase`.
- **Demo:** endpoint plus a script that runs the synthetic scenarios below.

## Evaluation

### Blocking CI

Deterministic fakes only. Fail CI on every Safety Gate violation:

- a prohibited Resolution (advice, personal-record, Sensitive Signal, mixed intent, no sources, Compliance, Product Feedback)
- `humanApprovalRequired` not `true`
- Sensitive Signal leakage to the model
- wrong Destination
- malformed model output or a citation not in the retrieved set
- unsafe dependency-timeout or circuit-open fallback
- incomplete policy constants

These tests do not assert an 80/20 mix.

### Live Model Evaluation

Optional, on demand: the same synthetic safety scenarios against the real provider. Not a blocking CI gate.

### Shadow Run

Later, not this prototype: generate Decisions for review only. Do not send Member-Facing Responses and do not create Routed Cases. AI-Handled Rate is counted from those Decisions. Approval Outcomes are out of scope until a review process exists.

## Demonstration Scenarios

| Scenario | Expected Decision | Why |
| --- | --- | --- |
| Clear help-center how-to | High General Q&A; draft with citations; approval required | AI-handled draft |
| Help-center question with no source | Support; `no_knowledge_sources` | No unsupported draft |
| Product suggestion | Product; `product_feedback` | AI-handled route |
| Regulator / legal complaint | Legal & Compliance; `sensitive_signal`; no model | AI-handled route; model bypass |
| Identifier inside an otherwise valid how-to | Scrub, then draft | Identifier ≠ Sensitive Signal |
| “What is my APR?” / application status | Support; `account_record_lookup` | Not Legal; no profile facts |
| “Should I refinance?” | Support; `advice_request` | No personalized advice |
| How-to plus a product suggestion | Support; `mixed_intent` | No split actions |
| “How do I update it?” | Support; `insufficient_information` | Missing object |
| Competitor or not-Bankrate ask | Support; `out_of_scope` | Not our published material |
| Low-confidence classification | Support; `low_confidence` | No draft on a hypothesis |
| Model or retrieval failure / deadline | Support; fallback Reason Code | Partial draft discarded |

## Risks

- **Unknown mix.** 80% is a later measurement. The prototype only shows that AI-handled vs Support is an explicit rule.
- **Sensitive Signal under/over-trigger.** Too wide and how-tos die; too narrow and protected complaints reach the model.
- **Residual PII.** Pattern scrub misses names and quasi-identifiers.
- **Cited but ungrounded drafts.** Citations must come from retrieved sources; the prototype does not check that the draft is entailed by those sources.
- **Advice leakage.** The advice guard is fixture-backed and will miss some recommendation phrasing.
- **Live-model timeout.** Two model calls under 5s can make a live demo look like Support-only; fakes exist so the happy path stays visible.
- **Untrusted Intake text.** Prompt-injection handling is out of scope; Intake text is still untrusted input to the model.
- **Classifier error.** A missed Compliance label after the Sensitive Signal guard is a residual leak; a Q&A mislabeled as feedback loses a draft.
