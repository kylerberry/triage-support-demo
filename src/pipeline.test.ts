import { describe, expect, it } from 'vitest'

import { FakeModelGateway } from './model-gateway.js'
import { runPipeline } from './pipeline.js'

const howTo = 'How do I reset my password?'
const howToWithEmail = 'How do I reset my password? Email me at ops@corp.io'
const sensitive = 'I filed a CFPB complaint about misleading rates'
const personalAccount = 'What is my APR?'

describe('runPipeline', () => {
  it('halts on a Sensitive Signal before empty-text, scrub, or classify', async () => {
    const gateway = new FakeModelGateway()
    const result = await runPipeline(
      'I filed a CFPB complaint. Email ops@corp.io or send card 4111 1111 1111 1111',
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
      const result = await runPipeline(rawText, gateway)

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

    const result = await runPipeline(howToWithEmail, gateway)

    expect(result).toEqual({
      status: 'continued',
      sanitizedText: 'How do I reset my password? Email me at [email]',
      classification: { category: 'general_qa', confidence: 'high' },
      directIdentifiersReplaced: true,
    })
    expect(gateway.classifyCalls).toEqual([
      { text: 'How do I reset my password? Email me at [email]' },
    ])
    expect(gateway.draftResolutionCalls).toEqual([])
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

    const result = await runPipeline(personalAccount, gateway)

    expect(result).toEqual({
      status: 'continued',
      sanitizedText: personalAccount,
      classification: {
        category: null,
        confidence: 'high',
        veto: 'account_record_lookup',
      },
      directIdentifiersReplaced: false,
    })
    expect(gateway.classifyCalls).toEqual([{ text: personalAccount }])
    expect(gateway.draftResolutionCalls).toEqual([])
  })

  it('does not halt a Sensitive-Signal-free how-to before classify', async () => {
    const gateway = new FakeModelGateway()
    const result = await runPipeline(howTo, gateway)

    expect(result.status).toBe('continued')
    if (result.status !== 'continued') return
    expect(result.sanitizedText).toBe(howTo)
    expect(result.directIdentifiersReplaced).toBe(false)
    expect(gateway.classifyCalls).toHaveLength(1)
    expect(gateway.draftResolutionCalls).toEqual([])
  })

  it('never forwards memberRef or claims to classify', async () => {
    const gateway = new FakeModelGateway()
    await runPipeline(howTo, gateway)

    expect(gateway.classifyCalls).toEqual([{ text: howTo }])
    expect(Object.keys(gateway.classifyCalls[0]!)).toEqual(['text'])
  })

  it('does not treat a Sensitive Signal as empty text', async () => {
    const gateway = new FakeModelGateway()
    const result = await runPipeline(sensitive, gateway)

    expect(result).toMatchObject({
      status: 'halted',
      reason: 'sensitive_signal',
    })
    expect(gateway.classifyCalls).toEqual([])
  })
})
