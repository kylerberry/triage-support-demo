import { describe, expect, it } from 'vitest'
import { DecisionSchema, TriageRequestSchema } from './schemas.js'

const validDecision = () => ({
  intakeId: 'intake-1',
  category: 'general_qa',
  action: 'draft_resolution',
  classificationConfidence: 'high',
  humanApprovalRequired: true,
  reasonCodes: ['knowledge_sources_found'],
  draftResponse: {
    text: 'A synthetic response',
    citations: ['source-1'],
  },
  route: null,
})

describe('TriageRequestSchema', () => {
  it('parses a valid request and strips unknown metadata', () => {
    const result = TriageRequestSchema.parse({
      intakeId: 'intake-1',
      memberRef: 'member-1',
      text: 'How do mortgage rates work?',
      metadata: {
        channel: 'web',
        locale: 'en-US',
        surface: 'help-center',
        trackingId: 'not-allowlisted',
      },
    })

    expect(result.metadata).toEqual({
      channel: 'web',
      locale: 'en-US',
      surface: 'help-center',
    })
  })

  it('accepts claims and allows claims and metadata fields to be omitted', () => {
    expect(
      TriageRequestSchema.safeParse({
        intakeId: 'intake-1',
        memberRef: 'member-1',
        claims: { premium: true, tier: 'gold' },
        text: 'How do mortgage rates work?',
        metadata: {},
      }).success,
    ).toBe(true)

    expect(
      TriageRequestSchema.safeParse({
        intakeId: 'intake-1',
        memberRef: 'member-1',
        text: 'How do mortgage rates work?',
        metadata: {},
      }).success,
    ).toBe(true)
  })
})

describe('DecisionSchema', () => {
  it('requires human approval', () => {
    expect(
      DecisionSchema.safeParse({
        ...validDecision(),
        humanApprovalRequired: false,
      }).success,
    ).toBe(false)
  })

  it('rejects reason codes outside the endpoint contract', () => {
    expect(
      DecisionSchema.safeParse({
        ...validDecision(),
        reasonCodes: ['dependency_timeout'],
      }).success,
    ).toBe(false)

    expect(
      DecisionSchema.safeParse({
        ...validDecision(),
        reasonCodes: ['deadline_exceeded'],
      }).success,
    ).toBe(true)
  })

  it('requires a route intake reference to match the decision intake ID', () => {
    const route = {
      destination: 'support',
      safeSummary: 'Synthetic summary',
      flags: [],
      intakeRef: 'intake-1',
    }

    expect(
      DecisionSchema.safeParse({
        ...validDecision(),
        route,
      }).success,
    ).toBe(true)

    expect(
      DecisionSchema.safeParse({
        ...validDecision(),
        route: { ...route, intakeRef: 'another-intake' },
      }).success,
    ).toBe(false)
  })
})
