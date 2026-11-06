import { describe, expect, it } from 'vitest'
import type { Budget, Transaction } from './models'
import { calculateNetExpenseTotals } from './reform-calculations'
import {
  calculateHistoryThresholdUsage,
  calculateTransactionHistorySummary,
  createEmptyTransactionHistoryFilters,
  countAdvancedTransactionHistoryFilters,
  filterAndSortTransactions,
  hasTransactionHistoryFilters,
  paginateTransactions,
  TRANSACTION_HISTORY_PAGE_SIZE,
} from './transaction-history'

const categoryId = '8ac67042-51c9-4ed2-93de-9ced9b714e3d'
const memberId = '14e06ce8-9cf7-4d68-9df4-3eea34655c28'

function createTransaction(index: number): Transaction {
  const date = new Date(Date.UTC(2026, 9, 1 + (index % 30)))
  return {
    id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    workspace_id: '74d4d0a1-2088-4071-b85d-74d7cb7620b6',
    category_id: categoryId,
    kind: 'expense',
    amount: index + 1,
    occurred_on: date.toISOString().slice(0, 10),
    note: index === 4999 ? 'Taxi aéroport' : null,
    created_by: memberId,
    updated_by: memberId,
    paid_by: memberId,
    recurring_id: null,
    recurring_month: null,
    created_at: new Date(Date.UTC(2026, 9, 1, 0, 0, index)).toISOString(),
    updated_at: new Date(Date.UTC(2026, 9, 1, 0, 0, index)).toISOString(),
    deleted_at: null,
  }
}

