import { z } from 'zod'

export const ReasonCodeSchema = z.enum([
  'knowledge_sources_found',
  'no_knowledge_sources',
  'sensitive_signal',
  'direct_identifiers_scrubbed',
  'advice_request',
  'account_record_lookup',
  'account_mutation',
  'insufficient_information',
  'out_of_scope',
  'mixed_intent',
  'low_confidence',
  'classification_unavailable',
  'deadline_exceeded',
  'dependency_failed',
  'citation_invalid',
  'product_feedback',
  'protected_complaint',
])

export type ReasonCode = z.infer<typeof ReasonCodeSchema>

/** Untrusted caller claims accepted for compatibility, never for authorization or policy. */
const ClaimsSchema = z.record(
  z.string(),
  z.union([z.string(), z.boolean()]),
)

const MetadataSchema = z.object({
  channel: z.string().optional(),
  locale: z.string().optional(),
  surface: z.string().optional(),
})

export const TriageRequestSchema = z.object({
  intakeId: z.string(),
  memberRef: z.string(),
  claims: ClaimsSchema.optional(),
  text: z.string(),
  metadata: MetadataSchema,
})

export type TriageRequest = z.infer<typeof TriageRequestSchema>

const DraftResponseSchema = z.object({
  text: z.string(),
  citations: z.array(z.string()),
})

const RouteSchema = z.object({
  destination: z.enum(['product', 'legal_compliance', 'support']),
  safeSummary: z.string().nullable(),
  flags: z.array(z.string()),
  intakeRef: z.string(),
})

export const DecisionSchema = z
  .object({
    intakeId: z.string(),
    category: z
      .enum(['general_qa', 'product_feedback', 'compliance'])
      .nullable(),
    action: z.enum(['draft_resolution', 'route_to_team']),
    classificationConfidence: z.enum(['high', 'low', 'unavailable']),
    humanApprovalRequired: z.literal(true),
    reasonCodes: z.array(ReasonCodeSchema),
    draftResponse: DraftResponseSchema.nullable(),
    route: RouteSchema.nullable(),
  })
  .refine(
    ({ intakeId, route }) => route === null || route.intakeRef === intakeId,
    {
      message: 'route.intakeRef must equal intakeId',
      path: ['route', 'intakeRef'],
    },
  )

export type Decision = z.infer<typeof DecisionSchema>
