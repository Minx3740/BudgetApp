import { describe, expect, it } from 'vitest'
import type { Transaction } from './models'
import { getMonthPeriod } from './periods'
import {
  getTransactionAgendaExpandedKeys,
  groupTransactions,
  groupTransactionsForAgenda,
  paginateTransactionGroups,
} from './transaction-grouping'
import { calculateTransactionHistorySummary } from './transaction-history'

const baseTransaction: Transaction = {
  id: '00000000-0000-4000-8000-000000000001',
  workspace_id: '00000000-0000-4000-8000-000000000002',
  category_id: null,
  kind: 'expense',
  amount: 100,
  occurred_on: '2026-11-01',
  note: null,
  created_by: '00000000-0000-4000-8000-000000000003',
  updated_by: '00000000-0000-4000-8000-000000000003',
  paid_by: '00000000-0000-4000-8000-000000000003',
  recurring_id: null,
  recurring_month: null,
  created_at: '2026-11-01T10:00:00.000Z',
  updated_at: '2026-11-01T10:00:00.000Z',
  deleted_at: null,
}

function transaction(
  id: number,
  occurredOn: string,
  kind: Transaction['kind'],
  amount: number,
): Transaction {
  return {
    ...baseTransaction,
    id: `00000000-0000-4000-8000-${String(id).padStart(12, '0')}`,
    occurred_on: occurredOn,
    kind,
    amount,
  }
}

describe('groupTransactions', () => {
  it('groups by day, week, and month while retaining each group totals', () => {
    const transactions = [
      transaction(1, '2026-11-01', 'expense', 100),
      transaction(2, '2026-11-02', 'income', 400),
      transaction(3, '2026-11-03', 'refund', 25),
      transaction(4, '2026-11-03', 'adjustment', -10),
    ]

    expect(groupTransactions(transactions, 'day')).toHaveLength(3)
    const weeks = groupTransactions(transactions, 'week', {
      period: { start: '2026-11-01', end: '2026-11-30' },
    })

    expect(weeks).toHaveLength(2)
    const [laterWeek, earlierWeek] = weeks
    expect(laterWeek?.bounds).toEqual({ start: '2026-11-02', end: '2026-11-08' })
    expect(earlierWeek?.bounds).toEqual({ start: '2026-11-01', end: '2026-11-01' })
    expect(laterWeek).toMatchObject({
      totalIncome: 400,
      totalExpenses: -25,
      totalAdjustments: -10,
      net: 415,
      count: 3,
    })
    expect(groupTransactions(transactions, 'month')).toHaveLength(1)
  })

  it('keeps transactions in the ungrouped collection and supports empty periods', () => {
    expect(groupTransactions([], 'day')).toEqual([])
    expect(
      groupTransactions([transaction(1, '2026-11-01', 'expense', 100)], 'none')[0],
    ).toMatchObject({
      key: 'all',
      count: 1,
      totalExpenses: 100,
    })
  })

  it('paginates large groups without changing their full-period totals', () => {
    const transactions = Array.from({ length: 60 }, (_, index) =>
      transaction(index + 1, '2026-11-01', 'expense', 10),
    )
    const groups = groupTransactions(transactions, 'day')
    const page = paginateTransactionGroups(groups, 2, 50)

    expect(page.pageCount).toBe(2)
    expect(page.totalCount).toBe(60)
    const visibleGroup = page.groups.at(0)
    expect(visibleGroup?.transactions).toHaveLength(10)
    expect(visibleGroup?.count).toBe(60)
    expect(visibleGroup?.totalExpenses).toBe(600)
  })
})

