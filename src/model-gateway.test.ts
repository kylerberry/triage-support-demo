import { describe, expect, it } from 'vitest'

import {
  FakeModelGateway,
  ModelGatewayError,
  ModelGatewayTimeoutError,
} from './model-gateway.js'

const sanitizedText = 'How do I reset my password?'

const passwordResetSource = {
  citationId: 'kb.password-reset.v1',
  excerpt:
    'To reset a password, open the sign-in page, choose Forgot password, and follow the link sent to the email address on the account.',
} as const

describe('FakeModelGateway.classify', () => {
  it('returns a configured category and confidence', async () => {
    const gateway = new FakeModelGateway({
      classify: {
        result: { category: 'compliance', confidence: 'high' },
      },
    })

    await expect(gateway.classify({ text: sanitizedText })).resolves.toEqual({
      category: 'compliance',
      confidence: 'high',
    })
  })

  it.each(['high', 'low', 'unavailable'] as const)(
    'returns %s confidence',
    async (confidence) => {
      const gateway = new FakeModelGateway({
        classify: {
          result: { category: 'general_qa', confidence },
        },
      })

      await expect(gateway.classify({ text: sanitizedText })).resolves.toEqual({
        category: 'general_qa',
        confidence,
      })
    },
  )

  it('may include an optional routing summary for product feedback', async () => {
    const gateway = new FakeModelGateway({
      classify: {
        result: {
          category: 'product_feedback',
          confidence: 'high',
          routingSummary: 'Member wants a clearer rate-alert setup flow',
        },
      },
    })

    await expect(gateway.classify({ text: sanitizedText })).resolves.toEqual({
      category: 'product_feedback',
      confidence: 'high',
      routingSummary: 'Member wants a clearer rate-alert setup flow',
    })
  })

  it('omits routingSummary when it is not configured', async () => {
    const gateway = new FakeModelGateway({
      classify: {
        result: { category: 'product_feedback', confidence: 'high' },
      },
    })

    await expect(gateway.classify({ text: sanitizedText })).resolves.toEqual({
      category: 'product_feedback',
      confidence: 'high',
    })
  })

  it('can return a Support veto class instead of an Intake Category', async () => {
    const gateway = new FakeModelGateway({
      classify: {
        result: {
          category: null,
          confidence: 'high',
          veto: 'advice_request',
        },
      },
    })

    await expect(gateway.classify({ text: sanitizedText })).resolves.toEqual({
      category: null,
      confidence: 'high',
      veto: 'advice_request',
    })
  })

  it('records only sanitized text and never receives memberRef or claims', async () => {
    const gateway = new FakeModelGateway()

    await gateway.classify({ text: sanitizedText })

    expect(gateway.classifyCalls).toHaveLength(1)
    expect(Object.keys(gateway.classifyCalls[0]!).sort()).toEqual(['text'])
    expect(gateway.classifyCalls[0]).toEqual({ text: sanitizedText })
    expect(gateway.classifyCalls[0]).not.toHaveProperty('memberRef')
    expect(gateway.classifyCalls[0]).not.toHaveProperty('claims')
  })
})

describe('FakeModelGateway.draftResolution', () => {
  it('returns text plus citations from the provided sources', async () => {
    const gateway = new FakeModelGateway()
    const input = { text: sanitizedText, sources: [passwordResetSource] }

    const first = await gateway.draftResolution(input)
    const second = await gateway.draftResolution(input)

    expect(first.text.length).toBeGreaterThan(0)
    expect(first.citations).toEqual(['kb.password-reset.v1'])
    expect(second).toEqual(first)
  })

  it('is invoked only directly and receives only text and sources', async () => {
    const gateway = new FakeModelGateway()

    await gateway.classify({ text: sanitizedText })
    expect(gateway.draftResolutionCalls).toEqual([])

    await gateway.draftResolution({
      text: sanitizedText,
      sources: [passwordResetSource],
    })

    expect(gateway.draftResolutionCalls).toHaveLength(1)
    expect(Object.keys(gateway.draftResolutionCalls[0]!).sort()).toEqual([
      'sources',
      'text',
    ])
  })
})

describe('FakeModelGateway failure modes', () => {
  it('can time out classify', async () => {
    const gateway = new FakeModelGateway({
      classify: { failure: 'timeout', timeoutMs: 5 },
    })

    await expect(gateway.classify({ text: sanitizedText })).rejects.toBeInstanceOf(
      ModelGatewayTimeoutError,
    )
  })

  it('can throw from draftResolution without using the timeout error', async () => {
    const gateway = new FakeModelGateway({
      draftResolution: { failure: 'throw' },
    })

    await expect(
      gateway.draftResolution({
        text: sanitizedText,
        sources: [passwordResetSource],
      }),
    ).rejects.toSatisfy(
      (error) =>
        error instanceof ModelGatewayError &&
        !(error instanceof ModelGatewayTimeoutError),
    )
  })

  it('keeps timeout and throw configuration independent per operation', async () => {
    const timeoutClassify = new FakeModelGateway({
      classify: { failure: 'timeout', timeoutMs: 5 },
    })
    const throwDraft = new FakeModelGateway({
      draftResolution: { failure: 'throw' },
    })

    await expect(
      timeoutClassify.classify({ text: sanitizedText }),
    ).rejects.toBeInstanceOf(ModelGatewayTimeoutError)
    await expect(
      timeoutClassify.draftResolution({
        text: sanitizedText,
        sources: [passwordResetSource],
      }),
    ).resolves.toMatchObject({ citations: ['kb.password-reset.v1'] })

    await expect(
      throwDraft.classify({ text: sanitizedText }),
    ).resolves.toMatchObject({
      category: 'general_qa',
      confidence: 'high',
    })
    await expect(
      throwDraft.draftResolution({
        text: sanitizedText,
        sources: [passwordResetSource],
      }),
    ).rejects.toBeInstanceOf(ModelGatewayError)
  })
})
