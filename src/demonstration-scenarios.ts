// RFC Demonstration Scenarios (docs/rfc.md). Synthetic fixtures only.
// Per-scenario FakeModelGateway configs belong here so CI and the runner
// share one source. This is not a production phrase matcher.

import type {
  FakeModelGatewayConfig,
  SupportVetoClass,
} from './model-gateway.js'
import type { Decision, ReasonCode } from './schemas.js'

export type DestinationOrDraft =
  | { readonly kind: 'draft'; readonly citations: readonly string[] }
  | { readonly kind: 'destination'; readonly destination: 'product' | 'support' }
  | { readonly kind: 'halt' }

export type DemonstrationScenario = {
  readonly name: string
  readonly text: string
  readonly intakeId: string
  readonly gateway: FakeModelGatewayConfig
  readonly expected: {
    readonly action: Decision['action'] | 'halted'
    readonly destinationOrDraft: DestinationOrDraft
    readonly reasonCode: ReasonCode
  }
}

const howTo = 'How do I reset my password?'
const howToWithEmail = 'How do I reset my password? Email me at ops@corp.io'
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

export const demonstrationScenarios = [
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
] as const satisfies readonly DemonstrationScenario[]
