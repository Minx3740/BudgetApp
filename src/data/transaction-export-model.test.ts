import { describe, expect, it } from 'vitest'
import type { Category, Transaction } from './models'
import { calculateTransactionHistorySummary } from './transaction-history'
import { buildExportModel } from './transaction-export-model'

const memberId = '14e06ce8-9cf7-4d68-9df4-3eea34655c28'
const categoryId = '8ac67042-51c9-4ed2-93de-9ced9b714e3d'

const category: Category = {
  id: categoryId,
  workspace_id: '74d4d0a1-2088-4071-b85d-74d7cb7620b6',
  name: 'Alimentation',
  kind: 'expense',
  icon: null,
  color: 'var(--category-5)',
  created_at: '2026-11-01T10:00:00.000Z',
  updated_at: '2026-11-01T10:00:00.000Z',
  deleted_at: null,
  archived_at: null,
}

function transaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    workspace_id: '74d4d0a1-2088-4071-b85d-74d7cb7620b6',
    category_id: categoryId,
    kind: 'expense',
    amount: 1250,
    occurred_on: '2026-11-07',
    note: 'Marché',
    created_by: memberId,
    updated_by: memberId,
    paid_by: memberId,
    recurring_id: null,
    recurring_month: null,
    created_at: '2026-11-07T10:00:00.000Z',
    updated_at: '2026-11-07T10:00:00.000Z',
    deleted_at: null,
    ...overrides,
  }
}

const options = { period: { start: '2026-11-01', end: '2026-11-30' } }
const members = new Map([[memberId, 'Laro']])

describe('buildExportModel', () => {
  it('builds an empty model for an empty period', () => {
    const model = buildExportModel([], [category], members, options)

    expect(model).toMatchObject({
      rows: [],
      totals: {
        expenses: 0,
        recurringExpenses: 0,
        nonRecurringExpenses: 0,
        income: 0,
        adjustments: 0,
        net: 0,
        count: 0,
      },
      weeks: [],
      categories: [],
      members: [],
      includeTypeColumn: false,
      includeCreatedByColumn: false,
    })
  })

  it('sorts rows by local date and then creation time in descending order', () => {
    const model = buildExportModel(
      [
        transaction({
          id: '00000000-0000-4000-8000-000000000002',
          created_at: '2026-11-07T12:00:00.000Z',
        }),
        transaction({
          id: '00000000-0000-4000-8000-000000000003',
          occurred_on: '2026-11-06',
          created_at: '2026-11-06T15:00:00.000Z',
        }),
        transaction({ created_at: '2026-11-07T15:00:00.000Z' }),
      ],
      [category],
      members,
      options,
    )

    expect(model.rows.map((row) => row.id)).toEqual([
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000002',
      '00000000-0000-4000-8000-000000000003',
    ])
    expect(model.rows[0]).toMatchObject({
      weekday: 'sam.',
      categoryName: 'Alimentation',
      signedAmount: -1250,
    })
  })

  it('keeps weeks partial at a month boundary and sums week and day totals to the screen total', () => {
    const transactions = [
      transaction({
        occurred_on: '2026-11-01',
        amount: 200,
        created_at: '2026-11-01T10:00:00.000Z',
      }),
      transaction({
        occurred_on: '2026-11-02',
        kind: 'refund',
        amount: 50,
        created_at: '2026-11-02T10:00:00.000Z',
      }),
      transaction({
        occurred_on: '2026-11-30',
        amount: 300,
        created_at: '2026-11-30T10:00:00.000Z',
      }),
    ]
    const periodOptions = {
      period: { start: '2026-11-01', end: '2026-11-30' },
      groupByMonth: true,
    }
    const model = buildExportModel(transactions, [category], members, periodOptions)
    const weeks = model.weeks.flatMap((month) => month.weeks)
    const weekExpenseTotal = weeks.reduce((total, week) => total + week.totalExpenses, 0)
    const dayExpenseTotal = weeks
      .flatMap((week) => week.days)
      .reduce((total, day) => total + day.totalExpenses, 0)

    expect(weeks.map((week) => week.bounds)).toEqual([
      { start: '2026-11-30', end: '2026-11-30' },
      { start: '2026-11-02', end: '2026-11-08' },
      { start: '2026-11-01', end: '2026-11-01' },
    ])
    expect(weekExpenseTotal).toBe(calculateTransactionHistorySummary(transactions).netExpenses)
    expect(dayExpenseTotal).toBe(model.totals.expenses)
    expect(model.totals).toMatchObject({
      expenses: 450,
      net: -450,
      count: 3,
    })
  })

  it('counts recurring uncategorized expenses separately and handles missing notes', () => {
    const model = buildExportModel(
      [
        transaction({
          category_id: null,
          amount: 900,
          recurring_id: '8c4e5b00-4e90-4ef1-a8ce-12c23a182c2a',
          note: null,
        }),
      ],
      [category],
      members,
      options,
    )

    expect(model.rows[0]).toMatchObject({
      categoryName: 'Sans catégorie',
      note: '',
      origin: 'Forfait',
    })
    expect(model.totals).toMatchObject({
      expenses: 900,
      recurringExpenses: 900,
      nonRecurringExpenses: 0,
    })
    expect(model.categories[0]).toMatchObject({
      categoryId: null,
      categoryName: 'Sans catégorie',
      totalExpenses: 900,
      recurringExpenses: 900,
      nonRecurringExpenses: 0,
    })
  })

  it('adds Type only when needed and adds Saisi par only when the payer differs', () => {
    const allExpenses = buildExportModel([transaction()], [category], members, options)
    const withIncome = buildExportModel(
      [transaction(), transaction({ id: '00000000-0000-4000-8000-000000000002', kind: 'income' })],
      [category],
      members,
      options,
    )
    const withDifferentCreator = buildExportModel(
      [
        transaction({
          created_by: '00000000-0000-4000-8000-000000000009',
        }),
      ],
      [category],
      members,
      options,
    )

    expect(allExpenses.includeTypeColumn).toBe(false)
    expect(allExpenses.includeCreatedByColumn).toBe(false)
    expect(withIncome.includeTypeColumn).toBe(true)
    expect(withDifferentCreator.includeCreatedByColumn).toBe(true)
    expect(withDifferentCreator.rows[0]?.createdBy).toBe('Membre')
  })
})
