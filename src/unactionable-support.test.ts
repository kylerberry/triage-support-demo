import { describe, expect, it } from 'vitest'
import { DecisionSchema, ReasonCodeSchema } from './schemas.js'
import { unactionableSupportDetector } from './unactionable-support.js'

const matchingFixtures = [
  ['How do I update it?', 'insufficient_information'],
  ['', 'insufficient_information'],
  ['   ', 'insufficient_information'],
  ['password', 'insufficient_information'],
  [
    'How do I make a payment on my Chase credit card?',
    'out_of_scope',
  ],
  ['What is the weather in Chicago tomorrow?', 'out_of_scope'],
  ['Can you write my appeal letter for me?', 'out_of_scope'],
  ['How do I fix my printer?', 'out_of_scope'],
  [
    'How do I reset my password? Also, you should add dark mode to the app.',
    'mixed_intent',
  ],
  [
    'What does APR mean? Your site is always broken and pages never load.',
    'mixed_intent',
  ],
] as const

describe('unactionableSupportDetector', () => {
  it.each(matchingFixtures)(
    'routes fixture %j to %s',
    (text, reasonCode) => {
      expect(unactionableSupportDetector.detect(text)).toStrictEqual({
        destination: 'support',
        reasonCode,
      })
    },
  )

  it.each([
    'How do I reset my password?',
    'What does APR mean?',
    'How do I set up a rate alert?',
    'How can I export my saved comparisons?',
  ])('does not match eligible how-to %j', (text) => {
    expect(unactionableSupportDetector.detect(text)).toBeNull()
  })

  it('supports a classification-free Support Decision that parses against DecisionSchema', () => {
    const match = unactionableSupportDetector.detect('How do I update it?')
    if (match === null) throw new Error('expected an un-actionable Support match')

    const intakeId = 'intake-n7-1'
    const decision = DecisionSchema.parse({
      intakeId,
      category: null,
      action: 'route_to_team',
      classificationConfidence: 'unavailable',
      humanApprovalRequired: true,
      reasonCodes: [match.reasonCode],
      draftResponse: null,
      route: {
        destination: match.destination,
        safeSummary: null,
        flags: [],
        intakeRef: intakeId,
      },
    })

    expect(decision.category).toBeNull()
    expect(decision.classificationConfidence).toBe('unavailable')
    expect(decision.draftResponse).toBeNull()
    expect(decision.route?.destination).toBe('support')
    expect(decision.reasonCodes).toEqual(['insufficient_information'])
  })

  it('emits reason codes that exist on ReasonCodeSchema', () => {
    for (const [text] of matchingFixtures) {
      const result = unactionableSupportDetector.detect(text)
      expect(result).not.toBeNull()
      if (result === null) continue
      expect(ReasonCodeSchema.options).toContain(result.reasonCode)
    }
  })
})
