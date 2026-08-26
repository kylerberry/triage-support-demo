import { describe, expect, it } from 'vitest'

import { DependencyCircuits } from './dependency-guard.js'
import {
  FakeModelGateway,
  type FakeModelGatewayConfig,
  type SupportVetoClass,
} from './model-gateway.js'
import { runPipeline, type PipelineResult } from './pipeline.js'
import type { Decision, ReasonCode } from './schemas.js'

const howTo = 'How do I reset my password?'
const howToWithEmail = 'How do I reset my password? Email me at ops@corp.io'
const sanitizedHowToWithEmail = 'How do I reset my password? Email me at [email]'
const noSourceQuery = 'What are your branch hours?'
const sensitive = 'I filed a CFPB complaint about misleading rates'
const passwordResetCitation = 'kb.password-reset.v1'

const highGeneralQa: FakeModelGatewayConfig = {
  classify: { result: { category: 'general_qa', confidence: 'high' } },
}

function vetoConfig(veto: SupportVetoClass): FakeModelGatewayConfig {
  return {
    classify: { result: { category: null, confidence: 'high', veto } },
  }
}

type DestinationOrDraft =
  | { readonly kind: 'draft'; readonly citations: readonly string[] }
  | { readonly kind: 'destination'; readonly destination: 'product' | 'support' }
  | { readonly kind: 'halt' }

type Scenario = {
  readonly name: string
  readonly text: string
  readonly intakeId: string
  readonly gateway: FakeModelGatewayConfig
  readonly expected: {
    readonly action: Decision['action'] | 'halted'
    readonly destinationOrDraft: DestinationOrDraft
    readonly reasonCode: ReasonCode
  }
  readonly extras?: (
    result: PipelineResult,
    gateway: FakeModelGateway,
  ) => void
}

function assertScenario(
  result: PipelineResult,
  expected: Scenario['expected'],
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

const scenarios = [
  {
    name: 'Clear help-center how-to',
    text: howTo,
    intakeId: 'intake-n16-howto',
    gateway: highGeneralQa,
    expected: {
      action: 'draft_resolution',
      destinationOrDraft: {
        kind: 'draft',
        citations: [passwordResetCitation],
      },
      reasonCode: 'knowledge_sources_found',
    },
  },
  {
    name: 'Help-center question with no source',
    text: noSourceQuery,
    intakeId: 'intake-n16-no-source',
    gateway: highGeneralQa,
    expected: {
      action: 'route_to_team',
      destinationOrDraft: { kind: 'destination', destination: 'support' },
      reasonCode: 'no_knowledge_sources',
    },
  },
  {
    name: 'Product suggestion',
    text: 'Please add a comparison-export reminder on the rates page.',
    intakeId: 'intake-n16-product',
    gateway: {
      classify: {
        result: { category: 'product_feedback', confidence: 'high' },
      },
    },
    expected: {
      action: 'route_to_team',
      destinationOrDraft: { kind: 'destination', destination: 'product' },
      reasonCode: 'product_feedback',
    },
  },
  {
    name: 'Regulator / legal complaint',
    text: sensitive,
    intakeId: 'intake-n16-sensitive',
    gateway: {},
    expected: {
      action: 'halted',
      destinationOrDraft: { kind: 'halt' },
      reasonCode: 'sensitive_signal',
    },
    extras(result, gateway) {
      expect(result).toEqual({
        status: 'halted',
        reason: 'sensitive_signal',
        match: { reasonCode: 'sensitive_signal', signal: 'regulator_legal' },
      })
      expect(gateway.classifyCalls).toEqual([])
      expect(gateway.draftResolutionCalls).toEqual([])
    },
  },
  {
    name: 'Identifier inside an otherwise valid how-to',
    text: howToWithEmail,
    intakeId: 'intake-n16-scrub',
    gateway: highGeneralQa,
    expected: {
      action: 'draft_resolution',
      destinationOrDraft: {
        kind: 'draft',
        citations: [passwordResetCitation],
      },
      reasonCode: 'knowledge_sources_found',
    },
    extras(result, gateway) {
      expect(result.status).toBe('continued')
      if (result.status !== 'continued') return
      expect(result.directIdentifiersReplaced).toBe(true)
      expect(gateway.classifyCalls).toEqual([
        { text: sanitizedHowToWithEmail },
      ])
    },
  },
  {
    name: '“What is my APR?” / application status',
    text: 'What is my APR?',
    intakeId: 'intake-n16-apr',
    gateway: vetoConfig('account_record_lookup'),
    expected: {
      action: 'route_to_team',
      destinationOrDraft: { kind: 'destination', destination: 'support' },
      reasonCode: 'account_record_lookup',
    },
  },
  {
    name: '“Should I refinance?”',
    text: 'Should I refinance?',
    intakeId: 'intake-n16-advice',
    gateway: vetoConfig('advice_request'),
    expected: {
      action: 'route_to_team',
      destinationOrDraft: { kind: 'destination', destination: 'support' },
      reasonCode: 'advice_request',
    },
  },
  {
    name: 'How-to plus a product suggestion',
    text: 'How do I reset my password? Also, you should add dark mode to the app.',
    intakeId: 'intake-n16-mixed',
    gateway: vetoConfig('mixed_intent'),
    expected: {
      action: 'route_to_team',
      destinationOrDraft: { kind: 'destination', destination: 'support' },
      reasonCode: 'mixed_intent',
    },
  },
  {
    name: '“How do I update it?”',
    text: 'How do I update it?',
    intakeId: 'intake-n16-missing',
    gateway: vetoConfig('insufficient_information'),
    expected: {
      action: 'route_to_team',
      destinationOrDraft: { kind: 'destination', destination: 'support' },
      reasonCode: 'insufficient_information',
    },
  },
  {
    name: 'Competitor or not-Bankrate ask',
    text: 'How do I make a payment on my Chase credit card?',
    intakeId: 'intake-n16-oos',
    gateway: vetoConfig('out_of_scope'),
    expected: {
      action: 'route_to_team',
      destinationOrDraft: { kind: 'destination', destination: 'support' },
      reasonCode: 'out_of_scope',
    },
  },
  {
    name: 'Low-confidence classification',
    text: howTo,
    intakeId: 'intake-n16-low',
    gateway: {
      classify: {
        result: { category: 'general_qa', confidence: 'low' },
      },
    },
    expected: {
      action: 'route_to_team',
      destinationOrDraft: { kind: 'destination', destination: 'support' },
      reasonCode: 'low_confidence',
    },
  },
  {
    name: 'Model or retrieval failure / deadline',
    text: howTo,
    intakeId: 'intake-n16-failed',
    gateway: { classify: { failure: 'throw' } },
    expected: {
      action: 'route_to_team',
      destinationOrDraft: { kind: 'destination', destination: 'support' },
      reasonCode: 'dependency_failed',
    },
  },
] satisfies readonly Scenario[]

describe('RFC demonstration scenarios', () => {
  it.each(scenarios)('$name', async (scenario) => {
    const gateway = new FakeModelGateway(scenario.gateway)
    const result = await runPipeline(
      scenario.text,
      scenario.intakeId,
      gateway,
      { circuits: new DependencyCircuits() },
    )

    assertScenario(result, scenario.expected, gateway)
    scenario.extras?.(result, gateway)
  })
})
