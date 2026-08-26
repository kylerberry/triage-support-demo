import { describe, expect, it } from 'vitest'

import { FakeModelGateway } from './model-gateway.js'
import type { SupportVetoClass } from './model-gateway.js'

const personalAccountExamples = [
  ['Should I refinance?', 'advice_request'],
  ['which card should I get?', 'advice_request'],
  ['is this a good rate for me?', 'advice_request'],
  ['What is my APR?', 'account_record_lookup'],
  ['where is my application?', 'account_record_lookup'],
  ['Change my email', 'account_mutation'],
  ['delete my saved card', 'account_mutation'],
] as const satisfies ReadonlyArray<readonly [string, SupportVetoClass]>

const howToExamples = [
  'How do I reset my password?',
  'What does APR mean?',
  'How do I set up a rate alert?',
  'How can I export my saved comparisons?',
] as const

describe('classify fake personal-account Support vetoes', () => {
  it.each(personalAccountExamples)(
    'can be configured so %j returns veto %s',
    async (_text, veto) => {
      const gateway = new FakeModelGateway({
        classify: {
          result: { category: null, confidence: 'high', veto },
        },
      })

      await expect(gateway.classify({ text: _text })).resolves.toEqual({
        category: null,
        confidence: 'high',
        veto,
      })
    },
  )

  it.each(howToExamples)(
    'is not a personal-account veto when configured as how-to %j',
    async (text) => {
      const gateway = new FakeModelGateway({
        classify: {
          result: { category: 'general_qa', confidence: 'high' },
        },
      })

      const result = await gateway.classify({ text })
      expect(result.veto).toBeUndefined()
      expect(result.category).toBe('general_qa')
    },
  )

  it('does not scan Intake text to decide the veto', async () => {
    const gateway = new FakeModelGateway({
      classify: {
        result: {
          category: null,
          confidence: 'high',
          veto: 'advice_request',
        },
      },
    })

    await expect(
      gateway.classify({ text: 'What does APR mean?' }),
    ).resolves.toMatchObject({ veto: 'advice_request' })
  })
})
