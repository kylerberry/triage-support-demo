# Customer Support Triage

This context defines the language for a prototype that triages member-initiated support requests. It distinguishes an initial request from the case that may later be managed by the existing support systems.

## Language

**Member**:
A person using a Bankrate member experience who submits a request for support.
_Avoid_: Customer, user, visitor

**Intake**:
One support request submitted by one Member for triage.
_Avoid_: Ticket, case, message

**Authenticated Intake**:
An Intake received from a channel that has already established the submitting Member’s identity and claims, represented to triage by an opaque member reference.
_Avoid_: Anonymous intake, unauthenticated request

**Channel Metadata**:
A strict allowlist of structured information supplied with an Intake by its originating channel; unknown fields are dropped before logging, policy evaluation, and model processing.
_Avoid_: Intake text, profile record

**Case**:
A support-work record managed by the existing ticketing and case system; an Intake may produce zero or one routed Case and retains its original content only through the system’s protected access controls.
_Avoid_: Intake, ticket

**Approval Task**:
A review item in the existing ticketing and case system through which Support approves a Resolution. The system may represent it as a Case or task, but it is not substantive routing for support handling.
_Avoid_: Escalation, routed Case

**Destination**:
A configured recipient in the existing ticketing and case system for a Case.
_Avoid_: Category, policy

**Intake Category**:
A configured classification that determines which Category Policy applies to an Intake and how it is handled after triage.
_Avoid_: Queue, workflow

**Category Policy**:
The allowed outcomes and Destination for one Intake Category.
_Avoid_: Destination, category

**Profile Fact**:
A minimal, allowlisted fact about the authenticated Member that an existing member-profile service could provide for one permitted support purpose; the prototype does not retrieve Profile Facts.
_Avoid_: Profile record, member data

**Knowledge Request**:
An Intake asking for information from published support or policy material.
_Avoid_: Policy decision

**Knowledge Source**:
An approved help-center article or excerpt returned to ground a Resolution and cited in its draft.
_Avoid_: Model knowledge, policy decision

**Product Feedback**:
An Intake expressing an opinion, suggestion, or problem report about a product experience.
_Avoid_: Complaint

**Protected Complaint**:
An Intake that requires compliance-sensitive handling and must be Routed to Legal & Compliance rather than receive a Resolution.
_Avoid_: Feedback, standard support request

**Resolution**:
An AI-produced draft response to a Knowledge Request that does not require Routing for substantive handling and remains inside the system until human approval.
_Avoid_: Auto-answer, Routing, escalation

**Member-Facing Response**:
Content sent to a Member only after human approval.
_Avoid_: Resolution, draft response

**Approval Gate**:
The human review required before any Resolution becomes a Member-Facing Response.
_Avoid_: Automatic send, Resolution

**Approval Outcome**:
The downstream review label for a Resolution: approved as-is, edited, or rejected. It is captured by the existing case system or Shadow Run, not returned by the triage endpoint.
_Avoid_: Decision, Resolution

**Routing**:
The instruction to the existing ticketing and case system to create and transfer a Case to a configured human-owned Destination when an Intake must not receive a Resolution.
_Avoid_: Resolution, escalation

**Compliance Flag**:
A protected-handling indicator attached to a Compliance Intake routed to the Legal & Compliance Destination.
_Avoid_: Resolution, general feedback

**Decision**:
The stable triage result for one Intake: its assigned Intake Category (or no Category when unavailable), chosen action (`draft_resolution` or `route_to_team`), Classification Confidence, approval requirement, structured Reason Codes, and any applicable Resolution or Context Package.
_Avoid_: Case, Intake

**Reason Code**:
A bounded, machine-readable explanation of a Decision, such as `knowledge_sources_found`, `sensitive_signal`, or `deadline_exceeded`.
_Avoid_: Model rationale, chain-of-thought

**Classification**:
The assignment of an Intake Category before the system decides whether drafting or Routing is permitted. For Product Feedback, its structured output may include a safe Routing Summary.
_Avoid_: Resolution, routing

