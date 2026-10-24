import { describe, expect, it } from 'vitest'
import {
  cashflowTransactionSchema,
  legacyTransferSchema,
  monthCarryDecisionSchema,
  monthlyBudgetSchema,
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
    paid_by: userId,
    created_at: timestamp,
    updated_at: timestamp,
    deleted_at: null,
  }
}

describe('modèles du budget réformé', () => {
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

  it('reconnaît les transferts historiques dans l’archive en lecture seule', () => {
    expect(
      legacyTransferSchema.safeParse({
        id: '00000000-0000-4000-8000-000000000007',
        workspace_id: workspaceId,
        source_account_id: categoryId,
        destination_account_id: '00000000-0000-4000-8000-000000000008',
        amount: 120,
        occurred_on: '2026-10-15',
        note: null,
        created_by: userId,
        created_at: timestamp,
        updated_at: timestamp,
        deleted_at: null,
        archived_at: timestamp,
      }).success,
    ).toBe(true)
  })
})
