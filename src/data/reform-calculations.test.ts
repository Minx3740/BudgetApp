import { describe, expect, it } from 'vitest'
import { calculateMonthlyBudgetSummary } from './calculations'
import {
  calculateExpenseComposition,
  calculateMonthLedger,
  resourceUsagePercentage,
} from './reform-calculations'
import type {
  Budget,
  CashflowTransaction,
  Category,
  MonthCarryDecision,
  MonthlyBudget,
} from './models'

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

function category(): Category {
  return {
    id: categoryId,
    workspace_id: workspaceId,
    name: 'Courses',
    kind: 'expense',
    icon: null,
    color: null,
    archived_at: null,
    created_at: timestamp,
    updated_at: timestamp,
    deleted_at: null,
  }
}

function categoryBudget(month: string, limit_amount: number): Budget {
  return {
    id: '00000000-0000-4000-8000-000000000006',
    workspace_id: workspaceId,
    category_id: categoryId,
    month,
    limit_amount,
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

describe('calculs du disponible et report R7', () => {
  it('sépare les dépenses fixes, variables et non classées', () => {
    const recurringId = '00000000-0000-4000-8000-000000000099'
    const transactions = [
      {
        ...transaction(
          '00000000-0000-4000-8000-000000000081',
          'expense',
          10_000,
          '2026-10-02',
          categoryId,
        ),
        recurring_id: recurringId,
        recurring_month: '2026-10-01',
      },
      transaction(
        '00000000-0000-4000-8000-000000000082',
        'expense',
        6_000,
        '2026-10-03',
        categoryId,
      ),
      transaction('00000000-0000-4000-8000-000000000083', 'expense', 2_000, '2026-10-04'),
      transaction('00000000-0000-4000-8000-000000000084', 'refund', 500, '2026-10-05'),
      transaction(
        '00000000-0000-4000-8000-000000000085',
        'income',
        90_000,
        '2026-10-06',
        categoryId,
      ),
      transaction(
        '00000000-0000-4000-8000-000000000086',
        'expense',
        1_000,
        '2026-10-07',
        null,
        timestamp,
      ),
    ]

    expect(calculateExpenseComposition('2026-10-01', transactions)).toEqual({
      fixedExpenses: 10_000,
      variableExpenses: 7_500,
      uncategorizedExpenses: 1_500,
      netExpenses: 17_500,
    })
  })

  it('calcule le disponible à partir du budget, des revenus et des dépenses nettes', () => {
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
      resources: 150_000,
      available: 125_000,
    })
  })

  it('distingue un budget nul d’un budget absent', () => {
    const zero = calculateMonthLedger('2026-10-01', [monthlyBudget('2026-10-01', 0)], [], [])
    const absent = calculateMonthLedger('2026-10-01', [], [], [])
    expect(zero).toMatchObject({ budgetAmount: 0, resources: 0, available: 0 })
    expect(absent).toMatchObject({ budgetAmount: null, resources: 0, available: 0 })
  })

  it('suit le modèle A du budget aux ajustements sans compter une dépense deux fois', () => {
    const budget = [monthlyBudget('2026-10-01', 100_000)]
    const noTransactions = calculateMonthLedger('2026-10-01', budget, [], [])
    expect(noTransactions.available).toBe(100_000)

    const income = transaction(
      '00000000-0000-4000-8000-000000000061',
      'income',
      50_000,
      '2026-10-02',
      categoryId,
    )
    const afterIncome = calculateMonthLedger('2026-10-01', budget, [income], [])
    expect(afterIncome).toMatchObject({ budgetAmount: 100_000, available: 150_000 })

    const expense = transaction(
      '00000000-0000-4000-8000-000000000062',
      'expense',
      5_000,
      '2026-10-03',
      categoryId,
    )
    const afterExpense = calculateMonthLedger('2026-10-01', budget, [income, expense], [])
    const thresholdUsage = calculateMonthlyBudgetSummary(
      '2026-10-01',
      [categoryBudget('2026-10-01', 20_000)],
      [category()],
      [expense],
    )
    expect(afterExpense.available).toBe(145_000)
    expect(thresholdUsage.totalSpent).toBe(5_000)
    expect(thresholdUsage.categories[0]?.spentAmount).toBe(5_000)

    const refund = transaction(
      '00000000-0000-4000-8000-000000000063',
      'refund',
      2_000,
      '2026-10-04',
      categoryId,
    )
    const afterRefund = calculateMonthLedger('2026-10-01', budget, [income, expense, refund], [])
    expect(afterRefund.available).toBe(147_000)

    const adjustment = transaction(
      '00000000-0000-4000-8000-000000000064',
      'adjustment',
      -1_000,
      '2026-10-05',
    )
    expect(
      calculateMonthLedger('2026-10-01', budget, [income, expense, refund, adjustment], []),
    ).toMatchObject({ budgetAmount: 100_000, resources: 149_000, available: 146_000 })
  })

  it('calcule les ressources sans budget défini tout en gardant l’état absent', () => {
    const transactions = [
      transaction(
        '00000000-0000-4000-8000-000000000071',
        'income',
        50_000,
        '2026-10-02',
        categoryId,
      ),
      transaction('00000000-0000-4000-8000-000000000072', 'expense', 10_000, '2026-10-03'),
      transaction('00000000-0000-4000-8000-000000000073', 'refund', 1_000, '2026-10-04'),
      transaction('00000000-0000-4000-8000-000000000074', 'adjustment', -2_000, '2026-10-05'),
      transaction(
        '00000000-0000-4000-8000-000000000075',
        'income',
        70_000,
        '2026-09-02',
        categoryId,
      ),
    ]
    const summary = calculateMonthLedger(
      '2026-10-01',
      [monthlyBudget('2026-09-01', 0)],
      transactions,
      [decision('2026-10-01', true)],
    )
    expect(summary).toMatchObject({
      budgetAmount: null,
      carryIn: 70_000,
      resources: 118_000,
      netExpenses: 9_000,
      available: 109_000,
    })
  })

  it('n’affiche pas de report d’un disponible négatif', () => {
    const transactions = [
      transaction('00000000-0000-4000-8000-000000000081', 'expense', 5_000, '2026-09-05'),
    ]
    expect(
      calculateMonthLedger('2026-09-01', [monthlyBudget('2026-09-01', 1_000)], transactions, [])
        .available,
    ).toBe(-4_000)
    expect(
      calculateMonthLedger('2026-10-01', [], transactions, [decision('2026-10-01', true)]).carryIn,
    ).toBe(0)
  })

  it('enchaîne trois mois de reports acceptés sur les disponibles', () => {
    const budgets = [
      monthlyBudget('2026-08-01', 100_000),
      monthlyBudget('2026-09-01', 50_000),
      monthlyBudget('2026-10-01', 30_000),
    ]
    const transactions = [
      transaction('00000000-0000-4000-8000-000000000091', 'expense', 20_000, '2026-08-04'),
      transaction('00000000-0000-4000-8000-000000000092', 'expense', 10_000, '2026-09-04'),
      transaction('00000000-0000-4000-8000-000000000093', 'expense', 5_000, '2026-10-04'),
    ]
    const decisions = [decision('2026-09-01', true), decision('2026-10-01', true)]
    expect(calculateMonthLedger('2026-10-01', budgets, transactions, decisions)).toMatchObject({
      carryIn: 120_000,
      resources: 150_000,
      available: 145_000,
    })
  })

  it('calcule la part dépensée des ressources et omet la barre sans ressources', () => {
    expect(resourceUsagePercentage(25_000, 100_000)).toBe(25)
    expect(resourceUsagePercentage(150_000, 100_000)).toBe(100)
    expect(resourceUsagePercentage(1_000, 0)).toBeNull()
    expect(resourceUsagePercentage(1_000, -500)).toBeNull()
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
      resources: 1_500,
      available: 1_500,
    })
  })

  it('reporte uniquement un disponible positif si la décision est acceptée', () => {
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
    ).toMatchObject({ carryIn: 20_000, available: 20_000 })
    expect(
      calculateMonthLedger('2026-10-01', [], transactions, [decision('2026-10-01', false)]),
    ).toMatchObject({ carryIn: 0, available: 0 })
  })

  it('ne reporte pas un mois précédent déficitaire', () => {
    expect(
      calculateMonthLedger(
        '2026-10-01',
        [],
        [transaction('00000000-0000-4000-8000-000000000041', 'expense', 5_000, '2026-09-05')],
        [decision('2026-10-01', true)],
      ).carryIn,
    ).toBe(0)
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
    expect(summary.available).toBe(0)
  })
})
