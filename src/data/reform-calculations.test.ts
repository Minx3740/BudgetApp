import { describe, expect, it } from 'vitest'
import { calculateMonthLedger } from './reform-calculations'
import type { CashflowTransaction, MonthCarryDecision, MonthlyBudget } from './models'

const workspaceId = '00000000-0000-4000-8000-000000000001'
const userId = '00000000-0000-4000-8000-000000000002'
const categoryId = '00000000-0000-4000-8000-000000000003'
const timestamp = '2026-10-15T12:00:00.000Z'

function transaction(
  id: string,
  kind: CashflowTransaction['kind'],
  amount: number,
  occurred_on: string,
  category_id: string | null = null,
  deleted_at: string | null = null,
): CashflowTransaction {
  return {
    id,
    workspace_id: workspaceId,
    category_id,
    kind,
    amount,
    occurred_on,
    note: null,
    created_by: userId,
    paid_by: userId,
    recurring_id: null,
    recurring_month: null,
    created_at: timestamp,
    updated_at: timestamp,
    deleted_at,
  }
}

function monthlyBudget(month: string, budget_amount: number): MonthlyBudget {
  return {
    id: '00000000-0000-4000-8000-000000000004',
    workspace_id: workspaceId,
    month,
    budget_amount,
    created_at: timestamp,
    updated_at: timestamp,
    deleted_at: null,
  }
}

function decision(month: string, accepted: boolean): MonthCarryDecision {
  return {
    id: '00000000-0000-4000-8000-000000000005',
    workspace_id: workspaceId,
    month,
    accepted,
    created_at: timestamp,
    updated_at: timestamp,
    deleted_at: null,
  }
}

describe('calculs budget, solde et report R1', () => {
  it('calcule le budget global séparément des dépenses nettes et des seuils', () => {
    const summary = calculateMonthLedger(
      '2026-10-01',
      [monthlyBudget('2026-10-01', 50_000)],
      [
        transaction('00000000-0000-4000-8000-000000000011', 'expense', 20_000, '2026-10-02'),
        transaction(
          '00000000-0000-4000-8000-000000000012',
          'expense',
          10_000,
          '2026-10-03',
          categoryId,
        ),
        transaction('00000000-0000-4000-8000-000000000013', 'refund', 5_000, '2026-10-04'),
        transaction(
          '00000000-0000-4000-8000-000000000014',
          'income',
          100_000,
          '2026-10-05',
          categoryId,
        ),
      ],
      [],
    )

    expect(summary).toMatchObject({
      budgetAmount: 50_000,
      expenses: 30_000,
      refunds: 5_000,
      netExpenses: 25_000,
      income: 100_000,
      remainingBudget: 25_000,
      balance: 75_000,
    })
  })

  it('distingue un budget nul d’un budget absent', () => {
    const zero = calculateMonthLedger('2026-10-01', [monthlyBudget('2026-10-01', 0)], [], [])
    const absent = calculateMonthLedger('2026-10-01', [], [], [])
    expect(zero).toMatchObject({ budgetAmount: 0, remainingBudget: 0 })
    expect(absent).toMatchObject({ budgetAmount: null, remainingBudget: null })
  })

  it('applique les ajustements signés uniquement au solde', () => {
    const summary = calculateMonthLedger(
      '2026-10-01',
      [],
      [
        transaction('00000000-0000-4000-8000-000000000021', 'adjustment', 2_000, '2026-10-01'),
        transaction('00000000-0000-4000-8000-000000000022', 'adjustment', -500, '2026-10-02'),
      ],
      [],
    )
    expect(summary).toMatchObject({
      expenses: 0,
      income: 0,
      adjustments: 1_500,
      balance: 1_500,
    })
  })

  it('reporte uniquement un solde positif si la décision est acceptée', () => {
    const transactions = [
      transaction(
        '00000000-0000-4000-8000-000000000031',
        'income',
        30_000,
        '2026-09-04',
        categoryId,
      ),
      transaction('00000000-0000-4000-8000-000000000032', 'expense', 10_000, '2026-09-05'),
    ]
    expect(
      calculateMonthLedger('2026-10-01', [], transactions, [decision('2026-10-01', true)]),
    ).toMatchObject({ carryIn: 20_000, balance: 20_000 })
    expect(
      calculateMonthLedger('2026-10-01', [], transactions, [decision('2026-10-01', false)]),
    ).toMatchObject({ carryIn: 0, balance: 0 })
  })

  it('ne reporte pas un mois précédent déficitaire ou sans transactions', () => {
    expect(
      calculateMonthLedger(
        '2026-10-01',
        [],
        [transaction('00000000-0000-4000-8000-000000000041', 'expense', 5_000, '2026-09-05')],
        [decision('2026-10-01', true)],
      ).carryIn,
    ).toBe(0)
    expect(calculateMonthLedger('2026-10-01', [], [], [decision('2026-10-01', true)]).carryIn).toBe(
      0,
    )
  })

  it('ignore les transactions supprimées logiquement', () => {
    const summary = calculateMonthLedger(
      '2026-10-01',
      [],
      [
        transaction(
          '00000000-0000-4000-8000-000000000051',
          'income',
          99_000,
          '2026-10-01',
          categoryId,
          timestamp,
        ),
      ],
      [],
    )
    expect(summary.balance).toBe(0)
  })
})
