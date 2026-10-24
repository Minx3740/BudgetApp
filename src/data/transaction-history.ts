import type { Transaction } from './models'

export const TRANSACTION_HISTORY_PAGE_SIZE = 50

export interface TransactionHistoryFilters {
  search: string
  startDate: string
  endDate: string
  categoryId: string
  memberId: string
}

const defaultTransactionHistoryFilters: TransactionHistoryFilters = {
  search: '',
  startDate: '',
  endDate: '',
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
  return Object.values(filters).some((value) => value !== '')
}

export function filterAndSortTransactions(
  transactions: Transaction[],
  filters: TransactionHistoryFilters,
  categoryNames: ReadonlyMap<string, string>,
  memberNames: ReadonlyMap<string, string>,
): Transaction[] {
  const search = normalizeSearchText(filters.search)

  return transactions
    .filter((transaction) => {
      if (filters.startDate && transaction.occurred_on < filters.startDate) return false
      if (filters.endDate && transaction.occurred_on > filters.endDate) return false
      if (filters.categoryId && transaction.category_id !== filters.categoryId) return false
      if (filters.memberId && transaction.created_by !== filters.memberId) return false

      if (!search) return true

      const searchableValues = [
        categoryNames.get(transaction.category_id ?? '') ?? '',
        memberNames.get(transaction.created_by) ?? '',
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
