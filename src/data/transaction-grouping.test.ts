import { describe, expect, it } from 'vitest'
import type { Transaction } from './models'
import { groupTransactions, paginateTransactionGroups } from './transaction-grouping'

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
