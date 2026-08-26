import { describe, expect, it } from 'vitest'

import { DependencyCircuits } from './dependency-guard.js'
import {
  FakeModelGateway,
  type DraftResolution,
} from './model-gateway.js'
import { categoryPolicies } from './policies.js'
import { runPipeline, type PipelineDeps } from './pipeline.js'
import { DecisionSchema, type Decision } from './schemas.js'

const intakeId = 'intake-n17'
const howTo = 'How do I reset my password?'
const noSourceQuery = 'What are your branch hours?'
const sensitive = 'I filed a CFPB complaint about misleading rates'

const passwordResetSource = {
  citationId: 'kb.password-reset.v1',
  excerpt:
    'To reset a password, open the sign-in page, choose Forgot password, and follow the link sent to the email address on the account.',
} as const

const highGeneralQa = {
  classify: { result: { category: 'general_qa', confidence: 'high' } },
} as const

function isolatedDeps(overrides: PipelineDeps = {}): PipelineDeps {
  return { circuits: new DependencyCircuits(), ...overrides }
}

async function continuedDecision(
  gateway: FakeModelGateway,
  text = howTo,
  deps: PipelineDeps = isolatedDeps(),
) {
  const result = await runPipeline(text, intakeId, gateway, deps)
  expect(result.status).toBe('continued')
  if (result.status !== 'continued') {
    throw new Error('expected pipeline to continue')
  }
  expect(DecisionSchema.safeParse(result.decision).success).toBe(true)
  return result
}

function expectSupportFallback(
  decision: Decision,
  reasonCodes: Decision['reasonCodes'],
  confidence: Decision['classificationConfidence'] = 'high',
) {
  expect(decision.draftResponse).toBeNull()
  expect(decision.action).toBe('route_to_team')
  expect(decision.humanApprovalRequired).toBe(true)
  expect(decision.route).toEqual({
    destination: 'support',
    safeSummary: null,
    flags: [],
    intakeRef: intakeId,
  })
  expect(decision.reasonCodes).toEqual(reasonCodes)
  expect(decision.classificationConfidence).toBe(confidence)
}

