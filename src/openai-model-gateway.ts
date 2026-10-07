// Real ModelGateway adapter backed by the OpenAI Chat Completions API.
// Uses response_format json_object for structured classify/draft output.
// Network errors and non-200 responses throw ModelGatewayError; the
// pipeline's callGuarded wrapper maps those to dependency_failed and
// timeouts to deadline_exceeded. The adapter never receives memberRef
// or claims — only the sanitized Intake text and, for drafting, retrieved
// source excerpts.

import type { KnowledgeSource } from './knowledge-base.js'
import {
  FakeModelGateway,
  ModelGatewayError,
  ModelGatewayTimeoutError,
  type Classification,
  type ClassifyInput,
  type DraftResolution,
  type DraftResolutionInput,
  type ModelGateway,
  type SupportVetoClass,
  type TriageCategory,
} from './model-gateway.js'

type OpenAIConfig = {
  readonly apiKey: string
  readonly model?: string
  readonly baseUrl?: string
  readonly timeoutMs?: number
}

const DEFAULT_MODEL = 'gpt-4o'
const DEFAULT_BASE_URL = 'https://api.openai.com/v1'
const DEFAULT_TIMEOUT_MS = 5000

const VALID_CATEGORIES: readonly TriageCategory[] = [
  'general_qa',
  'product_feedback',
  'compliance',
]

const VALID_VETOS: readonly SupportVetoClass[] = [
  'advice_request',
  'account_record_lookup',
  'account_mutation',
  'insufficient_information',
  'out_of_scope',
  'mixed_intent',
]

const VALID_CONFIDENCES = ['high', 'low', 'unavailable'] as const

const CLASSIFY_SYSTEM_PROMPT = `You are a triage classifier for a financial-services support system.
Read the member's support request and classify it.

Return JSON with exactly these fields:
- "category": one of "general_qa", "product_feedback", "compliance", or null
- "confidence": one of "high", "low", "unavailable"
- "veto": one of "advice_request", "account_record_lookup", "account_mutation", "insufficient_information", "out_of_scope", "mixed_intent", or null
- "routingSummary": a short sanitized summary string, or null (only for product_feedback)

Rules:
- If the request asks for personalized advice ("should I refinance?", "which card should I get?"), set veto to "advice_request".
- If the request asks for the member's own account data ("what is my APR?", "where is my application?"), set veto to "account_record_lookup".
- If the request asks to change account data ("change my email", "delete my saved card"), set veto to "account_mutation".
- If the request is too vague or missing information ("how do I update it?"), set veto to "insufficient_information".
- If the request is about a competitor or not related to Bankrate, set veto to "out_of_scope".
- If the request mixes multiple intents (a how-to plus a product suggestion), set veto to "mixed_intent".
- A help-center how-to (password reset, APR definition, rate-alert setup, export comparisons) is "general_qa" with no veto.
- A product suggestion or feedback is "product_feedback" with no veto and a routingSummary.
- A compliance or legal complaint is "compliance" with no veto.
- When veto is set, category should be null.
- When category is set, veto should be null.`

const DRAFT_SYSTEM_PROMPT = `You are a support response drafter for a financial-services help center.
Read the member's question and the approved source excerpts provided.
Draft a helpful response that is grounded strictly in the provided sources.

Return JSON with exactly these fields:
- "text": the draft response text
- "citations": an array of citation IDs from the provided sources (only use IDs that appear in the sources)

Rules:
- Only cite sources that were provided to you. Never invent citations.
- Keep the response concise and directly answer the question.
- Do not provide personalized financial advice.`

type ChatCompletionResponse = {
  choices: ReadonlyArray<{
    readonly message: { readonly content: string }
  }>
}

async function callOpenAI(
  config: Required<OpenAIConfig>,
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(
    () => controller.abort(),
    config.timeoutMs,
  )

  let res: Response
  try {
    res = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0,
      }),
      signal: controller.signal,
    })
  } catch (error: unknown) {
    clearTimeout(timer)
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ModelGatewayTimeoutError('openai request timed out')
    }
    throw new ModelGatewayError(
      `openai network error: ${error instanceof Error ? error.message : 'unknown'}`,
    )
  }
  clearTimeout(timer)

  if (!res.ok) {
    throw new ModelGatewayError(`openai returned status ${res.status}`)
  }

  let body: ChatCompletionResponse
  try {
    body = (await res.json()) as ChatCompletionResponse
  } catch {
    throw new ModelGatewayError('openai returned non-JSON body')
  }

  const content = body.choices?.[0]?.message?.content
  if (typeof content !== 'string') {
    throw new ModelGatewayError('openai returned no message content')
  }
  return content
}

