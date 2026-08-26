import { describe, expect, it } from 'vitest'
import { DecisionSchema } from './schemas.js'
import { sensitiveSignalDetector } from './sensitive-signal.js'

describe('sensitiveSignalDetector', () => {
  it.each([
    ['I filed a CFPB complaint about misleading rates', 'regulator_legal'],
    ['My attorney is filing a lawsuit under TILA', 'regulator_legal'],
    ['I have a legal claim about these misleading rates', 'regulator_legal'],
    ['I am reporting fraud on my account', 'fraud'],
    ['This is identity theft; someone opened a card in my name', 'fraud'],
    ['There are unauthorized charges on my statement', 'fraud'],
    ['Someone gained unauthorized access to my account', 'fraud'],
    ['Please delete my data', 'privacy_rights'],
    ['I am submitting a CCPA request', 'privacy_rights'],
    ['Under GDPR I want my information erased', 'privacy_rights'],
    [
      'I was denied a loan and I believe it was discrimination',
      'discrimination',
    ],
    ['I am in a protected class and was treated unfairly', 'discrimination'],
    ['This is a fair lending violation', 'discrimination'],
    ['My card 4111111111111111 was charged twice', 'pan_or_ssn'],
    ['Card number 4111 1111 1111 1111 needs attention', 'pan_or_ssn'],
    ['The SSN 123-45-6789 on file is wrong', 'pan_or_ssn'],
  ])('flags the RFC example intake %s as %s', (rawText, signal) => {
    expect(sensitiveSignalDetector.detect(rawText)).toStrictEqual({
      reasonCode: 'sensitive_signal',
      signal,
    })
  })

  it.each([
    [
      'I am filing a CFPB complaint about fraud on card 4111 1111 1111 1111',
      'regulator_legal',
    ],
    ['Identity theft: someone used my SSN 123-45-6789', 'fraud'],
    ['A fair lending complaint about card 4111111111111111', 'discrimination'],
  ])('applies first-match-wins family order for %s', (rawText, signal) => {
    expect(sensitiveSignalDetector.detect(rawText)?.signal).toBe(signal)
  })

  it.each([
    'To reset a password, open the sign-in page, choose Forgot password, and follow the link sent to the email address on the account.',
    'What does APR mean?',
    'How do I set up a rate alert?',
    'How can I export my saved comparisons?',
    '',
    '   ',
    'card ending in 1111',
    'my APR is 6.5%',
    'call me at 555-123-4567',
    'reference 123456789',
  ])('does not flag %s as a Sensitive Signal', (rawText) => {
    expect(sensitiveSignalDetector.detect(rawText)).toBeNull()
  })

  it('returns only reasonCode and signal with no substring or index leak', () => {
    const match = sensitiveSignalDetector.detect('I am calling my attorney')

    expect(match).not.toBeNull()
    if (match === null) return

    expect(Object.keys(match).sort()).toEqual(['reasonCode', 'signal'])
  })

  it('completes without throwing on adversarial digit and separator input', () => {
    expect(() => sensitiveSignalDetector.detect('1234 '.repeat(20000))).not.toThrow()
    expect(() => sensitiveSignalDetector.detect('1'.repeat(100000))).not.toThrow()
    expect(sensitiveSignalDetector.detect('1234 '.repeat(20000))?.signal).toBe(
      'pan_or_ssn',
    )
    expect(sensitiveSignalDetector.detect('1'.repeat(100000))).toBeNull()
  })

  it('supports a classification-free Decision that parses against DecisionSchema', () => {
    const match = sensitiveSignalDetector.detect(
      'I filed a CFPB complaint about misleading rates',
    )
    if (match === null) throw new Error('expected a Sensitive Signal match')

    const intakeId = 'intake-sensitive-signal-1'
    const decision = DecisionSchema.parse({
      intakeId,
      category: 'compliance',
      action: 'route_to_team',
      classificationConfidence: 'unavailable',
      humanApprovalRequired: true,
      reasonCodes: [match.reasonCode],
      draftResponse: null,
      route: {
        destination: 'legal_compliance',
        safeSummary: null,
        flags: [],
        intakeRef: intakeId,
      },
    })

    expect(decision.route?.destination).toBe('legal_compliance')
    expect(decision.reasonCodes).toEqual(['sensitive_signal'])
  })
})
