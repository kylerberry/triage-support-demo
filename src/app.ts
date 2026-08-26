import { Hono } from 'hono'

import { FakeModelGateway, type ModelGateway } from './model-gateway.js'
import { runPipeline } from './pipeline.js'
import {
  DecisionSchema,
  type Decision,
  TriageRequestSchema,
} from './schemas.js'

function routeToTeamDecision(
  intakeId: string,
  reasonCode: 'sensitive_signal' | 'insufficient_information',
  destination: 'legal_compliance' | 'support',
): Decision {
  return {
    intakeId,
    category: null,
    action: 'route_to_team',
    classificationConfidence: 'unavailable',
    humanApprovalRequired: true,
    reasonCodes: [reasonCode],
    draftResponse: null,
    route: {
      destination,
      safeSummary: null,
      flags: [],
      intakeRef: intakeId,
    },
  }
}

const haltDestination = {
  sensitive_signal: 'legal_compliance',
  insufficient_information: 'support',
} as const

export function createApp(gateway: ModelGateway) {
  const app = new Hono()

  app.post('/triage', async (c) => {
    let raw: unknown
    try {
      raw = await c.req.json()
    } catch {
      return c.json({ error: 'invalid_request' }, 400)
    }

    const parsed = TriageRequestSchema.safeParse(raw)
    if (!parsed.success) {
      return c.json({ error: 'invalid_request' }, 400)
    }

    const { text, intakeId } = parsed.data
    const result = await runPipeline(text, intakeId, gateway)
    const decision =
      result.status === 'continued'
        ? result.decision
        : routeToTeamDecision(
            intakeId,
            result.reason,
            haltDestination[result.reason],
          )

    const validated = DecisionSchema.safeParse(decision)
    if (!validated.success) {
      return c.json({ error: 'invalid_decision' }, 500)
    }

    return c.json(validated.data, 200)
  })

  return app
}

export const app = createApp(new FakeModelGateway())
