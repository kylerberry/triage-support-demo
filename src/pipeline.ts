// RFC Layer 1 then classify then policy/veto mapping. Drafting is later.

import { scrubDirectIdentifiers } from './direct-identifiers.js'
import type {
  Classification,
  ClassificationConfidence,
  ModelGateway,
} from './model-gateway.js'
import { categoryPolicies } from './policies.js'
import type { Decision, ReasonCode } from './schemas.js'
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
  readonly decision: Decision
}

export type PipelineResult = PipelineHalted | PipelineContinued

function supportRouteDecision(
  intakeId: string,
  confidence: ClassificationConfidence,
  reasonCodes: readonly ReasonCode[],
): Decision {
  return {
    intakeId,
    category: null,
    action: 'route_to_team',
    classificationConfidence: confidence,
    humanApprovalRequired: true,
    reasonCodes: [...reasonCodes],
    draftResponse: null,
    route: {
      destination: 'support',
      safeSummary: null,
      flags: [],
      intakeRef: intakeId,
    },
  }
}

function mapClassificationToDecision(
  intakeId: string,
  classification: Classification,
): Decision {
  if (classification.veto) {
    return supportRouteDecision(intakeId, classification.confidence, [
      classification.veto,
    ])
  }

  if (classification.confidence !== 'high') {
    return supportRouteDecision(intakeId, classification.confidence, [
      classification.confidence === 'low'
        ? 'low_confidence'
        : 'classification_unavailable',
    ])
  }

  if (classification.category === null) {
    return supportRouteDecision(intakeId, classification.confidence, [
      'classification_unavailable',
    ])
  }

  switch (classification.category) {
    case 'product_feedback': {
      const policy = categoryPolicies.product_feedback
      return {
        intakeId,
        category: 'product_feedback',
        action: policy.action,
        classificationConfidence: 'high',
        humanApprovalRequired: true,
        reasonCodes: ['product_feedback'],
        draftResponse: null,
        route: {
          destination: policy.destination,
          safeSummary: classification.routingSummary ?? null,
          flags: [],
          intakeRef: intakeId,
        },
      }
    }
    case 'compliance': {
      const policy = categoryPolicies.compliance
      return {
        intakeId,
        category: 'compliance',
        action: policy.action,
        classificationConfidence: 'high',
        humanApprovalRequired: true,
        reasonCodes: ['protected_complaint'],
        draftResponse: null,
        route: {
          destination: policy.destination,
          safeSummary: null,
          flags: ['protected_complaint'],
          intakeRef: intakeId,
        },
      }
    }
    case 'general_qa': {
      const policy = categoryPolicies.general_qa
      return {
        intakeId,
        category: 'general_qa',
        action: policy.action,
        classificationConfidence: 'high',
        humanApprovalRequired: true,
        reasonCodes: [],
        draftResponse: null,
        route: null,
      }
    }
  }
}

export async function runPipeline(
  rawText: string,
  intakeId: string,
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
    decision: mapClassificationToDecision(intakeId, classification),
  }
}
