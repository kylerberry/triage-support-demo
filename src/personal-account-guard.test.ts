import { describe, expect, it } from 'vitest'
import { DecisionSchema, ReasonCodeSchema } from './schemas.js'
import { detectPersonalAccountGuard } from './personal-account-guard.js'

const matchingFixtures = [
  ['Should I refinance?', 'advice_request'],
  ['which card should I get?', 'advice_request'],
  ['is this a good rate for me?', 'advice_request'],
  ['What is my APR?', 'account_record_lookup'],
  ['where is my application?', 'account_record_lookup'],
  ['What is the status of my application?', 'account_record_lookup'],
  ['Change my email', 'account_mutation'],
  ['delete my saved card', 'account_mutation'],
] as const

describe('detectPersonalAccountGuard', () => {
  it.each(matchingFixtures)(
    'routes fixture %j to %s without classification',
    (text, reasonCode) => {
      expect(detectPersonalAccountGuard(text)).toStrictEqual({
        destination: 'support',
        reasonCode,
        shouldClassify: false,
      })
    },
  )

  it.each([
    'How do I reset my password?',
    'What does APR mean?',
    'How do I set up a rate-alert?',
    'How can I export my saved comparisons?',
  ])('does not match eligible how-to %j', (text) => {
    expect(detectPersonalAccountGuard(text)).toBeNull()
  })

  it('does not treat an APR-definition how-to as a personal-record lookup', () => {
    expect(detectPersonalAccountGuard('What is my APR?')).toStrictEqual({
      destination: 'support',
      reasonCode: 'account_record_lookup',
      shouldClassify: false,
    })
    expect(detectPersonalAccountGuard('What does APR mean?')).toBeNull()
  })

  it('matches case-insensitively across punctuation and whitespace', () => {
    expect(detectPersonalAccountGuard('  SHOULD I refinance?? ')).toStrictEqual({
      destination: 'support',
      reasonCode: 'advice_request',
      shouldClassify: false,
    })
    expect(detectPersonalAccountGuard('change my email!')).toStrictEqual({
      destination: 'support',
      reasonCode: 'account_mutation',
      shouldClassify: false,
    })
  })

  it('supports a classification-free Support Decision that parses against DecisionSchema', () => {
    const match = detectPersonalAccountGuard('Should I refinance?')
    if (match === null) {
      throw new Error('expected a personal-account Support match')
    }

    const intakeId = 'intake-n6-1'
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
    expect(decision.reasonCodes).toEqual(['advice_request'])
  })

  it('emits reason codes that exist on ReasonCodeSchema', () => {
    for (const [text] of matchingFixtures) {
      const result = detectPersonalAccountGuard(text)
      expect(result).not.toBeNull()
      if (result === null) continue
      expect(ReasonCodeSchema.options).toContain(result.reasonCode)
    }
  })
})
