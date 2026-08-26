// RFC Layer 1 then classify. Classification is not mapped to a Decision here.

import { scrubDirectIdentifiers } from './direct-identifiers.js'
import type { Classification, ModelGateway } from './model-gateway.js'
import {
  sensitiveSignalDetector,
  type SensitiveSignalMatch,
} from './sensitive-signal.js'

export type PipelineHalted =
  | {
      readonly status: 'halted'
      readonly reason: 'sensitive_signal'
      readonly match: SensitiveSignalMatch
    }
  | {
      readonly status: 'halted'
      readonly reason: 'insufficient_information'
    }

export type PipelineContinued = {
  readonly status: 'continued'
  readonly sanitizedText: string
  readonly classification: Classification
  readonly directIdentifiersReplaced: boolean
}

export type PipelineResult = PipelineHalted | PipelineContinued

export async function runPipeline(
  rawText: string,
  gateway: ModelGateway,
): Promise<PipelineResult> {
  const match = sensitiveSignalDetector.detect(rawText)
  if (match) {
    return { status: 'halted', reason: 'sensitive_signal', match }
  }

  if (rawText.trim() === '') {
    return { status: 'halted', reason: 'insufficient_information' }
  }

  const sanitizedText = scrubDirectIdentifiers(rawText)
  const classification = await gateway.classify({ text: sanitizedText })
  return {
    status: 'continued',
    sanitizedText,
    classification,
    directIdentifiersReplaced: sanitizedText !== rawText,
  }
}
