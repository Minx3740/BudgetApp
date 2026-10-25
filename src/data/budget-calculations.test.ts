import { describe, expect, it } from 'vitest'
import { calculateMonthlyBudgetSummary, monthKeyForDate, shiftMonth } from './calculations'
import type { Budget, Category, Transaction } from './models'

const workspaceId = '00000000-0000-4000-8000-000000000001'
const expenseCategoryId = '00000000-0000-4000-8000-000000000002'
const foodCategoryId = '00000000-0000-4000-8000-000000000003'
const incomeCategoryId = '00000000-0000-4000-8000-000000000004'
const userId = '00000000-0000-4000-8000-000000000005'
const timestamp = '2026-10-15T12:00:00.000Z'

function category(id: string, name: string, kind: Category['kind'] = 'expense'): Category {
  return {
    id,
    workspace_id: workspaceId,
    name,
    kind,
    icon: null,
    color: null,
    archived_at: null,
    created_at: timestamp,
    updated_at: timestamp,
    deleted_at: null,
  }
}

function budget(
  categoryId: string,
  month: string,
  limitAmount: number,
  deletedAt: string | null = null,
): Budget {
  return {
    id: `10000000-0000-4000-8000-${categoryId.slice(-12)}`,
    workspace_id: workspaceId,
    category_id: categoryId,
    month,
    limit_amount: limitAmount,
    created_at: timestamp,
    updated_at: timestamp,
    deleted_at: deletedAt,
  }
}

function transaction(
  id: string,
  kind: Transaction['kind'],
  amount: number,
  occurredOn: string,
  categoryId: string | null,
  deletedAt: string | null = null,
): Transaction {
  return {
    id,
    workspace_id: workspaceId,
    category_id: categoryId,
    kind,
    amount,
    occurred_on: occurredOn,
    note: null,
    created_by: userId,
    paid_by: userId,
    created_at: timestamp,
    updated_at: timestamp,
    deleted_at: deletedAt,
  }
}

