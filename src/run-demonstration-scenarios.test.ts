import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { demonstrationScenarios } from './demonstration-scenarios.js'
import {
  main,
  runDemonstrationScenarios,
  type DemonstrationRun,
} from './run-demonstration-scenarios.js'

afterEach(() => {
  process.exitCode = 0
  vi.restoreAllMocks()
})

describe('synthetic scenario runner', () => {
  let run: DemonstrationRun

  beforeAll(async () => {
    run = await runDemonstrationScenarios()
  })

  it('runs all twelve RFC scenarios successfully in fake mode', () => {
    expect(run.ok).toBe(true)
    expect(run.outcomes).toHaveLength(12)
    expect(run.outcomes.every((outcome) => outcome.ok)).toBe(true)
  })

  it('prints intakeId, action, destination or citations, and reasonCodes for each scenario', () => {
    const outcomesByIntakeId = new Map(
      run.outcomes.map((outcome) => [outcome.intakeId, outcome]),
    )

    for (const scenario of demonstrationScenarios) {
      const outcome = outcomesByIntakeId.get(scenario.intakeId)
      expect(outcome).toBeDefined()
      const line = outcome?.line ?? ''
      const expectedAction =
        scenario.expected.action === 'halted'
          ? 'route_to_team'
          : scenario.expected.action

      expect(line).toContain(scenario.intakeId)
      expect(line).toContain(`action=${expectedAction}`)
      expect(line).toContain(`reasonCodes=${scenario.expected.reasonCode}`)

      const destinationOrDraft = scenario.expected.destinationOrDraft
      if (destinationOrDraft.kind === 'draft') {
        expect(line).toContain(
          `citations=${destinationOrDraft.citations.join(', ')}`,
        )
      } else if (destinationOrDraft.kind === 'destination') {
        expect(line).toContain(
          `destination=${destinationOrDraft.destination}`,
        )
      } else {
        expect(line).toContain('destination=legal_compliance')
      }
    }
  })

  it('does not print intake text, memberRef, or draft body', () => {
    expect(run.output).not.toContain('reset my password')
    expect(run.output).not.toContain('ops@corp.io')
    expect(run.output).not.toContain('member-demo')
    expect(run.output).not.toContain('CFPB')
    expect(run.output).not.toContain('Chase')
    expect(run.output).not.toContain('To reset a password')
  })

  it('marks the run failed when a scenario request throws', async () => {
    const run = await runDemonstrationScenarios(
      demonstrationScenarios.slice(0, 1),
      async () => {
        throw new Error('invalid_decision')
      },
    )

    expect(run.ok).toBe(false)
    expect(run.outcomes[0]?.ok).toBe(false)
  })

  it('sets process.exitCode to 1 when the run failed', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const failedRun: DemonstrationRun = {
      ok: false,
      outcomes: [
        {
          intakeId: 'intake-n16-howto',
          ok: false,
          line: 'failed',
          error: 'invalid_decision',
        },
      ],
      output: 'failed',
    }

    await main(failedRun)

    expect(process.exitCode).toBe(1)
    expect(log).toHaveBeenCalled()
    expect(error).toHaveBeenCalled()
  })

  it('leaves process.exitCode at 0 when the run succeeded', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const successfulRun: DemonstrationRun = {
      ok: true,
      outcomes: [
        {
          intakeId: 'intake-n16-howto',
          ok: true,
          line: 'ok',
        },
      ],
      output: 'ok',
    }

    await main(successfulRun)

    expect(process.exitCode).toBe(0)
    expect(log).toHaveBeenCalled()
  })
})
