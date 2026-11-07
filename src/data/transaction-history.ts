import type { Budget, Transaction } from './models'
import { calculateNetExpenseTotals } from './reform-calculations'

export const TRANSACTION_HISTORY_PAGE_SIZE = 50

export type TransactionTypeFilter = 'all' | 'expenses' | 'income'

export interface TransactionHistorySummary {
  income: number
  netExpenses: number
  net: number
  adjustments: number
  count: number
}

export interface ThresholdUsageSummary {
  spentAmount: number
  limitAmount: number
  progressPercentage: number
  status: 'under' | 'alert' | 'over'
}

export interface TransactionHistoryFilters {
  transactionType: TransactionTypeFilter
  search: string
  categoryId: string
  memberId: string
}

const defaultTransactionHistoryFilters: TransactionHistoryFilters = {
  transactionType: 'all',
  search: '',
  categoryId: '',
  memberId: '',
}

function normalizeSearchText(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase('fr')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
}

function transactionKindLabel(kind: Transaction['kind']): string {
  switch (kind) {
    case 'expense':
      return 'dépense'
    case 'refund':
      return 'remboursement'
    case 'income':
      return 'revenu'
    case 'adjustment':
      return 'ajustement'
  }
}

export function hasTransactionHistoryFilters(filters: TransactionHistoryFilters): boolean {
  return (
    filters.transactionType !== 'all' ||
    filters.search !== '' ||
    filters.categoryId !== '' ||
    filters.memberId !== ''
  )
}

export function countAdvancedTransactionHistoryFilters(
  filters: Pick<TransactionHistoryFilters, 'categoryId' | 'memberId'>,
  includeMember: boolean,
): number {
  return Number(filters.categoryId !== '') + Number(includeMember && filters.memberId !== '')
}

export function calculateTransactionHistorySummary(
  transactions: Transaction[],
): TransactionHistorySummary {
  const totals = calculateNetExpenseTotals(transactions)
  return {
    income: totals.income,
    netExpenses: totals.netExpenses,
    net: totals.net,
    adjustments: totals.adjustments,
    count: transactions.length,
  }
}

export function calculateHistoryThresholdUsage(
  transactions: Transaction[],
  budgets: Budget[],
  periodStart: string,
  periodEnd: string,
  periodType: 'day' | 'week',
): ThresholdUsageSummary | null {
  const budget = budgets.find(
    (item) =>
      item.deleted_at === null &&
      item.enabled &&
      item.period === periodType &&
      item.category_id === null &&
      item.limit_amount > 0,
  )
  if (!budget) return null

  const thresholdTransactions = transactions.filter(
    (transaction) =>
      transaction.deleted_at === null &&
      transaction.occurred_on >= periodStart &&
      transaction.occurred_on <= periodEnd &&
      transaction.kind !== 'adjustment' &&
      transaction.kind !== 'income' &&
      transaction.recurring_id === null,
  )

  const totals = calculateNetExpenseTotals(thresholdTransactions)
  const spentAmount = totals.netExpenses
  const progressPercentage =
    budget.limit_amount === 0 ? (spentAmount > 0 ? 100 : 0) : Math.max(0, Math.min((spentAmount / budget.limit_amount) * 100, 100))
  const status: ThresholdUsageSummary['status'] =
    spentAmount > budget.limit_amount ? 'over' : progressPercentage >= 80 ? 'alert' : 'under'

  return {
    spentAmount,
    limitAmount: budget.limit_amount,
    progressPercentage,
    status,
  }
}

export function filterAndSortTransactions(
  transactions: Transaction[],
  filters: TransactionHistoryFilters,
  categoryNames: ReadonlyMap<string, string>,
  memberNames: ReadonlyMap<string, string>,
  month?: string,
): Transaction[] {
  const search = normalizeSearchText(filters.search)

  return transactions
    .filter((transaction) => {
      if (
        filters.transactionType === 'expenses' &&
        transaction.kind !== 'expense' &&
        transaction.kind !== 'refund'
      ) {
        return false
      }
      if (filters.transactionType === 'income' && transaction.kind !== 'income') return false
      if (month && !transaction.occurred_on.startsWith(`${month.slice(0, 7)}-`)) return false
      if (filters.categoryId && transaction.category_id !== filters.categoryId) return false
      if (filters.memberId && transaction.created_by !== filters.memberId) return false

      if (!search) return true

      const searchableValues = [
        categoryNames.get(transaction.category_id ?? '') ?? '',
        memberNames.get(transaction.created_by) ?? '',
        memberNames.get(transaction.paid_by) ?? '',
        transaction.note ?? '',
        String(transaction.amount),
        transaction.occurred_on,
        new Date(`${transaction.occurred_on}T00:00:00`).toLocaleDateString('fr-FR'),
        transactionKindLabel(transaction.kind),
      ]

      return searchableValues.some((value) => normalizeSearchText(value).includes(search))
    })
    .sort(
      (left, right) =>
        right.occurred_on.localeCompare(left.occurred_on) ||
        right.created_at.localeCompare(left.created_at),
    )
}

export function paginateTransactions(
  transactions: Transaction[],
  requestedPage: number,
): { items: Transaction[]; page: number; pageCount: number } {
  const pageCount = Math.max(1, Math.ceil(transactions.length / TRANSACTION_HISTORY_PAGE_SIZE))
  const page = Math.min(Math.max(1, requestedPage), pageCount)
  const start = (page - 1) * TRANSACTION_HISTORY_PAGE_SIZE

  return {
    items: transactions.slice(start, start + TRANSACTION_HISTORY_PAGE_SIZE),
    page,
    pageCount,
  }
}

export function createEmptyTransactionHistoryFilters(): TransactionHistoryFilters {
  return { ...defaultTransactionHistoryFilters }
}
