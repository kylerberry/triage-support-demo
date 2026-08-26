import { describe, expect, it } from 'vitest'
import { categoryPolicies } from './policies.js'

const actionDestinationTable = [
  ['general_qa', 'draft_resolution', null],
  ['product_feedback', 'route_to_team', 'product'],
  ['compliance', 'route_to_team', 'legal_compliance'],
] as const

const draftingRuleContextTable = [
  {
    category: 'general_qa',
    draftingRule:
      'high confidence; Knowledge Sources required; not advice, personal-record, mixed, or out-of-scope',
    context: 'Draft plus citations',
  },
  {
    category: 'product_feedback',
    draftingRule: 'Never draft a Member response',
    context: 'Classifier-produced safe Routing Summary',
  },
  {
    category: 'compliance',
    draftingRule: 'Never draft a Member response',
    context: 'Compliance Flag and intakeId only',
  },
] as const

describe('categoryPolicies', () => {
  it('covers exactly the three RFC categories', () => {
    expect(Object.keys(categoryPolicies)).toHaveLength(3)
    expect(Object.keys(categoryPolicies).sort()).toEqual([
      'compliance',
      'general_qa',
      'product_feedback',
    ])
  })

  it.each(actionDestinationTable)(
    'maps %s to action %s and destination %s',
    (category, action, destination) => {
      const policy = categoryPolicies[category]

      expect(policy.action).toBe(action)
      expect(policy.destination).toBe(destination)
    },
  )

  it('keeps general_qa review off the Support route vocabulary', () => {
    expect(categoryPolicies.general_qa.review).toBe('support_approval')
    expect(categoryPolicies.general_qa.destination).toBeNull()
    expect(categoryPolicies.product_feedback.review).toBeNull()
    expect(categoryPolicies.compliance.review).toBeNull()
  })

  it('requires action, destination, review, draftingRule, and context on every policy', () => {
    const requiredFields = [
      'action',
      'context',
      'destination',
      'draftingRule',
      'review',
    ] as const

    for (const policy of Object.values(categoryPolicies)) {
      expect(Object.keys(policy).sort()).toEqual([...requiredFields])
      expect(policy).toHaveProperty('action')
      expect(policy).toHaveProperty('destination')
      expect(policy).toHaveProperty('review')
      expect(policy).toHaveProperty('draftingRule')
      expect(policy).toHaveProperty('context')
      expect(policy.action.length).toBeGreaterThan(0)
      expect(policy.draftingRule.length).toBeGreaterThan(0)
      expect(policy.context.length).toBeGreaterThan(0)
    }
  })

  it.each(draftingRuleContextTable)(
    'pins $category drafting rule and context to the RFC Category Policies table',
    ({ category, draftingRule, context }) => {
      expect(categoryPolicies[category].draftingRule).toBe(draftingRule)
      expect(categoryPolicies[category].context).toBe(context)
    },
  )
})
