import { describe, expect, it } from 'vitest'
import { scrubDirectIdentifiers } from './direct-identifiers.js'

describe('scrubDirectIdentifiers', () => {
  it.each([
    ['reach ops@corp.io today', 'reach [email] today'],
    ['John.Smith@Example.COM', '[email]'],
    ['support+tag@bank.example.co', '[email]'],
    ['Email a@x.com or b@y.org please', 'Email [email] or [email] please'],
  ])('replaces the email in %s', (text, expected) => {
    expect(scrubDirectIdentifiers(text)).toBe(expected)
  })

  it.each([
    ['Call 555-123-4567 now', 'Call [phone] now'],
    ['Call (415) 555-0132 now', 'Call [phone] now'],
    ['Call 555.123.4567 now', 'Call [phone] now'],
    ['Call 555-123.4567 now', 'Call [phone] now'],
    ['Call +1 415-555-0132 now', 'Call [phone] now'],
    ['Call 1-555-123-4567 now', 'Call [phone] now'],
    ['Call (555)123-4567 now', 'Call [phone] now'],
  ])('replaces the phone in %s', (text, expected) => {
    expect(scrubDirectIdentifiers(text)).toBe(expected)
  })

  it.each([
    ['account 0123456789', 'account [account-number]'],
    ['Acct #4411223344', 'Acct #[account-number]'],
    ['4155550132', '[account-number]'],
    ['ACME5551234567Z', 'ACME[account-number]Z'],
    ['id_0123456789_end', 'id_[account-number]_end'],
    ['12345678901234567', '[account-number]'],
  ])('replaces the account-number-like run in %s', (text, expected) => {
    expect(scrubDirectIdentifiers(text)).toBe(expected)
  })

  it('replaces every identifier kind in one call and keeps the remainder verbatim', () => {
    expect(
      scrubDirectIdentifiers(
        'John.Smith@Example.COM called (415) 555-0132 about Acct #4411223344 yesterday',
      ),
    ).toBe('[email] called [phone] about Acct #[account-number] yesterday')
  })

  it.each([
    'How do I reset my password?',
    'What does APR mean?',
    'How do I set up a rate-alert?',
    'How can I export my saved comparisons?',
    '123-45-6789',
    '4111 1111 1111 1111',
    '123456789',
    '987654321098765432',
  ])('leaves %s unchanged', (text) => {
    expect(scrubDirectIdentifiers(text)).toBe(text)
  })

  it('returns the same result on repeated calls', () => {
    const text =
      'Email ops@corp.io or call 555-123-4567 about account 0123456789.'
    expect(scrubDirectIdentifiers(text)).toBe(scrubDirectIdentifiers(text))
  })
})
