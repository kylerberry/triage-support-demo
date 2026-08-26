import type { Decision } from './schemas.js'

export type PolicyCategory = NonNullable<Decision['category']>

export type PolicyAction = Decision['action']

export type PolicyDestination = NonNullable<Decision['route']>['destination']

export type CategoryPolicy = {
  readonly action: PolicyAction
  readonly destination: PolicyDestination
  readonly draftingRule: string
  readonly context: string
}

/**
 * Category Policies table from docs/rfc.md, encoded as checked constants.
 *
 * The pipeline, not the model, chooses action, Destination, and Reason Codes.
 * There is no default policy: lookups are total over PolicyCategory, and an
 * unknown or null category must be handled by the caller, not fallen back.
 */
export const categoryPolicies = {
  general_qa: {
    action: 'draft_resolution',
    // RFC "Destination / review": "Support approval (not implemented)".
    // Review destination of the draft; never used to build a route.
    destination: 'support',
    draftingRule:
      'high confidence; Knowledge Sources required; not advice, personal-record, mixed, or out-of-scope',
    context: 'Draft plus citations',
  },
  product_feedback: {
    action: 'route_to_team',
    destination: 'product',
    draftingRule: 'Never draft a Member response',
    context: 'Classifier-produced safe Routing Summary',
  },
  compliance: {
    action: 'route_to_team',
    destination: 'legal_compliance',
    draftingRule: 'Never draft a Member response',
    context: 'Compliance Flag and intakeId only',
  },
} as const satisfies Record<PolicyCategory, CategoryPolicy>
