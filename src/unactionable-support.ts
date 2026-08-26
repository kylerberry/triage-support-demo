/**
 * Fixture-backed Support guards for un-actionable Intakes per RFC
 * "Support, no draft (and no classify when the guard is deterministic)".
 *
 * Missing information, out-of-scope, and mixed-intent matches route to
 * Support without classification. Phrase families are evaluated in RFC
 * guard order; the first match wins. Eligible how-tos with no extra intent
 * are not matches. Fixtures are synthetic only.
 */
import type { ReasonCode } from './schemas.js'

export type UnactionableSupportMatch = {
  readonly destination: 'support'
  readonly reasonCode: Extract<
    ReasonCode,
    'insufficient_information' | 'out_of_scope' | 'mixed_intent'
  >
}

const howToMarkers = ['how do i', 'how can i', 'how to'] as const
const objectPronouns = ['it', 'them', 'that'] as const
const outOfScopePhrases = [
  'chase',
  'citi',
  'amex',
  'nerdwallet',
  'wells fargo',
  'capital one',
  'credit karma',
  'lending tree',
  'weather',
  'flight',
  'hotel',
  'printer',
  'write my appeal',
  'write my letter',
  'write me a',
  'draft my',
] as const
const questionMarkers = [...howToMarkers, 'what does'] as const
const extraIntentPhrases = [
  'you should add',
  'please add',
  'feature request',
  'always broken',
  'never load',
  'frustrating',
  'unacceptable',
] as const

function tokensOf(normalized: string): Set<string> {
  return new Set(normalized.split(/[^a-z0-9]+/).filter(Boolean))
}

function hasPhrase(
  normalized: string,
  tokens: Set<string>,
  phrase: string,
): boolean {
  if (phrase.includes(' ')) {
    return normalized.includes(phrase)
  }
  return tokens.has(phrase)
}

function hasAny(
  normalized: string,
  tokens: Set<string>,
  phrases: readonly string[],
): boolean {
  return phrases.some((phrase) => hasPhrase(normalized, tokens, phrase))
}

function support(
  reasonCode: UnactionableSupportMatch['reasonCode'],
): UnactionableSupportMatch {
  return { destination: 'support', reasonCode }
}

export class UnactionableSupportDetector {
  detect(text: string): UnactionableSupportMatch | null {
    const normalized = text.trim().toLowerCase()
    const tokens = tokensOf(normalized)

    if (normalized === '' || tokens.size === 1) {
      return support('insufficient_information')
    }

    if (
      hasAny(normalized, tokens, howToMarkers) &&
      hasAny(normalized, tokens, objectPronouns)
    ) {
      return support('insufficient_information')
    }

    if (hasAny(normalized, tokens, outOfScopePhrases)) {
      return support('out_of_scope')
    }

    if (
      hasAny(normalized, tokens, questionMarkers) &&
      hasAny(normalized, tokens, extraIntentPhrases)
    ) {
      return support('mixed_intent')
    }

    return null
  }
}

export const unactionableSupportDetector = new UnactionableSupportDetector()
