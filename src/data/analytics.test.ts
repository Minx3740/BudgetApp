import { describe, expect, it } from 'vitest'
import type { Budget, CashflowTransaction, Category } from './models'
import {
  calculateAnalyticsIndicators,
  calculateCategoryMonthComparison,
  calculateCategorySpending,
  calculateDailyExpenseCumulative,
  calculateSixMonthCashflow,
} from './analytics'

const workspaceId = '00000000-0000-4000-8000-000000000001'
const housingId = '00000000-0000-4000-8000-000000000002'
const foodId = '00000000-0000-4000-8000-000000000003'
const incomeCategoryId = '00000000-0000-4000-8000-000000000004'
const ownerId = '00000000-0000-4000-8000-000000000005'
const memberId = '00000000-0000-4000-8000-000000000006'
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

function budget(categoryId: string, month: string, limitAmount: number): Budget {
  return {
    id: `10000000-0000-4000-8000-${categoryId.slice(-12)}`,
    workspace_id: workspaceId,
    category_id: categoryId,
    month,
    limit_amount: limitAmount,
    created_at: timestamp,
    updated_at: timestamp,
    deleted_at: null,
  }
}

function transaction(
  id: string,
  kind: CashflowTransaction['kind'],
  amount: number,
  occurredOn: string,
  categoryId: string | null,
  options: Partial<Pick<CashflowTransaction, 'deleted_at' | 'paid_by' | 'recurring_id'>> = {},
): CashflowTransaction {
  return {
    id,
    workspace_id: workspaceId,
    category_id: categoryId,
    kind,
    amount,
    occurred_on: occurredOn,
    note: null,
    created_by: ownerId,
    paid_by: options.paid_by ?? ownerId,
    recurring_id: options.recurring_id ?? null,
    recurring_month: null,
    created_at: timestamp,
    updated_at: timestamp,
    deleted_at: options.deleted_at ?? null,
  }
}

