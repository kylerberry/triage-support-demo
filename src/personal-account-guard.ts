/**
 * Fixture-backed Support guards for personal-account Intakes per RFC
 * "Support, no draft (and no classify when the guard is deterministic)".
 *
 * Phrase families are evaluated in RFC guard order; the first match wins.
 * APR-definition how-tos are not personal-record lookups. Fixtures are
 * synthetic only.
 */
import type { ReasonCode } from './schemas.js'

export type PersonalAccountGuardMatch = {
  readonly destination: 'support'
  readonly reasonCode: Extract<
    ReasonCode,
    'advice_request' | 'account_record_lookup' | 'account_mutation'
  >
  readonly shouldClassify: false
}

type PhraseFamily = {
  readonly reasonCode: PersonalAccountGuardMatch['reasonCode']
  readonly phrases: readonly string[]
}

const phraseFamilies = [
  {
    reasonCode: 'advice_request',
    phrases: [
      'should i refinance',
      'which card should i get',
      'is this a good rate for me',
    ],
  },
  {
    reasonCode: 'account_record_lookup',
    phrases: [
      'what is my apr',
      'where is my application',
      'what is the status of my application',
    ],
  },
  {
    reasonCode: 'account_mutation',
    phrases: ['change my email', 'delete my saved card'],
  },
] as const satisfies readonly PhraseFamily[]

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

export function detectPersonalAccountGuard(
  text: string,
): PersonalAccountGuardMatch | null {
  const normalized = normalize(text)
  if (normalized.length === 0) return null

  for (const family of phraseFamilies) {
    if (!family.phrases.some((phrase) => normalized.includes(phrase))) {
      continue
    }

    return {
      destination: 'support',
      reasonCode: family.reasonCode,
      shouldClassify: false,
    }
  }

  return null
}
