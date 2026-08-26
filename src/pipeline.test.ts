import { describe, expect, it } from 'vitest'

import { FakeModelGateway, type Classification } from './model-gateway.js'
import { categoryPolicies } from './policies.js'
import { runPipeline } from './pipeline.js'
import { DecisionSchema } from './schemas.js'
import type { Decision } from './schemas.js'

const intakeId = 'intake-n11'
const howTo = 'How do I reset my password?'
const howToWithEmail = 'How do I reset my password? Email me at ops@corp.io'
const sanitizedHowToWithEmail = 'How do I reset my password? Email me at [email]'
const noSourceQuery = 'What are your branch hours?'
const sensitive = 'I filed a CFPB complaint about misleading rates'
const personalAccount = 'What is my APR?'

const passwordResetSource = {
  citationId: 'kb.password-reset.v1',
  excerpt:
    'To reset a password, open the sign-in page, choose Forgot password, and follow the link sent to the email address on the account.',
} as const

function supportDecision(
  reasonCodes: Decision['reasonCodes'],
  classificationConfidence: Decision['classificationConfidence'],
): Decision {
  return {
    intakeId,
    category: null,
    action: 'route_to_team',
    classificationConfidence,
    humanApprovalRequired: true,
    reasonCodes,
    draftResponse: null,
    route: {
      destination: 'support',
      safeSummary: null,
      flags: [],
      intakeRef: intakeId,
    },
  }
}

const expectedGeneralQaDecision: Decision = {
  intakeId,
  category: 'general_qa',
  action: 'draft_resolution',
  classificationConfidence: 'high',
  humanApprovalRequired: true,
  reasonCodes: ['knowledge_sources_found'],
  draftResponse: {
    text: passwordResetSource.excerpt,
    citations: ['kb.password-reset.v1'],
  },
  route: null,
}

async function decisionFor(classify: Classification): Promise<Decision> {
  const gateway = new FakeModelGateway({
    classify: { result: classify },
  })
  const result = await runPipeline(howTo, intakeId, gateway)
  expect(result.status).toBe('continued')
  if (result.status !== 'continued') {
    throw new Error('expected pipeline to continue')
  }
  expect(gateway.draftResolutionCalls).toEqual([])
  return result.decision
}

