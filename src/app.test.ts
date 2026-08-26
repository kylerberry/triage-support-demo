import { describe, expect, it, vi } from 'vitest'

import { createApp, type DecisionLogger } from './app.js'
import { FakeModelGateway } from './model-gateway.js'
import { DecisionSchema } from './schemas.js'

const intakeId = 'intake-n14'
const passwordResetExcerpt =
  'To reset a password, open the sign-in page, choose Forgot password, and follow the link sent to the email address on the account.'

function validBody(
  text: string,
  metadata: Record<string, string> = {},
): Record<string, unknown> {
  return {
    intakeId,
    memberRef: 'member-n14',
    text,
    metadata,
  }
}

async function postTriage(
  gateway: FakeModelGateway,
  body: BodyInit,
  logger?: DecisionLogger,
) {
  const app = createApp(gateway, logger)
  return app.request('/triage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  })
}

describe('POST /triage', () => {
  it('returns 200 and a schema-valid Decision for a valid request', async () => {
    const gateway = new FakeModelGateway()
    const res = await postTriage(
      gateway,
      JSON.stringify(validBody('How do I reset my password?')),
    )

    expect(res.status).toBe(200)
    const decision = DecisionSchema.parse(await res.json())
    expect(decision).toEqual({
      intakeId,
      category: 'general_qa',
      action: 'draft_resolution',
      classificationConfidence: 'high',
      humanApprovalRequired: true,
      reasonCodes: ['knowledge_sources_found'],
      draftResponse: {
        text: passwordResetExcerpt,
        citations: ['kb.password-reset.v1'],
      },
      route: null,
    })
    expect(gateway.classifyCalls).toHaveLength(1)
  })

  it('maps a Sensitive Signal halt to Legal & Compliance without calling the model', async () => {
    const gateway = new FakeModelGateway()
    const res = await postTriage(
      gateway,
      JSON.stringify(
        validBody('I filed a CFPB complaint about misleading rates'),
      ),
    )

    expect(res.status).toBe(200)
    expect(DecisionSchema.parse(await res.json())).toEqual({
      intakeId,
      category: null,
      action: 'route_to_team',
      classificationConfidence: 'unavailable',
      humanApprovalRequired: true,
      reasonCodes: ['sensitive_signal'],
      draftResponse: null,
      route: {
        destination: 'legal_compliance',
        safeSummary: null,
        flags: [],
        intakeRef: intakeId,
      },
    })
    expect(gateway.classifyCalls).toEqual([])
    expect(gateway.draftResolutionCalls).toEqual([])
  })

  it('maps empty text to Support without calling the model', async () => {
    const gateway = new FakeModelGateway()
    const res = await postTriage(gateway, JSON.stringify(validBody('   ')))

    expect(res.status).toBe(200)
    expect(DecisionSchema.parse(await res.json())).toEqual({
      intakeId,
      category: null,
      action: 'route_to_team',
      classificationConfidence: 'unavailable',
      humanApprovalRequired: true,
      reasonCodes: ['insufficient_information'],
      draftResponse: null,
      route: {
        destination: 'support',
        safeSummary: null,
        flags: [],
        intakeRef: intakeId,
      },
    })
    expect(gateway.classifyCalls).toEqual([])
    expect(gateway.draftResolutionCalls).toEqual([])
  })

  it('rejects malformed JSON without calling the model', async () => {
    const gateway = new FakeModelGateway()
    const res = await postTriage(gateway, '{"intakeId": ')

    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid_request' })
    expect(gateway.classifyCalls).toEqual([])
    expect(gateway.draftResolutionCalls).toEqual([])
  })

  it('rejects schema-invalid requests without calling the model', async () => {
    const gateway = new FakeModelGateway()
    const missingMemberRef = await postTriage(
      gateway,
      JSON.stringify({
        intakeId,
        text: 'How do I reset my password?',
        metadata: {},
      }),
    )
    const nonStringText = await postTriage(
      gateway,
      JSON.stringify({
        intakeId,
        memberRef: 'member-n14',
        text: 123,
        metadata: {},
      }),
    )

    expect(missingMemberRef.status).toBe(400)
    expect(await missingMemberRef.json()).toEqual({ error: 'invalid_request' })
    expect(nonStringText.status).toBe(400)
    expect(await nonStringText.json()).toEqual({ error: 'invalid_request' })
    expect(gateway.classifyCalls).toEqual([])
    expect(gateway.draftResolutionCalls).toEqual([])
  })

  it('drops unknown metadata and still returns a Decision', async () => {
    const gateway = new FakeModelGateway()
    const res = await postTriage(
      gateway,
      JSON.stringify(
        validBody('How do I reset my password?', {
          channel: 'web',
          promoBucket: 'z-9',
        }),
      ),
    )

    expect(res.status).toBe(200)
    const decision = DecisionSchema.parse(await res.json())
    expect(decision.humanApprovalRequired).toBe(true)
    expect(decision.intakeId).toBe(intakeId)
    expect(gateway.classifyCalls).toHaveLength(1)
  })

  it('returns Decision JSON only and does not send or write a Case', async () => {
    const gateway = new FakeModelGateway()
    const res = await postTriage(
      gateway,
      JSON.stringify(validBody('How do I reset my password?')),
    )
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(DecisionSchema.parse(body)).toMatchObject({
      humanApprovalRequired: true,
    })
    expect(body).not.toHaveProperty('case')
    expect(body).not.toHaveProperty('approvalTask')
    expect(body).not.toHaveProperty('memberFacingResponse')
    expect(body).not.toHaveProperty('sent')
  })

  it('logs only allowlisted Decision audit fields on a valid 200 and never raw Intake data', async () => {
    const rawTextCanary = 'How do I reset my password? alpha-rawtext-7731'
    const memberRefCanary = 'member-ref-bravo-8842'
    const claimsCanary = 'claims-golf-2290'
    const logger = { log: vi.fn() }
    const res = await postTriage(
      new FakeModelGateway(),
      JSON.stringify({
        intakeId,
        memberRef: memberRefCanary,
        claims: { loyalty: claimsCanary, vip: true },
        text: rawTextCanary,
        metadata: {},
      }),
      logger,
    )

    expect(res.status).toBe(200)
    expect(logger.log).toHaveBeenCalledTimes(1)
    expect(logger.log.mock.calls[0][0]).toEqual({
      intakeId,
      category: 'general_qa',
      action: 'draft_resolution',
      classificationConfidence: 'high',
      humanApprovalRequired: true,
      reasonCodes: ['knowledge_sources_found'],
    })

    const dumped = JSON.stringify(logger.log.mock.calls)
    for (const forbidden of [
      'alpha-rawtext-7731',
      memberRefCanary,
      claimsCanary,
      'draftResponse',
      'kb.password-reset.v1',
      'route',
      'intakeRef',
      'destination',
      'safeSummary',
      'flags',
    ]) {
      expect(dumped).not.toContain(forbidden)
    }
  })

  it('logs allowlisted fields and Reason Codes on a sensitive-signal 200 without routing payload', async () => {
    const logger = { log: vi.fn() }
    const res = await postTriage(
      new FakeModelGateway(),
      JSON.stringify(
        validBody('I filed a CFPB complaint about misleading rates'),
      ),
      logger,
    )

    expect(res.status).toBe(200)
    expect(logger.log).toHaveBeenCalledTimes(1)
    expect(logger.log.mock.calls[0][0]).toEqual({
      intakeId,
      category: null,
      action: 'route_to_team',
      classificationConfidence: 'unavailable',
      humanApprovalRequired: true,
      reasonCodes: ['sensitive_signal'],
    })

    const dumped = JSON.stringify(logger.log.mock.calls)
    for (const forbidden of [
      'legal_compliance',
      'intakeRef',
      'destination',
      'safeSummary',
      'flags',
      'member-n14',
    ]) {
      expect(dumped).not.toContain(forbidden)
    }
  })

  it('makes no logger calls for invalid requests', async () => {
    const gateway = new FakeModelGateway()
    const logger = { log: vi.fn() }
    const malformed = await postTriage(gateway, '{"intakeId": ', logger)
    const schemaInvalid = await postTriage(
      gateway,
      JSON.stringify({ intakeId, text: 'x', metadata: {} }),
      logger,
    )

    expect(malformed.status).toBe(400)
    expect(schemaInvalid.status).toBe(400)
    expect(logger.log).not.toHaveBeenCalled()
  })
})
