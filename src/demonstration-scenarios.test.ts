// RFC Demonstration Scenarios (docs/rfc.md): one FakeModelGateway row each.
// Layer 1 Sensitive Signal is PipelineHalted, not a Legal Decision.
// Do not assert an 80/20 mix.

import { describe, expect, it } from 'vitest'

import { DependencyCircuits } from './dependency-guard.js'
import { FakeModelGateway } from './model-gateway.js'
import {
  demonstrationScenarios,
  type DemonstrationScenario,
} from './demonstration-scenarios.js'
import { runPipeline, type PipelineResult } from './pipeline.js'

const extrasByIntakeId: Record<
  string,
  (result: PipelineResult, gateway: FakeModelGateway) => void
> = {
  'intake-n16-sensitive'(result, gateway) {
    expect(result).toEqual({
      status: 'halted',
      reason: 'sensitive_signal',
      match: { reasonCode: 'sensitive_signal', signal: 'regulator_legal' },
    })
    expect(gateway.classifyCalls).toEqual([])
    expect(gateway.draftResolutionCalls).toEqual([])
  },
  'intake-n16-scrub'(result, gateway) {
    expect(result.status).toBe('continued')
    if (result.status !== 'continued') return
    expect(result.directIdentifiersReplaced).toBe(true)
    expect(gateway.classifyCalls).toEqual([
      {
        text: 'How do I reset my password? Email me at [email]',
      },
    ])
  },
}

function assertScenario(
  result: PipelineResult,
  expected: DemonstrationScenario['expected'],
  gateway: FakeModelGateway,
) {
  if (expected.action === 'halted') {
    expect(result.status).toBe('halted')
    if (result.status !== 'halted') return
    expect(result.reason).toBe(expected.reasonCode)
    return
  }

  expect(result.status).toBe('continued')
  if (result.status !== 'continued') return

  const { decision } = result
  expect(decision.action).toBe(expected.action)
  expect(decision.reasonCodes).toEqual([expected.reasonCode])
  expect(decision.humanApprovalRequired).toBe(true)

  const destinationOrDraft = expected.destinationOrDraft
  if (destinationOrDraft.kind === 'draft') {
    expect(decision.draftResponse).not.toBeNull()
    expect(decision.draftResponse?.citations).toEqual([
      ...destinationOrDraft.citations,
    ])
    expect(decision.route).toBeNull()
    return
  }

  expect(destinationOrDraft.kind).toBe('destination')
  if (destinationOrDraft.kind !== 'destination') return
  expect(decision.draftResponse).toBeNull()
  expect(decision.route?.destination).toBe(destinationOrDraft.destination)
  expect(gateway.draftResolutionCalls).toEqual([])
}

describe('RFC demonstration scenarios', () => {
  it.each(demonstrationScenarios)('$name', async (scenario) => {
    const gateway = new FakeModelGateway(scenario.gateway)
    const result = await runPipeline(
      scenario.text,
      scenario.intakeId,
      gateway,
      { circuits: new DependencyCircuits() },
    )

    assertScenario(result, scenario.expected, gateway)
    extrasByIntakeId[scenario.intakeId]?.(result, gateway)
  })
})
