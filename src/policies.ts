import type { Decision } from './schemas.js'

export type PolicyCategory = NonNullable<Decision['category']>

export type PolicyAction = Decision['action']

/** Route destinations only. `support` is a Support-guard route, not a policy field. */
export type PolicyDestination = Exclude<
  NonNullable<Decision['route']>['destination'],
  'support'
>

export type PolicyReview = 'support_approval'

export type CategoryPolicy = {
  readonly action: PolicyAction
  readonly destination: PolicyDestination | null
  readonly review: PolicyReview | null
  readonly draftingRule: string
  readonly context: string
}

/**
 * Category Policies table from docs/rfc.md, encoded as checked constants.
 *
 * The pipeline, not the model, chooses action, Destination, and Reason Codes.
 * There is no default policy: lookups are total over PolicyCategory, and an
 * unknown or null category must be handled by the caller, not fallen back.
 *
 * n11 must copy `action` and, when non-null, `destination` into the Decision.
 * It must not copy `review` into `route.destination`. general_qa leaves
 * `route` null.
 */
export const categoryPolicies = {
  general_qa: {
    action: 'draft_resolution',
    destination: null,
    review: 'support_approval',
    draftingRule:
      'high confidence; Knowledge Sources required; not advice, personal-record, mixed, or out-of-scope',
    context: 'Draft plus citations',
  },
  product_feedback: {
    action: 'route_to_team',
    destination: 'product',
    review: null,
    draftingRule: 'Never draft a Member response',
    context: 'Classifier-produced safe Routing Summary',
  },
  compliance: {
    action: 'route_to_team',
    destination: 'legal_compliance',
    review: null,
    draftingRule: 'Never draft a Member response',
    context: 'Compliance Flag and intakeId only',
  },
} as const satisfies Record<PolicyCategory, CategoryPolicy>
