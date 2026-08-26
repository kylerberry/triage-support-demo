// RFC guard: Direct Identifier → scrub, then continue.
// Full SSN-like and payment-card values belong to the Sensitive Signal
// detector, which runs on the raw Intake before this module.

const EMAIL_PATTERN = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g
const PHONE_PATTERN =
  /(?<!\d)(?:\+?1[ .-])?(?:\(\d{3}\)[ .-]?|\d{3}[ .-])\d{3}[ .-]\d{4}(?!\d)/g
const ACCOUNT_NUMBER_PATTERN = /(?<!\d)\d{10,17}(?!\d)/g

export function scrubDirectIdentifiers(text: string): string {
  return text
    .replace(EMAIL_PATTERN, '[email]')
    .replace(PHONE_PATTERN, '[phone]')
    .replace(ACCOUNT_NUMBER_PATTERN, '[account-number]')
}
