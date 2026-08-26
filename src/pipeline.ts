// RFC Layer 1 then classify then policy or grounded draft. Layer 1 halt is
// not a Decision here. High general_qa drafts only from retrieved sources.
// Malformed draft payloads and citations outside that set fail closed as
// citation_invalid. KnowledgeBase, classify, and draftResolution fail closed:
// timeout is deadline_exceeded; exception or open circuit is dependency_failed.

import {
  callGuarded,
  DependencyCircuits,
} from './dependency-guard.js'
import { scrubDirectIdentifiers } from './direct-identifiers.js'
import { knowledgeBase, type KnowledgeSource } from './knowledge-base.js'
import type {
  Classification,
  ClassificationConfidence,
  ModelGateway,
} from './model-gateway.js'
import { categoryPolicies } from './policies.js'
import { DraftResponseSchema, type Decision, type ReasonCode } from './schemas.js'
import {
  sensitiveSignalDetector,
  type SensitiveSignalMatch,
} from './sensitive-signal.js'

export type KnowledgeLookup = {
  find(
    query: string,
  ): readonly KnowledgeSource[] | Promise<readonly KnowledgeSource[]>
}

export type PipelineDeps = {
  readonly knowledge?: KnowledgeLookup
  readonly circuits?: DependencyCircuits
  readonly timeoutMs?: number
}

type DependencyContext = {
  readonly gateway: ModelGateway
  readonly knowledge: KnowledgeLookup
  readonly circuits: DependencyCircuits
  readonly timeoutMs: number
}

const defaultCircuits = new DependencyCircuits()
const defaultTimeoutMs = 1000
const unavailableClassification: Classification = {
  category: null,
  confidence: 'unavailable',
}

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

async function groundedGeneralQaDecision(
  intakeId: string,
  sanitizedText: string,
  deps: DependencyContext,
): Promise<Decision> {
  const found = await callGuarded(
    deps.circuits,
    'knowledge_base',
    deps.timeoutMs,
    async () => deps.knowledge.find(sanitizedText),
  )
  if (!found.ok) {
    return supportRouteDecision(intakeId, 'high', [found.reason])
  }

  const sources = found.value
  if (sources.length === 0) {
    return supportRouteDecision(intakeId, 'high', ['no_knowledge_sources'])
  }

  const drafted = await callGuarded(
    deps.circuits,
    'draft_resolution',
    deps.timeoutMs,
    () => deps.gateway.draftResolution({ text: sanitizedText, sources }),
  )
  if (!drafted.ok) {
    return supportRouteDecision(intakeId, 'high', [drafted.reason])
  }

  const parsed = DraftResponseSchema.safeParse(drafted.value)
  const retrieved = new Set(sources.map((source) => source.citationId))
  if (
    !parsed.success ||
    !parsed.data.citations.every((citationId) => retrieved.has(citationId))
  ) {
    return supportRouteDecision(intakeId, 'high', ['citation_invalid'])
  }
  const draft = parsed.data

  return {
    intakeId,
    category: 'general_qa',
    action: categoryPolicies.general_qa.action,
    classificationConfidence: 'high',
    humanApprovalRequired: true,
    reasonCodes: ['knowledge_sources_found'],
    draftResponse: draft,
    route: null,
  }
}

async function mapClassificationToDecision(
  intakeId: string,
  classification: Classification,
  sanitizedText: string,
  deps: DependencyContext,
): Promise<Decision> {
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
    case 'general_qa':
      return groundedGeneralQaDecision(intakeId, sanitizedText, deps)
  }
}

export async function runPipeline(
  rawText: string,
  intakeId: string,
  gateway: ModelGateway,
  deps: PipelineDeps = {},
): Promise<PipelineResult> {
  const match = sensitiveSignalDetector.detect(rawText)
  if (match) {
    return { status: 'halted', reason: 'sensitive_signal', match }
  }

  if (rawText.trim() === '') {
    return { status: 'halted', reason: 'insufficient_information' }
  }

  const context: DependencyContext = {
    gateway,
    knowledge: deps.knowledge ?? knowledgeBase,
    circuits: deps.circuits ?? defaultCircuits,
    timeoutMs: deps.timeoutMs ?? defaultTimeoutMs,
  }
  const sanitizedText = scrubDirectIdentifiers(rawText)
  const classified = await callGuarded(
    context.circuits,
    'classify',
    context.timeoutMs,
    () => gateway.classify({ text: sanitizedText }),
  )
  if (!classified.ok) {
    return {
      status: 'continued',
      sanitizedText,
      classification: unavailableClassification,
      directIdentifiersReplaced: sanitizedText !== rawText,
      decision: supportRouteDecision(intakeId, 'unavailable', [
        classified.reason,
      ]),
    }
  }

  const classification = classified.value
  return {
    status: 'continued',
    sanitizedText,
    classification,
    directIdentifiersReplaced: sanitizedText !== rawText,
    decision: await mapClassificationToDecision(
      intakeId,
      classification,
      sanitizedText,
      context,
    ),
  }
}
