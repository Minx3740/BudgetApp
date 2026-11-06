import { describe, expect, it } from 'vitest'
import {
  budgetSchema,
  cashflowTransactionSchema,
  monthCarryDecisionSchema,
  monthlyBudgetSchema,
  profileSchema,
} from './models'

const workspaceId = '00000000-0000-4000-8000-000000000001'
const categoryId = '00000000-0000-4000-8000-000000000002'
const userId = '00000000-0000-4000-8000-000000000003'
const timestamp = '2026-10-15T12:00:00.000Z'

function transaction(
  kind: 'expense' | 'refund' | 'income' | 'adjustment',
  amount: number,
  category_id: string | null,
) {
  return {
    id: '00000000-0000-4000-8000-000000000004',
    workspace_id: workspaceId,
    category_id,
    kind,
    amount,
    occurred_on: '2026-10-15',
    note: null,
    created_by: userId,
    updated_by: userId,
    paid_by: userId,
    created_at: timestamp,
    updated_at: timestamp,
    deleted_at: null,
  }
}

describe('modèles du budget réformé', () => {
  it('accepte les profils existants sans photo et leur donne un chemin nul', () => {
    expect(
      profileSchema.parse({
        id: userId,
        display_name: 'Utilisateur',
        created_at: timestamp,
        updated_at: timestamp,
        deleted_at: null,
      }).avatar_path,
    ).toBeNull()
  })

  it('accepte un budget mensuel nul, distinct d’un budget absent', () => {
    expect(
      monthlyBudgetSchema.parse({
        id: '00000000-0000-4000-8000-000000000005',
        workspace_id: workspaceId,
        month: '2026-10-01',
        budget_amount: 0,
        created_at: timestamp,
        updated_at: timestamp,
        deleted_at: null,
      }).budget_amount,
    ).toBe(0)
  })

  it('généralise les seuils en gardant les valeurs mensuelles rétrocompatibles', () => {
    const legacy = budgetSchema.parse({
      id: '00000000-0000-4000-8000-000000000007',
      workspace_id: workspaceId,
      category_id: categoryId,
      month: '2026-10-01',
      limit_amount: 1_000,
      created_at: timestamp,
      updated_at: timestamp,
      deleted_at: null,
    })
    expect(legacy).toMatchObject({ period: 'month', enabled: true })

    expect(
      budgetSchema.parse({
        ...legacy,
        id: '00000000-0000-4000-8000-000000000009',
        category_id: null,
        month: null,
        period: 'day',
        enabled: undefined,
      }).enabled,
    ).toBe(false)
    expect(
      budgetSchema.safeParse({
        ...legacy,
        id: '00000000-0000-4000-8000-000000000008',
        category_id: null,
        month: null,
        period: 'week',
      }).success,
    ).toBe(true)
    expect(
      budgetSchema.safeParse({
        ...legacy,
        category_id: categoryId,
        month: null,
        period: 'day',
      }).success,
    ).toBe(false)
    expect(
      budgetSchema.safeParse({
        ...legacy,
        month: null,
      }).success,
    ).toBe(false)
  })

  it('valide une décision de report par espace et mois', () => {
    expect(
      monthCarryDecisionSchema.parse({
        id: '00000000-0000-4000-8000-000000000006',
        workspace_id: workspaceId,
        month: '2026-10-01',
        accepted: false,
        created_at: timestamp,
        updated_at: timestamp,
        deleted_at: null,
      }).accepted,
    ).toBe(false)
  })

  it.each([
    ['expense', 100, null],
    ['refund', 50, null],
    ['income', 500, categoryId],
    ['adjustment', -200, null],
  ] as const)('accepte le cas valide %s', (kind, amount, category_id) => {
    expect(
      cashflowTransactionSchema.safeParse(transaction(kind, amount, category_id)).success,
    ).toBe(true)
  })

  it('refuse les montants non entiers ou hors plage sûre', () => {
    expect(cashflowTransactionSchema.safeParse(transaction('expense', 1.5, null)).success).toBe(
      false,
    )
    expect(
      cashflowTransactionSchema.safeParse(transaction('expense', Number.MAX_SAFE_INTEGER + 1, null))
        .success,
    ).toBe(false)
  })

  it('refuse les ajustements nuls, catégorisés, et les revenus sans catégorie', () => {
    expect(cashflowTransactionSchema.safeParse(transaction('adjustment', 0, null)).success).toBe(
      false,
    )
    expect(
      cashflowTransactionSchema.safeParse(transaction('adjustment', 1, categoryId)).success,
    ).toBe(false)
    expect(cashflowTransactionSchema.safeParse(transaction('income', 1, null)).success).toBe(false)
  })
})