function parseJsonContent(content: string): Record<string, unknown> {
  try {
    return JSON.parse(content) as Record<string, unknown>
  } catch {
    throw new ModelGatewayError('openai returned invalid JSON in message content')
  }
}

function classifyResultFromJson(json: Record<string, unknown>): Classification {
  const rawCategory = json['category']
  const rawConfidence = json['confidence']
  const rawVeto = json['veto']
  const rawRoutingSummary = json['routingSummary']

  const category =
    typeof rawCategory === 'string' && VALID_CATEGORIES.includes(rawCategory as TriageCategory)
      ? (rawCategory as TriageCategory)
      : null

  const confidence =
    typeof rawConfidence === 'string' &&
    VALID_CONFIDENCES.includes(rawConfidence as (typeof VALID_CONFIDENCES)[number])
      ? (rawConfidence as Classification['confidence'])
      : 'unavailable'

  const veto =
    typeof rawVeto === 'string' &&
    rawVeto !== 'null' &&
    VALID_VETOS.includes(rawVeto as SupportVetoClass)
      ? (rawVeto as SupportVetoClass)
      : undefined

  const routingSummary =
    typeof rawRoutingSummary === 'string' && rawRoutingSummary !== 'null'
      ? rawRoutingSummary
      : undefined

  return { category, confidence, ...(veto ? { veto } : {}), ...(routingSummary ? { routingSummary } : {}) }
}

function draftResultFromJson(
  json: Record<string, unknown>,
  sourceIds: readonly string[],
): DraftResolution {
  const rawText = json['text']
  const rawCitations = json['citations']

  const text = typeof rawText === 'string' ? rawText : ''
  const citations =
    Array.isArray(rawCitations) &&
    rawCitations.every((c) => typeof c === 'string')
      ? [...(rawCitations as string[])]
      : [...sourceIds]

  return { text, citations }
}

export class OpenAIModelGateway implements ModelGateway {
  readonly #config: Required<OpenAIConfig>

  constructor(config: OpenAIConfig) {
    this.#config = {
      apiKey: config.apiKey,
      model: config.model ?? DEFAULT_MODEL,
      baseUrl: config.baseUrl ?? DEFAULT_BASE_URL,
      timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    }
  }

  async classify(input: ClassifyInput): Promise<Classification> {
    const content = await callOpenAI(
      this.#config,
      CLASSIFY_SYSTEM_PROMPT,
      input.text,
    )
    const json = parseJsonContent(content)
    return classifyResultFromJson(json)
  }

  async draftResolution(
    input: DraftResolutionInput,
  ): Promise<DraftResolution> {
    const sourceBlock = input.sources
      .map(
        (source: KnowledgeSource) =>
          `[${source.citationId}] ${source.excerpt}`,
      )
      .join('\n\n')

    const userPrompt = `Member question: ${input.text}\n\nApproved sources:\n${sourceBlock}`
    const content = await callOpenAI(
      this.#config,
      DRAFT_SYSTEM_PROMPT,
      userPrompt,
    )
    const json = parseJsonContent(content)
    return draftResultFromJson(
      json,
      input.sources.map((s) => s.citationId),
    )
  }
}

/**
 * Creates a real OpenAI-backed gateway when OPENAI_API_KEY is set.
 * Falls back to FakeModelGateway when the key is absent so CI and
 * the scenario runner continue to work without a live provider.
 */
export function createGatewayFromEnv(): ModelGateway {
  const apiKey = process.env['OPENAI_API_KEY']
  if (apiKey && apiKey.length > 0) {
    return new OpenAIModelGateway({
      apiKey,
      model: process.env['OPENAI_MODEL'],
      baseUrl: process.env['OPENAI_BASE_URL'],
      timeoutMs: process.env['OPENAI_TIMEOUT_MS']
        ? Number(process.env['OPENAI_TIMEOUT_MS'])
        : undefined,
    })
  }
  // Lazy import to avoid a circular dependency at module load time.
  // FakeModelGateway is the CI default; the real adapter is opt-in.
  return new FakeModelGateway()
}