describe('analyses de budget', () => {
  const categories = [
    category(housingId, 'Logement'),
    category(foodId, 'Alimentation'),
    category(incomeCategoryId, 'Salaire', 'income'),
  ]

  it('classe les dépenses nettes par catégorie et conserve le seuil de chaque catégorie', () => {
    const results = calculateCategorySpending(
      '2026-10-01',
      categories,
      [budget(housingId, '2026-10-01', 1_000), budget(foodId, '2026-10-01', 500)],
      [
        transaction('20000000-0000-4000-8000-000000000001', 'expense', 800, '2026-10-04', foodId),
        transaction('20000000-0000-4000-8000-000000000002', 'refund', 100, '2026-10-10', foodId),
        transaction(
          '20000000-0000-4000-8000-000000000003',
          'expense',
          700,
          '2026-10-08',
          housingId,
        ),
        transaction('20000000-0000-4000-8000-000000000004', 'expense', 200, '2026-10-12', null),
        transaction(
          '20000000-0000-4000-8000-000000000005',
          'income',
          5_000,
          '2026-10-13',
          incomeCategoryId,
        ),
        transaction('20000000-0000-4000-8000-000000000006', 'expense', 300, '2026-10-14', foodId, {
          deleted_at: timestamp,
        }),
        transaction('20000000-0000-4000-8000-000000000007', 'expense', 900, '2026-09-30', foodId),
      ],
    )

    expect(results).toEqual([
      { categoryId: foodId, name: 'Alimentation', amount: 700, threshold: 500, color: null },
      { categoryId: housingId, name: 'Logement', amount: 700, threshold: 1_000, color: null },
      { categoryId: null, name: 'Non classé', amount: 200, threshold: null, color: null },
    ])
  })

  it('compare les dépenses nettes du mois choisi au précédent', () => {
    const results = calculateCategoryMonthComparison('2026-10-01', categories, [
      transaction('20000000-0000-4000-8000-000000000011', 'expense', 700, '2026-09-02', foodId),
      transaction('20000000-0000-4000-8000-000000000012', 'refund', 100, '2026-09-10', foodId),
      transaction('20000000-0000-4000-8000-000000000013', 'expense', 900, '2026-10-03', foodId),
      transaction('20000000-0000-4000-8000-000000000014', 'expense', 250, '2026-10-05', null),
      transaction(
        '20000000-0000-4000-8000-000000000015',
        'expense',
        5_000,
        '2026-08-15',
        housingId,
      ),
    ])

    expect(results).toEqual([
      {
        categoryId: foodId,
        name: 'Alimentation',
        currentAmount: 900,
        previousAmount: 600,
      },
      {
        categoryId: null,
        name: 'Non classé',
        currentAmount: 250,
        previousAmount: 0,
      },
    ])
  })

  it('calcule les dépenses nettes cumulées jour par jour et ignore les suppressions', () => {
    const results = calculateDailyExpenseCumulative('2026-10-01', [
      transaction('20000000-0000-4000-8000-000000000021', 'expense', 500, '2026-10-02', foodId),
      transaction('20000000-0000-4000-8000-000000000022', 'expense', 300, '2026-10-02', foodId),
      transaction('20000000-0000-4000-8000-000000000023', 'refund', 100, '2026-10-03', foodId),
      transaction('20000000-0000-4000-8000-000000000024', 'expense', 900, '2026-10-04', foodId, {
        deleted_at: timestamp,
      }),
      transaction('20000000-0000-4000-8000-000000000025', 'expense', 4_000, '2026-11-01', foodId),
    ])

    expect(results).toHaveLength(31)
    expect(results.slice(0, 4)).toEqual([
      { day: 1, cumulativeAmount: 0 },
      { day: 2, cumulativeAmount: 800 },
      { day: 3, cumulativeAmount: 700 },
      { day: 4, cumulativeAmount: 700 },
    ])
    expect(results[30]).toEqual({ day: 31, cumulativeAmount: 700 })
  })

  it('produit six mois de revenus et dépenses nettes en ignorant ajustements et suppressions', () => {
    const results = calculateSixMonthCashflow('2026-10-01', [
      transaction(
        '20000000-0000-4000-8000-000000000031',
        'income',
        2_000,
        '2026-05-02',
        incomeCategoryId,
      ),
      transaction('20000000-0000-4000-8000-000000000032', 'expense', 600, '2026-05-03', foodId),
      transaction('20000000-0000-4000-8000-000000000033', 'refund', 100, '2026-05-04', foodId),
      transaction('20000000-0000-4000-8000-000000000034', 'adjustment', 400, '2026-06-01', null),
      transaction(
        '20000000-0000-4000-8000-000000000035',
        'income',
        3_000,
        '2026-10-03',
        incomeCategoryId,
        { deleted_at: timestamp },
      ),
      transaction('20000000-0000-4000-8000-000000000036', 'expense', 1_500, '2026-10-04', foodId),
    ])

    expect(results).toEqual([
      { month: '2026-05-01', income: 2_000, netExpenses: 500 },
      { month: '2026-06-01', income: 0, netExpenses: 0 },
      { month: '2026-07-01', income: 0, netExpenses: 0 },
      { month: '2026-08-01', income: 0, netExpenses: 0 },
      { month: '2026-09-01', income: 0, netExpenses: 0 },
      { month: '2026-10-01', income: 0, netExpenses: 1_500 },
    ])
  })

  it('calcule les parts, les alertes de seuil et les dépenses par responsable en espace partagé', () => {
    const results = calculateAnalyticsIndicators(
      '2026-10-01',
      [budget(housingId, '2026-10-01', 500), budget(foodId, '2026-10-01', 1_000)],
      categories,
      [
        transaction(
          '20000000-0000-4000-8000-000000000041',
          'expense',
          700,
          '2026-10-02',
          housingId,
          {
            recurring_id: '30000000-0000-4000-8000-000000000001',
          },
        ),
        transaction('20000000-0000-4000-8000-000000000042', 'expense', 850, '2026-10-04', foodId),
        transaction('20000000-0000-4000-8000-000000000043', 'expense', 200, '2026-10-08', null, {
          paid_by: memberId,
        }),
        transaction('20000000-0000-4000-8000-000000000044', 'refund', 50, '2026-10-10', null, {
          paid_by: memberId,
        }),
      ],
      true,
      [
        { id: ownerId, display_name: 'Aina' },
        { id: memberId, display_name: 'Mamy' },
      ],
    )

    expect(results).toMatchObject({
      fixedExpenses: 700,
      variableExpenses: 1_000,
      netExpenses: 1_700,
      uncategorizedExpenses: 150,
      fixedSharePercent: 41,
      variableSharePercent: 59,
      uncategorizedSharePercent: 9,
      alertThresholds: [{ categoryName: 'Alimentation', budgetAmount: 1_000, spentAmount: 850 }],
      exceededThresholds: [{ categoryName: 'Logement', budgetAmount: 500, spentAmount: 700 }],
      expensesByResponsible: [
        { userId: ownerId, name: 'Aina', netExpenses: 1_550 },
        { userId: memberId, name: 'Mamy', netExpenses: 150 },
      ],
    })
  })
})