describe('blocking CI safety gates', () => {
  describe('prohibited Resolution', () => {
    it.each([
      'advice_request',
      'account_record_lookup',
      'mixed_intent',
    ] as const)('does not draft on classify veto %s', async (veto) => {
      const gateway = new FakeModelGateway({
        classify: { result: { category: null, confidence: 'high', veto } },
      })
      const result = await continuedDecision(gateway)

      expectSupportFallback(result.decision, [veto])
      expect(gateway.draftResolutionCalls).toEqual([])
    })

    it('does not draft high general_qa when retrieval is empty', async () => {
      const gateway = new FakeModelGateway(highGeneralQa)
      const result = await continuedDecision(gateway, noSourceQuery)

      expectSupportFallback(result.decision, ['no_knowledge_sources'])
      expect(gateway.draftResolutionCalls).toEqual([])
    })

    it('does not draft a Sensitive Signal and never calls the model', async () => {
      const gateway = new FakeModelGateway()
      const result = await runPipeline(
        sensitive,
        intakeId,
        gateway,
        isolatedDeps(),
      )

      expect(result).toMatchObject({
        status: 'halted',
        reason: 'sensitive_signal',
      })
      expect(gateway.classifyCalls).toEqual([])
      expect(gateway.draftResolutionCalls).toEqual([])
    })

    it('routes high product_feedback without a Resolution', async () => {
      const gateway = new FakeModelGateway({
        classify: {
          result: { category: 'product_feedback', confidence: 'high' },
        },
      })
      const result = await continuedDecision(gateway)

      expect(result.decision.draftResponse).toBeNull()
      expect(result.decision.action).toBe(
        categoryPolicies.product_feedback.action,
      )
      expect(result.decision.route?.destination).toBe(
        categoryPolicies.product_feedback.destination,
      )
      expect(gateway.draftResolutionCalls).toEqual([])
    })

    it('routes high compliance without a Resolution', async () => {
      const gateway = new FakeModelGateway({
        classify: { result: { category: 'compliance', confidence: 'high' } },
      })
      const result = await continuedDecision(gateway)

      expect(result.decision.draftResponse).toBeNull()
      expect(result.decision.action).toBe(categoryPolicies.compliance.action)
      expect(result.decision.route?.destination).toBe(
        categoryPolicies.compliance.destination,
      )
      expect(gateway.draftResolutionCalls).toEqual([])
    })
  })

  describe('humanApprovalRequired', () => {
    it('keeps every continued Decision schema-valid with approval required', async () => {
      const branches = await Promise.all([
        continuedDecision(new FakeModelGateway(highGeneralQa)),
        continuedDecision(
          new FakeModelGateway({
            classify: {
              result: { category: 'product_feedback', confidence: 'high' },
            },
          }),
        ),
        continuedDecision(
          new FakeModelGateway({
            classify: {
              result: {
                category: null,
                confidence: 'high',
                veto: 'advice_request',
              },
            },
          }),
        ),
        continuedDecision(
          new FakeModelGateway({
            classify: { failure: 'timeout', timeoutMs: 5 },
          }),
        ),
      ])

      for (const result of branches) {
        expect(result.decision.humanApprovalRequired).toBe(true)
        expect(DecisionSchema.safeParse(result.decision).success).toBe(true)
      }
    })

    it('rejects a Decision whose humanApprovalRequired is not true', async () => {
      const { decision } = await continuedDecision(
        new FakeModelGateway(highGeneralQa),
      )

      expect(
        DecisionSchema.safeParse({
          ...decision,
          humanApprovalRequired: false,
        }).success,
      ).toBe(false)
    })
  })

  describe('Destination', () => {
    it('maps each category and Support fallback to its only safe Destination', async () => {
      const drafted = await continuedDecision(new FakeModelGateway(highGeneralQa))
      expect(drafted.decision.route).toBeNull()

      const product = await continuedDecision(
        new FakeModelGateway({
          classify: {
            result: { category: 'product_feedback', confidence: 'high' },
          },
        }),
      )
      expect(product.decision.route?.destination).toBe('product')

      const compliance = await continuedDecision(
        new FakeModelGateway({
          classify: { result: { category: 'compliance', confidence: 'high' } },
        }),
      )
      expect(compliance.decision.route?.destination).toBe('legal_compliance')

      const fallback = await continuedDecision(
        new FakeModelGateway({
          classify: {
            result: {
              category: null,
              confidence: 'high',
              veto: 'mixed_intent',
            },
          },
        }),
      )
      expect(fallback.decision.route?.destination).toBe('support')
    })
  })

  describe('malformed model output and unsupported citation', () => {
    it('fails closed when draftResolution omits citations', async () => {
      const gateway = new FakeModelGateway({
        ...highGeneralQa,
        draftResolution: {
          result: {
            text: 'Reset your password from sign-in.',
          } as unknown as DraftResolution,
        },
      })
      const result = await continuedDecision(gateway)

      expectSupportFallback(result.decision, ['citation_invalid'])
      expect(gateway.draftResolutionCalls).toEqual([
        { text: howTo, sources: [passwordResetSource] },
      ])
    })

    it('fails closed when a citation is outside the retrieved set', async () => {
      const gateway = new FakeModelGateway({
        ...highGeneralQa,
        draftResolution: {
          result: {
            text: 'Check the APR table.',
            citations: ['kb.apr-meaning.v1'],
          },
        },
      })
      const result = await continuedDecision(gateway)

      expectSupportFallback(result.decision, ['citation_invalid'])
      expect(result.decision.draftResponse).toBeNull()
    })
  })

  describe('unsafe timeout or circuit-open fallback', () => {
    it('classify timeout discards work and routes Support', async () => {
      const gateway = new FakeModelGateway({
        classify: { failure: 'timeout', timeoutMs: 5 },
      })
      const result = await continuedDecision(gateway)

      expectSupportFallback(result.decision, ['deadline_exceeded'], 'unavailable')
      expect(gateway.draftResolutionCalls).toEqual([])
    })

    it('classify throw discards work and routes Support', async () => {
      const gateway = new FakeModelGateway({
        classify: { failure: 'throw' },
      })
      const result = await continuedDecision(gateway)

      expectSupportFallback(result.decision, ['dependency_failed'], 'unavailable')
      expect(gateway.draftResolutionCalls).toEqual([])
    })

    it('draftResolution timeout discards the partial draft', async () => {
      const gateway = new FakeModelGateway({
        ...highGeneralQa,
        draftResolution: { failure: 'timeout', timeoutMs: 5 },
      })
      const result = await continuedDecision(gateway)

      expectSupportFallback(result.decision, ['deadline_exceeded'])
      expect(gateway.draftResolutionCalls).toHaveLength(1)
    })

    it('open classify circuit bypasses the gateway and routes Support', async () => {
      const circuits = new DependencyCircuits()
      circuits.open('classify')
      const gateway = new FakeModelGateway()
      const result = await continuedDecision(gateway, howTo, { circuits })

      expectSupportFallback(result.decision, ['dependency_failed'], 'unavailable')
      expect(gateway.classifyCalls).toEqual([])
      expect(gateway.draftResolutionCalls).toEqual([])
    })

    it('open draft_resolution circuit skips drafting after retrieval', async () => {
      const circuits = new DependencyCircuits()
      circuits.open('draft_resolution')
      const gateway = new FakeModelGateway(highGeneralQa)
      const result = await continuedDecision(gateway, howTo, { circuits })

      expectSupportFallback(result.decision, ['dependency_failed'])
      expect(gateway.classifyCalls).toHaveLength(1)
      expect(gateway.draftResolutionCalls).toEqual([])
    })
  })

  describe('incomplete policy constants', () => {
    it('fails when a category policy is missing the required fields already gated in policies.test.ts', () => {
      const requiredFields = [
        'action',
        'context',
        'destination',
        'draftingRule',
        'review',
      ] as const

      expect(Object.keys(categoryPolicies)).toHaveLength(3)
      for (const policy of Object.values(categoryPolicies)) {
        expect(Object.keys(policy).sort()).toEqual([...requiredFields])
        expect(policy.action.length).toBeGreaterThan(0)
        expect(policy.draftingRule.length).toBeGreaterThan(0)
        expect(policy.context.length).toBeGreaterThan(0)
      }
    })
  })
})
