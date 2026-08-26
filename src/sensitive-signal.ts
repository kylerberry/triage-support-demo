/**
 * Fixture-backed Sensitive Signal detection per RFC
 * "Sensitive Signal → Legal & Compliance, no model".
 *
 * Runs on the raw Intake before Direct Identifier scrub and before any model
 * call; a match routes to Legal & Compliance without classification. Full
 * payment-card and SSN-like values are owned by this detector, so the
 * sensitive path wins over scrub. The ASCII-digit shape assumption is shared
 * with the scrub fixtures. Fixtures are synthetic only.
 */
export type SensitiveSignalKind =
  | 'regulator_legal'
  | 'fraud'
  | 'privacy_rights'
  | 'discrimination'
  | 'pan_or_ssn'

export type SensitiveSignalMatch = {
  readonly reasonCode: 'sensitive_signal'
  readonly signal: SensitiveSignalKind
}

type PhraseFamily = {
  readonly signal: Exclude<SensitiveSignalKind, 'pan_or_ssn'>
  readonly phrases: readonly string[]
}

/**
 * Phrase families are evaluated in this declared order and the first match
 * wins: regulator_legal → fraud → privacy_rights → discrimination. The
 * pan_or_ssn family is regex-only, so it cannot appear here.
 */
const phraseFamilies = [
  {
    signal: 'regulator_legal',
    phrases: [
      'cfpb',
      'tila',
      'lawsuit',
      'attorney',
      'misleading rates',
      'legal claim',
    ],
  },
  {
    signal: 'fraud',
    phrases: [
      'fraud',
      'identity theft',
      'unauthorized access',
      'unauthorized charges',
    ],
  },
  {
    signal: 'privacy_rights',
    phrases: ['delete my data', 'ccpa', 'gdpr'],
  },
  {
    signal: 'discrimination',
    phrases: ['discrimination', 'protected class', 'fair lending'],
  },
] as const satisfies readonly PhraseFamily[]

/** Full 16-digit payment-card values in 4-4-4-4 groupings. */
const PAN_PATTERN = /\b(?:\d{4}[- ]?){3}\d{4}\b/

/** Full SSN-like values in 3-2-4 dashed form; phone-style 3-3-4 numbers do not match. */
const SSN_PATTERN = /\b\d{3}-\d{2}-\d{4}\b/

export class SensitiveSignalDetector {
  detect(rawText: string): SensitiveSignalMatch | null {
    // Phrases are matched by literal substring comparison on lowercased
    // text, not a regex-joined pattern, so fixtures stay free of regex
    // metacharacter risk.
    const normalized = rawText.toLowerCase()

    for (const family of phraseFamilies) {
      if (family.phrases.some((phrase) => normalized.includes(phrase))) {
        return { reasonCode: 'sensitive_signal', signal: family.signal }
      }
    }

    if (PAN_PATTERN.test(normalized) || SSN_PATTERN.test(normalized)) {
      return { reasonCode: 'sensitive_signal', signal: 'pan_or_ssn' }
    }

    return null
  }
}

export const sensitiveSignalDetector = new SensitiveSignalDetector()
