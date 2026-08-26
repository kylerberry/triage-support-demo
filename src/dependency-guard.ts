export type DependencyOperation =
  | 'knowledge_base'
  | 'classify'
  | 'draft_resolution'

export type GuardFailureReason = 'deadline_exceeded' | 'dependency_failed'

export type GuardResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: GuardFailureReason }

export class DependencyTimeoutError extends Error {
  constructor(message = 'dependency timeout') {
    super(message)
    this.name = 'DependencyTimeoutError'
  }
}

export class DependencyCircuits {
  readonly #open = new Set<DependencyOperation>()

  isOpen(operation: DependencyOperation): boolean {
    return this.#open.has(operation)
  }

  open(operation: DependencyOperation): void {
    this.#open.add(operation)
  }
}

function isTimeoutError(error: unknown): boolean {
  return (
    error instanceof DependencyTimeoutError ||
    (error instanceof Error && error.name === 'ModelGatewayTimeoutError')
  )
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new DependencyTimeoutError()),
      timeoutMs,
    )
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

export async function callGuarded<T>(
  circuits: DependencyCircuits,
  operation: DependencyOperation,
  timeoutMs: number,
  fn: () => Promise<T>,
): Promise<GuardResult<T>> {
  if (circuits.isOpen(operation)) {
    return { ok: false, reason: 'dependency_failed' }
  }

  try {
    return { ok: true, value: await withTimeout(fn(), timeoutMs) }
  } catch (error) {
    circuits.open(operation)
    return {
      ok: false,
      reason: isTimeoutError(error) ? 'deadline_exceeded' : 'dependency_failed',
    }
  }
}