describe('groupTransactionsForAgenda', () => {
  it('splits a cross-month week into month-bounded partial weeks', () => {
    const groups = groupTransactionsForAgenda(
      [transaction(1, '2026-10-31', 'expense', 100), transaction(2, '2026-11-01', 'expense', 200)],
      { period: { start: '2026-10-26', end: '2026-11-08' } },
    )

    expect(groups).toHaveLength(2)
    expect(groups[0]?.weeks[0]).toMatchObject({
      bounds: { start: '2026-11-01', end: '2026-11-01' },
      totalExpenses: 200,
    })
    expect(groups[1]?.weeks[0]).toMatchObject({
      bounds: { start: '2026-10-26', end: '2026-10-31' },
      totalExpenses: 100,
    })
    expect(groups[0]?.weeks[0]?.key).not.toBe(groups[1]?.weeks[0]?.key)
  })

  it('keeps a selected cross-month week as one full week group', () => {
    const groups = groupTransactionsForAgenda(
      [transaction(1, '2026-10-31', 'expense', 100), transaction(2, '2026-11-01', 'expense', 200)],
      {
        period: { start: '2026-10-26', end: '2026-11-01' },
        groupByMonth: false,
      },
    )

    expect(groups).toHaveLength(1)
    expect(groups[0]?.weeks).toHaveLength(1)
    expect(groups[0]?.weeks[0]).toMatchObject({
      key: 'week:2026-10-26',
      bounds: { start: '2026-10-26', end: '2026-11-01' },
      count: 2,
    })
  })

  it('clips the first and last weeks to the selected month', () => {
    const period = getMonthPeriod('2026-11')
    const groups = groupTransactionsForAgenda(
      [transaction(1, '2026-11-01', 'expense', 100), transaction(2, '2026-11-30', 'expense', 200)],
      { period },
    )
    const weeks = groups.flatMap((month) => month.weeks)

    expect(weeks.map((week) => week.bounds)).toEqual([
      { start: '2026-11-30', end: '2026-11-30' },
      { start: '2026-11-01', end: '2026-11-01' },
    ])
  })

  it('uses the stored local date rather than converting the creation timestamp', () => {
    const lateLocalTransaction = {
      ...transaction(1, '2026-11-02', 'expense', 100),
      created_at: '2026-11-02T20:30:00.000Z',
    }

    expect(
      new Intl.DateTimeFormat('fr-FR', {
        dateStyle: 'short',
        timeZone: 'Indian/Antananarivo',
      }).format(new Date(lateLocalTransaction.created_at)),
    ).toContain('02/11/2026')
    expect(
      groupTransactionsForAgenda([lateLocalTransaction], {
        period: getMonthPeriod('2026-11'),
      })[0]?.weeks[0]?.days[0]?.date,
    ).toBe('2026-11-02')
  })

  it('returns no month or week groups for an empty period', () => {
    expect(
      groupTransactionsForAgenda([], {
        period: getMonthPeriod('2026-11'),
      }),
    ).toEqual([])
  })

  it('preserves the full-period net expense total across all weeks', () => {
    const transactions = [
      transaction(1, '2026-11-01', 'expense', 100),
      transaction(2, '2026-11-02', 'refund', 25),
      transaction(3, '2026-11-30', 'adjustment', -10),
    ]
    const weeks = groupTransactionsForAgenda(transactions, {
      period: getMonthPeriod('2026-11'),
    }).flatMap((month) => month.weeks)

    expect(weeks.reduce((total, week) => total + week.totalExpenses, 0)).toBe(
      calculateTransactionHistorySummary(transactions).netExpenses,
    )
  })

  it('opens all result months and weeks when a filter is active', () => {
    const groups = groupTransactionsForAgenda(
      [transaction(1, '2026-10-31', 'expense', 100), transaction(2, '2026-11-02', 'expense', 200)],
      { period: { start: '2026-10-26', end: '2026-11-08' } },
    )

    expect(getTransactionAgendaExpandedKeys(groups, true, '2026-11-04')).toEqual({
      monthKeys: groups.map((group) => group.key),
      weekKeys: groups.flatMap((group) => group.weeks.map((week) => week.key)),
    })
    expect(getTransactionAgendaExpandedKeys(groups, false, '2026-11-04').weekKeys).toEqual([
      groups[0]?.weeks[0]?.key,
    ])
  })
})