describe('calcul du budget mensuel local', () => {
  const month = '2026-10-01'
  const categories = [
    category(expenseCategoryId, 'Logement'),
    category(foodCategoryId, 'Alimentation'),
    category(incomeCategoryId, 'Salaire', 'income'),
  ]

  it('calcule le reste total et par jour, les dépenses par catégorie et le dépassement', () => {
    const summary = calculateMonthlyBudgetSummary(
      month,
      [budget(expenseCategoryId, month, 10_000), budget(foodCategoryId, month, 5_000)],
      categories,
      [
        transaction(
          '20000000-0000-4000-8000-000000000001',
          'expense',
          7_000,
          '2026-10-02',
          expenseCategoryId,
        ),
        transaction(
          '20000000-0000-4000-8000-000000000002',
          'expense',
          6_000,
          '2026-10-15',
          foodCategoryId,
        ),
        transaction(
          '20000000-0000-4000-8000-000000000003',
          'income',
          50_000,
          '2026-10-10',
          incomeCategoryId,
        ),
        transaction(
          '20000000-0000-4000-8000-000000000004',
          'adjustment',
          -4_000,
          '2026-10-12',
          null,
        ),
        transaction(
          '20000000-0000-4000-8000-000000000005',
          'expense',
          9_000,
          '2026-09-30',
          expenseCategoryId,
        ),
        transaction(
          '20000000-0000-4000-8000-000000000006',
          'expense',
          30_000,
          '2026-10-15',
          expenseCategoryId,
          timestamp,
        ),
      ],
      new Date(2026, 9, 15),
    )

    expect(summary).toMatchObject({
      month,
      totalBudgeted: 15_000,
      totalSpent: 13_000,
      remaining: 2_000,
      daysRemaining: 17,
    })
    expect(summary.remainingPerDay).toBeCloseTo(2_000 / 17)
    expect(summary.categories).toMatchObject([
      {
        categoryId: expenseCategoryId,
        categoryName: 'Logement',
        budgetAmount: 10_000,
        spentAmount: 7_000,
        remainingAmount: 3_000,
        progressPercentage: 70,
        isOverBudget: false,
      },
      {
        categoryId: foodCategoryId,
        categoryName: 'Alimentation',
        budgetAmount: 5_000,
        spentAmount: 6_000,
        remainingAmount: -1_000,
        progressPercentage: 100,
        isOverBudget: true,
      },
    ])
  })

  it('inclut les catégories sans budget dans les dépenses mais pas dans les plafonds', () => {
    const summary = calculateMonthlyBudgetSummary(
      month,
      [budget(expenseCategoryId, month, 10_000)],
      categories,
      [
        transaction(
          '20000000-0000-4000-8000-000000000011',
          'expense',
          2_500,
          '2026-10-14',
          foodCategoryId,
        ),
      ],
      new Date(2026, 9, 14),
    )

    expect(summary.totalBudgeted).toBe(10_000)
    expect(summary.totalSpent).toBe(2_500)
    expect(summary.remaining).toBe(7_500)
    expect(summary.categories.find((item) => item.categoryId === foodCategoryId)).toMatchObject({
      budgetAmount: null,
      spentAmount: 2_500,
      remainingAmount: null,
      isOverBudget: false,
    })
  })

  it('compte les dépenses et remboursements sans catégorie une fois dans le budget global', () => {
    const summary = calculateMonthlyBudgetSummary(
      month,
      [budget(foodCategoryId, month, 10_000)],
      categories,
      [
        transaction('20000000-0000-4000-8000-000000000031', 'expense', 2_000, '2026-10-02', null),
        transaction('20000000-0000-4000-8000-000000000032', 'refund', 500, '2026-10-03', null),
        transaction(
          '20000000-0000-4000-8000-000000000033',
          'income',
          10_000,
          '2026-10-04',
          incomeCategoryId,
        ),
        transaction(
          '20000000-0000-4000-8000-000000000034',
          'adjustment',
          3_000,
          '2026-10-05',
          null,
        ),
      ],
      new Date(2026, 9, 15),
    )

    expect(summary).toMatchObject({
      totalBudgeted: 10_000,
      totalSpent: 1_500,
      remaining: 8_500,
    })
    expect(summary.categories.find((item) => item.categoryId === foodCategoryId)).toMatchObject({
      spentAmount: 0,
      remainingAmount: 10_000,
    })
  })

  it('ignore les budgets supprimés et ne divise pas par zéro pour un mois terminé', () => {
    const summary = calculateMonthlyBudgetSummary(
      '2026-09-01',
      [budget(expenseCategoryId, '2026-09-01', 8_000, timestamp)],
      categories,
      [
        transaction(
          '20000000-0000-4000-8000-000000000012',
          'expense',
          3_000,
          '2026-09-15',
          expenseCategoryId,
        ),
      ],
      new Date(2026, 9, 15),
    )

    expect(summary).toMatchObject({
      totalBudgeted: 0,
      totalSpent: 3_000,
      remaining: -3_000,
      remainingPerDay: 0,
      daysRemaining: 0,
    })
  })

  it('déduit les remboursements des dépenses nettes et traite un seuil nul', () => {
    const summary = calculateMonthlyBudgetSummary(
      month,
      [budget(foodCategoryId, month, 0)],
      categories,
      [
        transaction(
          '20000000-0000-4000-8000-000000000021',
          'expense',
          2_000,
          '2026-10-02',
          foodCategoryId,
        ),
        transaction(
          '20000000-0000-4000-8000-000000000022',
          'refund',
          500,
          '2026-10-03',
          foodCategoryId,
        ),
      ],
      new Date(2026, 9, 15),
    )

    expect(summary.totalSpent).toBe(1_500)
    expect(summary.categories.find((item) => item.categoryId === foodCategoryId)).toMatchObject({
      spentAmount: 1_500,
      remainingAmount: -1_500,
      progressPercentage: 100,
      isOverBudget: true,
    })

    const unusedZeroThreshold = calculateMonthlyBudgetSummary(
      month,
      [budget(foodCategoryId, month, 0)],
      categories,
      [],
      new Date(2026, 9, 15),
    )
    expect(
      unusedZeroThreshold.categories.find((item) => item.categoryId === foodCategoryId),
    ).toMatchObject({
      spentAmount: 0,
      progressPercentage: 0,
      isOverBudget: false,
    })
  })

  it('gère les mois courts, le changement d’année et les mois à venir', () => {
    expect(shiftMonth('2026-01-01', -1)).toBe('2025-12-01')
    expect(shiftMonth('2026-12-01', 1)).toBe('2027-01-01')
    expect(monthKeyForDate(new Date(2026, 1, 28))).toBe('2026-02-01')

    const future = calculateMonthlyBudgetSummary(
      '2026-02-01',
      [],
      categories,
      [],
      new Date(2026, 0, 31),
    )
    expect(future.daysRemaining).toBe(28)
    expect(future.remainingPerDay).toBe(0)
  })

  it('refuse une clé de mois invalide', () => {
    expect(() => shiftMonth('2026-13-01', 1)).toThrow('Invalid budget month')
    expect(() =>
      calculateMonthlyBudgetSummary('2026-02-30', [], categories, [], new Date()),
    ).toThrow('Invalid budget month')
  })
})
