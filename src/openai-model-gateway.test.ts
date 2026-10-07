import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

import type { KnowledgeSource } from './knowledge-base.js'
import {
  ModelGatewayError,
  ModelGatewayTimeoutError,
} from './model-gateway.js'
import { OpenAIModelGateway } from './openai-model-gateway.js'

const apiKey = 'test-key'
const passwordResetSource: KnowledgeSource = {
  citationId: 'kb.password-reset.v1',
  excerpt:
    'To reset a password, open the sign-in page, choose Forgot password, and follow the link sent to the email address on the account.',
}

function mockFetchResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function chatCompletion(content: string) {
  return {
    choices: [{ message: { content } }],
  }
}

const originalFetch = globalThis.fetch

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  vi.restoreAllMocks()
  globalThis.fetch = originalFetch
})

describe('OpenAIModelGateway.classify', () => {
  it('sends a structured classify request and maps the response', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      mockFetchResponse(
        chatCompletion(
          JSON.stringify({
            category: 'general_qa',
            confidence: 'high',
            veto: null,
            routingSummary: null,
          }),
        ),
      ),
    )

    const gateway = new OpenAIModelGateway({ apiKey, timeoutMs: 500 })
    const result = await gateway.classify({ text: 'How do I reset my password?' })

    expect(result).toEqual({
      category: 'general_qa',
      confidence: 'high',
    })

    const call = vi.mocked(globalThis.fetch).mock.calls[0]
    const reqBody = JSON.parse((call?.[1]?.body as string) ?? '{}')
    expect(reqBody['response_format']).toEqual({ type: 'json_object' })
    expect(reqBody['temperature']).toBe(0)
    expect(reqBody['model']).toBe('gpt-4o')

    const headers = call?.[1]?.headers as Record<string, string>
    expect(headers['Authorization']).toBe(`Bearer ${apiKey}`)

    const messages = reqBody['messages'] as ReadonlyArray<{
      role: string
      content: string
    }>
    expect(messages[0]?.['role']).toBe('system')
    expect(messages[1]?.['role']).toBe('user')
    expect(messages[1]?.['content']).toBe('How do I reset my password?')
  })

  it('maps a veto response correctly', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      mockFetchResponse(
        chatCompletion(
          JSON.stringify({
            category: null,
            confidence: 'high',
            veto: 'advice_request',
            routingSummary: null,
          }),
        ),
      ),
    )

    const gateway = new OpenAIModelGateway({ apiKey, timeoutMs: 500 })
    const result = await gateway.classify({ text: 'Should I refinance?' })

    expect(result).toEqual({
      category: null,
      confidence: 'high',
      veto: 'advice_request',
    })
  })

  it('maps a product_feedback response with routing summary', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      mockFetchResponse(
        chatCompletion(
          JSON.stringify({
            category: 'product_feedback',
            confidence: 'high',
            veto: null,
            routingSummary: 'Member wants a darker theme',
          }),
        ),
      ),
    )

    const gateway = new OpenAIModelGateway({ apiKey, timeoutMs: 500 })
    const result = await gateway.classify({
      text: 'Please add dark mode to the app.',
    })

    expect(result).toEqual({
      category: 'product_feedback',
      confidence: 'high',
      routingSummary: 'Member wants a darker theme',
    })
  })

  it('defaults invalid fields to safe values', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      mockFetchResponse(
        chatCompletion(
          JSON.stringify({
            category: 'not_a_real_category',
            confidence: 'maybe',
            veto: 'not_a_veto',
            routingSummary: 42,
          }),
        ),
      ),
    )

    const gateway = new OpenAIModelGateway({ apiKey, timeoutMs: 500 })
    const result = await gateway.classify({ text: 'gibberish' })

    expect(result).toEqual({
      category: null,
      confidence: 'unavailable',
    })
  })

  it('throws ModelGatewayError on non-200 status', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      mockFetchResponse({ error: 'rate limited' }, 429),
    )

    const gateway = new OpenAIModelGateway({ apiKey, timeoutMs: 500 })
    await expect(
      gateway.classify({ text: 'How do I reset my password?' }),
    ).rejects.toBeInstanceOf(ModelGatewayError)
  })

  it('throws ModelGatewayError on invalid JSON content', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      mockFetchResponse(chatCompletion('not json')),
    )

    const gateway = new OpenAIModelGateway({ apiKey, timeoutMs: 500 })
    await expect(
      gateway.classify({ text: 'How do I reset my password?' }),
    ).rejects.toBeInstanceOf(ModelGatewayError)
  })

  it('throws ModelGatewayError when no message content is returned', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      mockFetchResponse({ choices: [] }),
    )

    const gateway = new OpenAIModelGateway({ apiKey, timeoutMs: 500 })
    await expect(
      gateway.classify({ text: 'How do I reset my password?' }),
    ).rejects.toBeInstanceOf(ModelGatewayError)
  })

  it('throws ModelGatewayError on network failure', async () => {
    vi.mocked(globalThis.fetch).mockRejectedValueOnce(
      new Error('connection refused'),
    )

    const gateway = new OpenAIModelGateway({ apiKey, timeoutMs: 500 })
    await expect(
      gateway.classify({ text: 'How do I reset my password?' }),
    ).rejects.toBeInstanceOf(ModelGatewayError)
  })
})

describe('OpenAIModelGateway.draftResolution', () => {
  it('sends sources and maps the draft response', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      mockFetchResponse(
        chatCompletion(
          JSON.stringify({
            text: 'To reset your password, use the Forgot password link.',
            citations: ['kb.password-reset.v1'],
          }),
        ),
      ),
    )

    const gateway = new OpenAIModelGateway({ apiKey, timeoutMs: 500 })
    const result = await gateway.draftResolution({
      text: 'How do I reset my password?',
      sources: [passwordResetSource],
    })

    expect(result.text).toBe(
      'To reset your password, use the Forgot password link.',
    )
    expect(result.citations).toEqual(['kb.password-reset.v1'])

    const call = vi.mocked(globalThis.fetch).mock.calls[0]
    const reqBody = JSON.parse((call?.[1]?.body as string) ?? '{}')
    const userMessage = (reqBody['messages'] as ReadonlyArray<{ content: string }>)[1]
    expect(userMessage['content']).toContain('kb.password-reset.v1')
    expect(userMessage['content']).toContain('To reset a password')
    expect(userMessage['content']).toContain('How do I reset my password?')
  })

  it('falls back to all source citation IDs when model returns invalid citations', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      mockFetchResponse(
        chatCompletion(
          JSON.stringify({
            text: 'Reset via sign-in page.',
            citations: 'not-an-array',
          }),
        ),
      ),
    )

    const gateway = new OpenAIModelGateway({ apiKey, timeoutMs: 500 })
    const result = await gateway.draftResolution({
      text: 'How do I reset my password?',
      sources: [passwordResetSource],
    })

    expect(result.citations).toEqual(['kb.password-reset.v1'])
    expect(result.text).toBe('Reset via sign-in page.')
  })
})

describe('OpenAIModelGateway error mapping', () => {
  it('abort signal triggers ModelGatewayTimeoutError', async () => {
    vi.mocked(globalThis.fetch).mockImplementationOnce(
      (_url: string | URL | Request, init?: RequestInit) => {
        return new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const err = new Error('aborted')
            err.name = 'AbortError'
            reject(err)
          })
        })
      },
    )

    const gateway = new OpenAIModelGateway({ apiKey, timeoutMs: 5 })
    await expect(
      gateway.classify({ text: 'How do I reset my password?' }),
    ).rejects.toBeInstanceOf(ModelGatewayTimeoutError)
  })
})
