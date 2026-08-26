// Fake-mode synthetic runner: POST each RFC demonstration Intake to the
// existing /triage handler in-process and print Decision fields.

import { pathToFileURL } from 'node:url'

import { createApp } from './app.js'
import { DependencyCircuits } from './dependency-guard.js'
import {
  demonstrationScenarios,
  type DemonstrationScenario,
} from './demonstration-scenarios.js'
import { FakeModelGateway } from './model-gateway.js'
import { DecisionSchema, type Decision } from './schemas.js'

export type ScenarioOutcome = {
  readonly intakeId: string
  readonly ok: boolean
  readonly line: string
  readonly error?: string
}

export type DemonstrationRun = {
  readonly ok: boolean
  readonly outcomes: readonly ScenarioOutcome[]
  readonly output: string
}

function formatDecisionLine(
  scenario: DemonstrationScenario,
  decision: Decision,
): string {
  const destinationOrCitations = decision.route?.destination
    ? `destination=${decision.route.destination}`
    : `citations=${decision.draftResponse?.citations.join(', ') ?? ''}`
  return `${scenario.name} | intakeId=${decision.intakeId} | action=${decision.action} | ${destinationOrCitations} | reasonCodes=${decision.reasonCodes.join(',')}`
}

async function requestScenarioDecision(
  scenario: DemonstrationScenario,
): Promise<Decision> {
  const app = createApp(new FakeModelGateway(scenario.gateway), {
    circuits: new DependencyCircuits(),
  })
  const res = await app.request('/triage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      intakeId: scenario.intakeId,
      memberRef: 'member-demo',
      text: scenario.text,
      metadata: {},
    }),
  })
  if (res.status !== 200) {
    throw new Error(`unexpected status ${res.status} for ${scenario.intakeId}`)
  }
  const parsed = DecisionSchema.safeParse(await res.json())
  if (!parsed.success) {
    throw new Error(`invalid Decision for ${scenario.intakeId}`)
  }
  return parsed.data
}

export async function runDemonstrationScenarios(
  scenarios: readonly DemonstrationScenario[] = demonstrationScenarios,
  request: (
    scenario: DemonstrationScenario,
  ) => Promise<Decision> = requestScenarioDecision,
): Promise<DemonstrationRun> {
  const outcomes: ScenarioOutcome[] = []
  for (const scenario of scenarios) {
    try {
      const decision = await request(scenario)
      outcomes.push({
        intakeId: scenario.intakeId,
        ok: true,
        line: formatDecisionLine(scenario, decision),
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'failed'
      outcomes.push({
        intakeId: scenario.intakeId,
        ok: false,
        line: `${scenario.name} | intakeId=${scenario.intakeId} | error=${message}`,
        error: message,
      })
    }
  }
  return {
    ok: outcomes.every((outcome) => outcome.ok),
    outcomes,
    output: outcomes.map((outcome) => outcome.line).join('\n'),
  }
}

export async function main(
  run: DemonstrationRun | Promise<DemonstrationRun> = runDemonstrationScenarios(),
): Promise<void> {
  const result = await run
  if (result.output) console.log(result.output)
  if (!result.ok) {
    console.error('demonstration scenarios failed')
    process.exitCode = 1
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
