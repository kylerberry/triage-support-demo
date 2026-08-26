import type { KnowledgeSource } from './knowledge-base.js'
import type { Decision } from './schemas.js'

export type TriageCategory = NonNullable<Decision['category']>
export type ClassificationConfidence = Decision['classificationConfidence']
export type DraftResolution = NonNullable<Decision['draftResponse']>

export type ClassifyInput = {
  readonly text: string
}

export type Classification = {
  readonly category: TriageCategory
  readonly confidence: ClassificationConfidence
  readonly routingSummary?: string
}

export type DraftResolutionInput = {
  readonly text: string
  readonly sources: readonly KnowledgeSource[]
}

export interface ModelGateway {
  classify(input: ClassifyInput): Promise<Classification>
  draftResolution(input: DraftResolutionInput): Promise<DraftResolution>
}

export class ModelGatewayError extends Error {
  constructor(message = 'fake model gateway failure') {
    super(message)
    this.name = 'ModelGatewayError'
  }
}

export class ModelGatewayTimeoutError extends ModelGatewayError {
  constructor(message = 'fake model gateway timeout') {
    super(message)
    this.name = 'ModelGatewayTimeoutError'
  }
}

type OperationFailure = 'ok' | 'timeout' | 'throw'

type ClassifyConfig = {
  readonly result?: Classification
  readonly failure?: OperationFailure
  readonly timeoutMs?: number
}

type DraftResolutionConfig = {
  readonly result?: DraftResolution
  readonly failure?: OperationFailure
  readonly timeoutMs?: number
}

export type FakeModelGatewayConfig = {
  readonly classify?: ClassifyConfig
  readonly draftResolution?: DraftResolutionConfig
}

const defaultClassification: Classification = {
  category: 'general_qa',
  confidence: 'high',
}

function draftFromSources(sources: readonly KnowledgeSource[]): DraftResolution {
  return {
    text:
      sources.map((source) => source.excerpt).join(' ') ||
      'No approved sources were provided.',
    citations: sources.map((source) => source.citationId),
  }
}

export class FakeModelGateway implements ModelGateway {
  readonly #classifyConfig: ClassifyConfig
  readonly #draftResolutionConfig: DraftResolutionConfig
  readonly #classifyCalls: ClassifyInput[] = []
  readonly #draftResolutionCalls: DraftResolutionInput[] = []

  constructor(config: FakeModelGatewayConfig = {}) {
    this.#classifyConfig = config.classify ?? {}
    this.#draftResolutionConfig = config.draftResolution ?? {}
  }

  get classifyCalls(): readonly ClassifyInput[] {
    return this.#classifyCalls
  }

  get draftResolutionCalls(): readonly DraftResolutionInput[] {
    return this.#draftResolutionCalls
  }

  async classify(input: ClassifyInput): Promise<Classification> {
    this.#classifyCalls.push({ text: input.text })
    await this.#applyFailure(this.#classifyConfig)
    return { ...(this.#classifyConfig.result ?? defaultClassification) }
  }

  async draftResolution(
    input: DraftResolutionInput,
  ): Promise<DraftResolution> {
    this.#draftResolutionCalls.push({
      text: input.text,
      sources: [...input.sources],
    })
    await this.#applyFailure(this.#draftResolutionConfig)
    const configured = this.#draftResolutionConfig.result
    if (configured) return { ...configured }
    return draftFromSources(input.sources)
  }

  async #applyFailure(config: {
    readonly failure?: OperationFailure
    readonly timeoutMs?: number
  }): Promise<void> {
    switch (config.failure) {
      case 'timeout':
        await new Promise<never>((_, reject) => {
          setTimeout(
            () => reject(new ModelGatewayTimeoutError()),
            config.timeoutMs ?? 5,
          )
        })
        return
      case 'throw':
        throw new ModelGatewayError()
      default:
        return
    }
  }
}
