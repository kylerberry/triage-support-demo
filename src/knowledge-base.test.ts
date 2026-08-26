import { describe, expect, it } from 'vitest'

import { knowledgeBase } from './knowledge-base.js'

const approvedSources = [
  {
    citationId: 'kb.password-reset.v1',
    excerpt:
      'To reset a password, open the sign-in page, choose Forgot password, and follow the link sent to the email address on the account.',
  },
  {
    citationId: 'kb.apr-meaning.v1',
    excerpt:
      'Annual percentage rate (APR) expresses the yearly cost of borrowing as a percentage and can include interest plus certain fees.',
  },
  {
    citationId: 'kb.rate-alert-setup.v1',
    excerpt:
      'To set up a rate alert, save a rate search, choose Create alert, select a notification frequency, and confirm the alert.',
  },
  {
    citationId: 'kb.saved-comparisons-export.v1',
    excerpt:
      'To export saved comparisons, open Saved comparisons, choose Export, and download the generated file.',
  },
] as const

describe('knowledgeBase', () => {
  it.each([
    ['How do I reset my password?', 'kb.password-reset.v1'],
    ['What does APR mean?', 'kb.apr-meaning.v1'],
    ['How do I set up a rate-alert?', 'kb.rate-alert-setup.v1'],
    [
      'How can I export my saved comparisons?',
      'kb.saved-comparisons-export.v1',
    ],
  ])('grounds the eligible query %s', (query, citationId) => {
    const sources = knowledgeBase.find(query)

    expect(sources.length).toBeGreaterThan(0)
    expect(sources.map((source) => source.citationId)).toContain(citationId)
  })

  it('returns no sources when meaningful terms do not overlap', () => {
    expect(knowledgeBase.find('giraffe telescope umbrella')).toEqual([])
  })

  it('does not match queries containing only stopwords', () => {
    expect(knowledgeBase.find('how do i the and what does')).toEqual([])
  })

  it('returns only stable ids and verbatim approved fixture excerpts', () => {
    const sources = knowledgeBase.find('password APR alert comparisons')
    const approvedExcerpts = new Set<string>(
      approvedSources.map((source) => source.excerpt),
    )

    expect(sources).toStrictEqual(approvedSources)
    expect(new Set(sources.map((source) => source.citationId)).size).toBe(
      sources.length,
    )
    for (const source of sources) {
      expect(Object.keys(source).sort()).toEqual(['citationId', 'excerpt'])
      expect(approvedExcerpts.has(source.excerpt)).toBe(true)
    }
  })
})
