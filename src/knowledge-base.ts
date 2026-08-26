export type KnowledgeSource = {
  readonly citationId: string
  readonly excerpt: string
}

const articles = [
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
] as const satisfies readonly KnowledgeSource[]

const stopwords = new Set([
  'a',
  'an',
  'and',
  'can',
  'do',
  'does',
  'how',
  'i',
  'my',
  'the',
  'to',
  'up',
  'what',
])

function terms(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((term) => term.length > 0 && !stopwords.has(term)),
  )
}

const indexedArticles = articles.map((article) => ({
  article,
  terms: terms(article.excerpt),
}))

export class KnowledgeBase {
  find(query: string): readonly KnowledgeSource[] {
    const queryTerms = terms(query)

    if (queryTerms.size === 0) return []

    return indexedArticles
      .filter(({ terms: articleTerms }) =>
        [...queryTerms].some((term) => articleTerms.has(term)),
      )
      .map(({ article }) => ({
        citationId: article.citationId,
        excerpt: article.excerpt,
      }))
  }
}

export const knowledgeBase = new KnowledgeBase()
