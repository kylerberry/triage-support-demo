# RFC: AI Customer-Service Triage and Support

**Status:** Draft  
**Purpose:** Define the smallest prototype that credibly demonstrates AI resolution of roughly 80% of representative customer-service intakes, with safe human escalation for the rest.

## Problem and Goal

<!-- What customer issue is being triaged, who submits it, and what a successful resolution means. -->

## Prototype Scope

### In scope

<!-- Supported intake types and the end-to-end flow to demonstrate. -->

### Out of scope

<!-- Production integrations, authentication, persistence, analytics, and other deferred work. -->

## Triage and Resolution Flow

<!-- Show how an intake is classified, resolved, or escalated. Include the information shown to a reviewer or user. -->

## Escalation Conditions

<!-- List low-confidence, incomplete, sensitive, policy-dependent, and out-of-scope cases that require a human. -->

## Assumptions and Constraints

- The 80% target is a prototype objective, not a measured production result.
- All examples and test data are synthetic.
- The prototype does not claim Bankrate policy, account access, or live-system integration.

<!-- Add consequential product or implementation assumptions here. -->

## Demonstration Scenarios

| Scenario | Expected route | Expected outcome | Why it is safe |
| --- | --- | --- | --- |
| <!-- Representative resolvable intake --> | AI resolution | <!-- Actionable response --> | <!-- Why no escalation is needed --> |
| <!-- Representative ambiguous or sensitive intake --> | Human escalation | <!-- Handoff context --> | <!-- Why the system must not guess --> |

## Validation

<!-- Define how the prototype demonstrates correct routing, actionable answers, and appropriate escalation. -->

## Risks and Open Questions

<!-- Record unresolved policy, data, safety, or product decisions that could change the design. -->