describe('runPipeline', () => {
  it('halts on a Sensitive Signal before empty-text, scrub, or classify', async () => {
    const gateway = new FakeModelGateway()
    const result = await runPipeline(
      'I filed a CFPB complaint. Email ops@corp.io or send card 4111 1111 1111 1111',
      intakeId,
      gateway,
    )

    expect(result).toEqual({
      status: 'halted',
      reason: 'sensitive_signal',
      match: { reasonCode: 'sensitive_signal', signal: 'regulator_legal' },
    })
    expect(gateway.classifyCalls).toEqual([])
    expect(gateway.draftResolutionCalls).toEqual([])
  })

  it.each(['', '   ', '\n\t'])(
    'treats %j as insufficient_information without calling the model',
    async (rawText) => {
      const gateway = new FakeModelGateway()
      const result = await runPipeline(rawText, intakeId, gateway)

      expect(result).toEqual({
        status: 'halted',
        reason: 'insufficient_information',
      })
      expect(gateway.classifyCalls).toEqual([])
      expect(gateway.draftResolutionCalls).toEqual([])
    },
  )

  it('scrubs Direct Identifiers then continues to classify the sanitized text', async () => {
    const gateway = new FakeModelGateway({
      classify: {
        result: { category: 'general_qa', confidence: 'high' },
      },
    })

    const result = await runPipeline(howToWithEmail, intakeId, gateway)

    expect(result).toEqual({
      status: 'continued',
      sanitizedText: sanitizedHowToWithEmail,
      classification: { category: 'general_qa', confidence: 'high' },
      directIdentifiersReplaced: true,
      decision: expectedGeneralQaDecision,
    })
    expect(gateway.classifyCalls).toEqual([
      { text: sanitizedHowToWithEmail },
    ])
    expect(gateway.draftResolutionCalls).toEqual([
      { text: sanitizedHowToWithEmail, sources: [passwordResetSource] },
    ])
  })

  it('continues to classify after a no-op scrub instead of applying Support phrase guards', async () => {
    const gateway = new FakeModelGateway({
      classify: {
        result: {
          category: null,
          confidence: 'high',
          veto: 'account_record_lookup',
        },
      },
    })

    const result = await runPipeline(personalAccount, intakeId, gateway)

    expect(result).toEqual({
      status: 'continued',
      sanitizedText: personalAccount,
      classification: {
        category: null,
        confidence: 'high',
        veto: 'account_record_lookup',
      },
      directIdentifiersReplaced: false,
      decision: supportDecision(['account_record_lookup'], 'high'),
    })
    expect(gateway.classifyCalls).toEqual([{ text: personalAccount }])
    expect(gateway.draftResolutionCalls).toEqual([])
  })

  it('does not halt a Sensitive-Signal-free how-to before classify', async () => {
    const gateway = new FakeModelGateway()
    const result = await runPipeline(howTo, intakeId, gateway)

    expect(result.status).toBe('continued')
    if (result.status !== 'continued') return
    expect(result.sanitizedText).toBe(howTo)
    expect(result.directIdentifiersReplaced).toBe(false)
    expect(gateway.classifyCalls).toHaveLength(1)
    expect(gateway.draftResolutionCalls).toHaveLength(1)
  })

  it('never forwards memberRef or claims to classify', async () => {
    const gateway = new FakeModelGateway()
    await runPipeline(howTo, intakeId, gateway)

    expect(gateway.classifyCalls).toEqual([{ text: howTo }])
    expect(Object.keys(gateway.classifyCalls[0]!)).toEqual(['text'])
  })

  it('does not treat a Sensitive Signal as empty text', async () => {
    const gateway = new FakeModelGateway()
    const result = await runPipeline(sensitive, intakeId, gateway)

    expect(result).toMatchObject({
      status: 'halted',
      reason: 'sensitive_signal',
    })
    expect(gateway.classifyCalls).toEqual([])
  })
})

