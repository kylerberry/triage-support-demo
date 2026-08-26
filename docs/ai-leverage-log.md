# AI Leverage Log

## Purpose

A log of how AI has been used to design and build the triage & support system.

## Entries

1. Used a minimal [Pi agent harness](https://github.com/kylerberry/agent-utilities/blob/main/skills/craft-lite/SKILL.md)
2. Used `/grill-with-docs` skill to define prototype scope, mark RFC  design & decisions, and nail down future scale goals. 50 different decision forks resolved. **Model: openai/gpt-5.6-terra (high reasoning)**
3. Adversarial review of the drafted RFC searching for prototype gaps, or undefined decisions. **Model: xai/grok-4.6 (high reasoning)**
4. Used my own skill, [`/decompose-to-dag`](https://github.com/kylerberry/agent-utilities/blob/main/skills/decompose-to-dag/SKILL.md)), to decompose the RFC into work nodes and acyclic dependency graph. This is pre-implementation prep that produces @dag.json. **Model: xai/grok-4.6 (high reasoning)**
5. Used my own skill, [`/execute-dag`](https://github.com/kylerberry/agent-utilities/blob/main/skills/execute-dag/SKILL.md), to orchestrate agents to implement the @dag.json pausing for a HITL approval gate at every completed wave.
  - Each agent executes work using my own orchestration called [`/craft-lite`](https://github.com/kylerberry/agent-utilities/blob/main/skills/craft-lite/SKILL.md) - each execution phase uses a differentiated, complimentary model for bias avoidance.
  - **Models: Defined by /craft and subagent rules - multi-provider execution to avoid**
