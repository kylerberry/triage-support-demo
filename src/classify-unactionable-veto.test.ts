import { describe, expect, it } from 'vitest'

import { FakeModelGateway } from './model-gateway.js'
import type { SupportVetoClass } from './model-gateway.js'

const unactionableExamples = [
  ['How do I update it?', 'insufficient_information'],
  ['How do I make a payment on my Chase credit card?', 'out_of_scope'],
  ['What is the weather in Chicago tomorrow?', 'out_of_scope'],
  ['Can you write my appeal letter for me?', 'out_of_scope'],
  [
    'How do I reset my password? Also, you should add dark mode to the app.',
    'mixed_intent',
  ],
] as const satisfies ReadonlyArray<readonly [string, SupportVetoClass]>

describe('classify fake un-actionable Support vetoes', () => {
  it.each(unactionableExamples)(
    'can be configured so %j returns veto %s',
    async (text, veto) => {
      const gateway = new FakeModelGateway({
        classify: {
          result: { category: null, confidence: 'high', veto },
        },
      })

      await expect(gateway.classify({ text })).resolves.toEqual({
        category: null,
        confidence: 'high',
        veto,
      })
    },
  )

  it('is not an un-actionable veto when configured as a single how-to', async () => {
    const gateway = new FakeModelGateway({
      classify: {
        result: { category: 'general_qa', confidence: 'high' },
      },
    })

    const result = await gateway.classify({
      text: 'How do I reset my password?',
    })
    expect(result.veto).toBeUndefined()
    expect(result.category).toBe('general_qa')
  })

  it('does not scan Intake text to decide the veto', async () => {
    const gateway = new FakeModelGateway({
      classify: {
        result: {
          category: null,
          confidence: 'high',
          veto: 'out_of_scope',
        },
      },
    })

    await expect(
      gateway.classify({ text: 'How do I reset my password?' }),
    ).resolves.toMatchObject({ veto: 'out_of_scope' })
  })
})