**Classification Confidence**:
The classifier’s structured `high`, `low`, or `unavailable` label for its assigned Intake Category. It is a routing guard, not a claim that any Resolution is correct; only `high` can enter a policy-eligible Q&A drafting path.
_Avoid_: Resolution confidence, model quality score

**Degraded Mode**:
The safe fallback used when a required model, knowledge, or profile dependency times out, fails, or has an open circuit: Route the Intake to Support without a Resolution.
_Avoid_: Partial resolution, technical error

**Delivery Status**:
The state of routing work after a Decision: in production, pending only after durable acceptance, then delivered or failed after case-system handoff. The prototype does not implement this handoff.
_Avoid_: Routing decision, Case

**Evaluation Scenario**:
A synthetic Intake with an expected Decision or prohibited outcome used to test the triage system’s safety boundaries.
_Avoid_: Production metric, live Member request

**AI-Handled Rate**:
The share of total production or Shadow Run Intakes whose Decision is a policy-correct Resolution draft or a policy-correct Route to Product or Legal & Compliance; the eventual measure for the directional 80% goal. Support fallback does not count.
_Avoid_: Synthetic pass rate, approved-as-is rate, model accuracy

**Approved-as-is Rate**:
The share of reviewed Resolution drafts a human accepts without edit; a later draft-quality metric, not the 80% headline.
_Avoid_: AI-Handled Rate, Decision

**Shadow Run**:
A passive release in which Decisions and drafts are reviewed but do not send Member-Facing Responses or create routed Cases.
_Avoid_: Assisted live mode, production automation

**Safety Gate**:
A CI-enforced prohibition such as a sensitive-data leak, an unapproved Member-Facing Response, a prohibited Resolution, or an unsafe fallback.
_Avoid_: Resolution-rate target, quality preference

**Live Model Evaluation**:
A limited scheduled evaluation of the real model and provider against synthetic scenarios; it complements deterministic CI checks without blocking every change.
_Avoid_: Blocking CI, production metric

**Routing Summary**:
A sanitized structured summary produced with a Product Feedback Classification and validated before inclusion in a Context Package.
_Avoid_: Member-Facing Response, Raw Intake

**Context Package**:
The minimum structured information a receiving team needs to handle a Routed Intake.
_Avoid_: Intake, profile record

**Direct Identifier**:
A fixture-detectable value that directly identifies a Member (email, phone, SSN-like, account-number-like) and is replaced before model processing. Residual names and quasi-identifiers are not claimed to be removed.
_Avoid_: Sensitive Signal, profile fact

**Sanitized Intake**:
An Intake with Direct Identifiers replaced before model processing. The Approval Task may retain it with the draft and citations; triage does not retain the Raw Intake.
_Avoid_: Raw Intake, Context Package

**Sensitive Signal**:
A compliance-sensitive indicator that bypasses the model and Routes to Legal & Compliance: regulator or legal claims, fraud or identity-theft claims, privacy-rights demands, discrimination complaints, or full payment-card / SSN-like values. It is not a help-center how-to, a personal-record lookup, or a product suggestion.
_Avoid_: Direct Identifier, Context Package, member data, account how-to

**Advice Request**:
An Intake asking for a personalized recommendation rather than published material; it Routes to Support and must not receive a Resolution.
_Avoid_: Knowledge Request, Product Feedback

**Personal Record Request**:
An Intake asking for a Member-specific fact or an account mutation; it Routes to Support because the prototype has no Profile Facts and does not change accounts.
_Avoid_: Sensitive Signal, Knowledge Request

## Example dialogue

> **Domain expert:** A Member submits a Knowledge Request about a published policy.
>
> **Developer:** The system either prepares a Resolution for approval or Routes it to a human-owned Destination. Product Feedback is Routed to Product, while a Protected Complaint is Routed to Legal & Compliance with a Compliance Flag. Any Member-Facing Response requires approval.