describe('classification → Decision mapping', () => {
  const supportVetoes = [
    'advice_request',
    'account_record_lookup',
    'account_mutation',
    'insufficient_information',
    'out_of_scope',
    'mixed_intent',
  ] as const

  it.each(supportVetoes)(
    'routes Support veto %s to support with the mapped Reason Code and no draft',
    async (veto) => {
      await expect(
        decisionFor({ category: null, confidence: 'high', veto }),
      ).resolves.toEqual(supportDecision([veto], 'high'))
    },
  )

  it('lets a Support veto beat a high-confidence category', async () => {
    await expect(
      decisionFor({
        category: 'product_feedback',
        confidence: 'high',
        veto: 'out_of_scope',
      }),
    ).resolves.toEqual(supportDecision(['out_of_scope'], 'high'))
  })

  it('lets a Support veto beat unavailable classification', async () => {
    await expect(
      decisionFor({
        category: null,
        confidence: 'unavailable',
        veto: 'account_mutation',
      }),
    ).resolves.toEqual(supportDecision(['account_mutation'], 'unavailable'))
  })

  it('uses product policy action and Destination without drafting', async () => {
    const routingSummary = 'Rates page omitted the disclosed origination fee'
    const decision = await decisionFor({
      category: 'product_feedback',
      confidence: 'high',
      routingSummary,
    })

    expect(decision).toEqual({
      intakeId,
      category: 'product_feedback',
      action: categoryPolicies.product_feedback.action,
      classificationConfidence: 'high',
      humanApprovalRequired: true,
      reasonCodes: ['product_feedback'],
      draftResponse: null,
      route: {
        destination: categoryPolicies.product_feedback.destination,
        safeSummary: routingSummary,
        flags: [],
        intakeRef: intakeId,
      },
    })
    expect(DecisionSchema.safeParse(decision).success).toBe(true)
  })

  it('leaves product safeSummary null when classify omits a Routing Summary', async () => {
    const decision = await decisionFor({
      category: 'product_feedback',
      confidence: 'high',
    })

    expect(decision.route).toEqual({
      destination: 'product',
      safeSummary: null,
      flags: [],
      intakeRef: intakeId,
    })
    expect(decision.draftResponse).toBeNull()
  })

  it('uses compliance policy action and Destination without drafting', async () => {
    const decision = await decisionFor({
      category: 'compliance',
      confidence: 'high',
    })

    expect(decision).toEqual({
      intakeId,
      category: 'compliance',
      action: categoryPolicies.compliance.action,
      classificationConfidence: 'high',
      humanApprovalRequired: true,
      reasonCodes: ['protected_complaint'],
      draftResponse: null,
      route: {
        destination: categoryPolicies.compliance.destination,
        safeSummary: null,
        flags: ['protected_complaint'],
        intakeRef: intakeId,
      },
    })
    expect(DecisionSchema.safeParse(decision).success).toBe(true)
  })

  it('uses general_qa policy action, drafts from retrieved KnowledgeBase sources, and leaves route null', async () => {
    const gateway = new FakeModelGateway({
      classify: {
        result: { category: 'general_qa', confidence: 'high' },
      },
    })
    const result = await runPipeline(howTo, intakeId, gateway)

    expect(result.status).toBe('continued')
    if (result.status !== 'continued') return
    expect(result.decision).toEqual(expectedGeneralQaDecision)
    expect(result.decision.action).toBe(categoryPolicies.general_qa.action)
    expect(gateway.draftResolutionCalls).toEqual([
      { text: howTo, sources: [passwordResetSource] },
    ])
    expect(DecisionSchema.safeParse(result.decision).success).toBe(true)
  })

  it('routes high general_qa to support with no_knowledge_sources when retrieval is empty', async () => {
    const gateway = new FakeModelGateway({
      classify: {
        result: { category: 'general_qa', confidence: 'high' },
      },
    })
    const result = await runPipeline(noSourceQuery, intakeId, gateway)

    expect(result.status).toBe('continued')
    if (result.status !== 'continued') return
    expect(result.decision).toEqual(
      supportDecision(['no_knowledge_sources'], 'high'),
    )
    expect(gateway.draftResolutionCalls).toEqual([])
    expect(DecisionSchema.safeParse(result.decision).success).toBe(true)
  })

  it('discards the draft and routes to support with citation_invalid when a citation is outside the retrieved set', async () => {
    const gateway = new FakeModelGateway({
      classify: {
        result: { category: 'general_qa', confidence: 'high' },
      },
      draftResolution: {
        result: {
          text: 'Check the APR table.',
          citations: ['kb.apr-meaning.v1'],
        },
      },
    })
    const result = await runPipeline(howTo, intakeId, gateway)

    expect(result.status).toBe('continued')
    if (result.status !== 'continued') return
    expect(result.decision).toEqual(
      supportDecision(['citation_invalid'], 'high'),
    )
    expect(gateway.draftResolutionCalls).toEqual([
      { text: howTo, sources: [passwordResetSource] },
    ])
    expect(DecisionSchema.safeParse(result.decision).success).toBe(true)
  })

  it('lets a Support veto beat high general_qa drafting', async () => {
    await expect(
      decisionFor({
        category: 'general_qa',
        confidence: 'high',
        veto: 'advice_request',
      }),
    ).resolves.toEqual(supportDecision(['advice_request'], 'high'))
  })

  it.each([
    ['low', 'low_confidence'],
    ['unavailable', 'classification_unavailable'],
  ] as const)(
    'routes %s classification to support with no draft',
    async (confidence, reasonCode) => {
      await expect(
        decisionFor({ category: 'general_qa', confidence }),
      ).resolves.toEqual(supportDecision([reasonCode], confidence))
    },
  )
})