describe('transaction history', () => {
  it('filters expenses with refunds, shows incomes separately, and keeps adjustments in all', () => {
    const transactions: Transaction[] = [
      { ...createTransaction(1), kind: 'expense' },
      { ...createTransaction(2), kind: 'refund' },
      { ...createTransaction(3), kind: 'income' },
      { ...createTransaction(4), kind: 'adjustment', category_id: null, amount: -500 },
    ]
    const filters = createEmptyTransactionHistoryFilters()
    const getKinds = (transactionType: 'all' | 'expenses' | 'income') =>
      filterAndSortTransactions(transactions, { ...filters, transactionType }, new Map(), new Map())
        .map((transaction) => transaction.kind)
        .sort()

    expect(getKinds('expenses')).toEqual(['expense', 'refund'])
    expect(getKinds('income')).toEqual(['income'])
    expect(getKinds('all')).toEqual(['adjustment', 'expense', 'income', 'refund'])
    expect(hasTransactionHistoryFilters(filters)).toBe(false)
    expect(hasTransactionHistoryFilters({ ...filters, transactionType: 'expenses' })).toBe(true)
  })

  it('filters by category, member, and accent-insensitive text', () => {
    const transactions = [createTransaction(1), createTransaction(2), createTransaction(4999)]
    const filters = {
      ...createEmptyTransactionHistoryFilters(),
      search: 'aeroport',
      categoryId,
      memberId,
    }

    expect(
      filterAndSortTransactions(
        transactions,
        filters,
        new Map([[categoryId, 'Transport']]),
        new Map([[memberId, 'Testé']]),
      ).map((transaction) => transaction.note),
    ).toEqual(['Taxi aéroport'])
  })

  it('searches the responsible member separately from the transaction author', () => {
    const responsibleId = 'cb2157bf-3710-4b0a-9c7d-18e690a8072e'
    const transaction = { ...createTransaction(6), paid_by: responsibleId }

    expect(
      filterAndSortTransactions(
        [transaction],
        { ...createEmptyTransactionHistoryFilters(), search: 'Aïcha' },
        new Map(),
        new Map([[responsibleId, 'Aïcha']]),
      ),
    ).toEqual([transaction])
  })

  it('recherche les ajustements par leur libellé', () => {
    const adjustment: Transaction = {
      ...createTransaction(1),
      kind: 'adjustment',
      category_id: null,
      amount: -500,
    }

    expect(
      filterAndSortTransactions(
        [adjustment],
        { ...createEmptyTransactionHistoryFilters(), search: 'ajustement' },
        new Map(),
        new Map(),
      ),
    ).toEqual([adjustment])
  })

  it('searches the date as displayed in the transaction list', () => {
    const transaction = createTransaction(4999)

    expect(
      filterAndSortTransactions(
        [transaction],
        { ...createEmptyTransactionHistoryFilters(), search: '20/10/2026' },
        new Map(),
        new Map(),
      ),
    ).toEqual([transaction])
  })

  it('limits the transaction history to the selected month before applying filters', () => {
    const octoberTransaction = createTransaction(1)
    const novemberTransaction = {
      ...octoberTransaction,
      id: '00000000-0000-4000-8000-000000009999',
      occurred_on: '2026-11-01',
    }

    expect(
      filterAndSortTransactions(
        [octoberTransaction, novemberTransaction],
        createEmptyTransactionHistoryFilters(),
        new Map(),
        new Map(),
        '2026-10-01',
      ),
    ).toEqual([octoberTransaction])
  })

  it('retains category and member filters while the selected month changes', () => {
    const octoberTransaction = createTransaction(1)
    const novemberTransaction = {
      ...octoberTransaction,
      id: '00000000-0000-4000-8000-000000009999',
      occurred_on: '2026-11-01',
    }
    const wrongCategory = {
      ...novemberTransaction,
      id: '00000000-0000-4000-8000-000000009998',
      category_id: '4b8bf47b-63d6-4d72-817c-9ef3f7e65fb2',
    }
    const filters = { ...createEmptyTransactionHistoryFilters(), categoryId, memberId }

    expect(
      filterAndSortTransactions(
        [octoberTransaction, novemberTransaction, wrongCategory],
        filters,
        new Map(),
        new Map(),
        '2026-10-01',
      ),
    ).toEqual([octoberTransaction])
    expect(
      filterAndSortTransactions(
        [octoberTransaction, novemberTransaction, wrongCategory],
        filters,
        new Map(),
        new Map(),
        '2026-11-01',
      ),
    ).toEqual([novemberTransaction])
    expect(countAdvancedTransactionHistoryFilters(filters, true)).toBe(2)
    expect(countAdvancedTransactionHistoryFilters(filters, false)).toBe(1)
  })

  it('uses the same net-expense totals as the analyses logic for the same dataset', () => {
    const transactions: Transaction[] = [
      { ...createTransaction(1), kind: 'expense', amount: 2_000, recurring_id: null },
      { ...createTransaction(2), kind: 'refund', amount: 500, recurring_id: null },
      { ...createTransaction(3), kind: 'income', amount: 1_500, recurring_id: null },
      { ...createTransaction(4), kind: 'adjustment', amount: 250, category_id: null },
      { ...createTransaction(5), kind: 'expense', amount: 1_200, recurring_id: '8c4e5b00-4e90-4ef1-a8ce-12c23a182c2a' },
    ]

    const summary = calculateTransactionHistorySummary(transactions)
    const totals = calculateNetExpenseTotals(transactions)

    expect(summary.income).toBe(totals.income)
    expect(summary.netExpenses).toBe(totals.netExpenses)
    expect(summary.net).toBe(totals.net)
    expect(summary.adjustments).toBe(totals.adjustments)
    expect(summary.count).toBe(transactions.length)
  })

  it('computes threshold usage without counting forfaits or adjustments', () => {
    const thresholdDate = '2026-11-02'
    const transactions: Transaction[] = [
      { ...createTransaction(1), occurred_on: thresholdDate, kind: 'expense', amount: 1_200 },
      { ...createTransaction(2), occurred_on: thresholdDate, kind: 'refund', amount: 300 },
      { ...createTransaction(3), occurred_on: thresholdDate, kind: 'adjustment', amount: 50, category_id: null },
      {
        ...createTransaction(4),
        occurred_on: thresholdDate,
        kind: 'expense',
        amount: 900,
        recurring_id: '8c4e5b00-4e90-4ef1-a8ce-12c23a182c2a',
      },
    ]
    const budgets: Budget[] = [
      {
        id: '0e0c97be-a919-4bc4-83d0-2f04fef2cb77',
        workspace_id: '74d4d0a1-2088-4071-b85d-74d7cb7620b6',
        category_id: null,
        month: null,
        period: 'day',
        enabled: true,
        limit_amount: 2_000,
        created_at: '2026-11-01T00:00:00.000Z',
        updated_at: '2026-11-01T00:00:00.000Z',
        deleted_at: null,
      },
    ]

    const usage = calculateHistoryThresholdUsage(
      transactions,
      budgets,
      thresholdDate,
      thresholdDate,
      'day',
    )

    expect(usage).not.toBeNull()
    expect(usage?.spentAmount).toBe(900)
    expect(usage?.limitAmount).toBe(2_000)
    expect(usage?.status).toBe('under')
    expect(usage?.progressPercentage).toBe(45)
  })

  it('returns no threshold when the period is empty or no matching budget exists', () => {
    const thresholdDate = '2026-11-02'
    const emptyUsage = calculateHistoryThresholdUsage([], [], thresholdDate, thresholdDate, 'day')
    const noMatchingBudget = calculateHistoryThresholdUsage(
      [createTransaction(1)],
      [
        {
          id: 'd7e7d1ee-f501-43c6-915e-8e68d3a7b146',
          workspace_id: '74d4d0a1-2088-4071-b85d-74d7cb7620b6',
          category_id: null,
          month: null,
          period: 'week',
          enabled: true,
          limit_amount: 1_000,
          created_at: '2026-11-01T00:00:00.000Z',
          updated_at: '2026-11-01T00:00:00.000Z',
          deleted_at: null,
        },
      ],
      thresholdDate,
      thresholdDate,
      'day',
    )

    expect(calculateTransactionHistorySummary([])).toEqual({
      income: 0,
      netExpenses: 0,
      net: 0,
      adjustments: 0,
      count: 0,
    })
    expect(emptyUsage).toBeNull()
    expect(noMatchingBudget).toBeNull()
  })

  it('keeps a 5,000-transaction history bounded to 50 visible rows per page', () => {
    const transactions = Array.from({ length: 5000 }, (_, index) => createTransaction(index))
    const filtered = filterAndSortTransactions(
      transactions,
      createEmptyTransactionHistoryFilters(),
      new Map(),
      new Map(),
    )
    const firstPage = paginateTransactions(filtered, 1)
    const lastPage = paginateTransactions(filtered, 1000)

    expect(filtered).toHaveLength(5000)
    expect(firstPage.items).toHaveLength(TRANSACTION_HISTORY_PAGE_SIZE)
    expect(firstPage.pageCount).toBe(100)
    expect(lastPage.page).toBe(100)
    expect(lastPage.items).toHaveLength(50)
  })
})
