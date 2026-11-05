import type { Transaction } from './models'
import { getDayPeriod, getMonthPeriod, getWeekPeriod, type DatePeriod } from './periods'

export type TransactionGroupBy = 'none' | 'day' | 'week' | 'month'

export interface TransactionGroup {
  key: string
  label: string
  bounds: DatePeriod
  totalIncome: number
  totalExpenses: number
  totalAdjustments: number
  net: number
  count: number
  transactions: Transaction[]
}

export interface TransactionGroupingOptions {
  period?: DatePeriod
}

function addSafe(left: number, right: number): number {
  const result = left + right
  if (!Number.isSafeInteger(result)) {
    throw new RangeError('A grouped transaction total exceeds the safe integer range.')
  }
  return result
}

function formatDate(date: string, options: Intl.DateTimeFormatOptions): string {
  const year = Number(date.slice(0, 4))
  const month = Number(date.slice(5, 7))
  const day = Number(date.slice(8, 10))
  const dateValue = new Date(0)
  dateValue.setUTCFullYear(year, month - 1, day)
  dateValue.setUTCHours(0, 0, 0, 0)
  return new Intl.DateTimeFormat('fr-FR', { ...options, timeZone: 'UTC' }).format(dateValue)
}

function groupBounds(
  transactionDate: string,
  groupBy: Exclude<TransactionGroupBy, 'none'>,
  period?: DatePeriod,
): DatePeriod {
  const bounds =
    groupBy === 'day'
      ? getDayPeriod(transactionDate)
      : groupBy === 'week'
        ? getWeekPeriod(transactionDate)
        : getMonthPeriod(transactionDate)

  if (!period) return bounds
  return {
    start: bounds.start < period.start ? period.start : bounds.start,
    end: bounds.end > period.end ? period.end : bounds.end,
  }
}

function createGroup(
  key: string,
  label: string,
  bounds: DatePeriod,
  transactions: Transaction[],
): TransactionGroup {
  let totalIncome = 0
  let totalExpenses = 0
  let totalAdjustments = 0

  for (const transaction of transactions) {
    if (transaction.kind === 'income') totalIncome = addSafe(totalIncome, transaction.amount)
    if (transaction.kind === 'expense') totalExpenses = addSafe(totalExpenses, transaction.amount)
    if (transaction.kind === 'refund') totalExpenses = addSafe(totalExpenses, -transaction.amount)
    if (transaction.kind === 'adjustment') {
      totalAdjustments = addSafe(totalAdjustments, transaction.amount)
    }
  }

  const net = addSafe(addSafe(totalIncome, -totalExpenses), totalAdjustments)
  return {
    key,
    label,
    bounds,
    totalIncome,
    totalExpenses,
    totalAdjustments,
    net,
    count: transactions.length,
    transactions,
  }
}

export function groupTransactions(
  transactions: Transaction[],
  groupBy: TransactionGroupBy,
  options: TransactionGroupingOptions = {},
): TransactionGroup[] {
  const firstTransaction = transactions.at(0)
  if (!firstTransaction) return []

  if (groupBy === 'none') {
    const bounds = options.period ?? {
      start: transactions.reduce(
        (earliest, transaction) =>
          transaction.occurred_on < earliest ? transaction.occurred_on : earliest,
        firstTransaction.occurred_on,
      ),
      end: transactions.reduce(
        (latest, transaction) =>
          transaction.occurred_on > latest ? transaction.occurred_on : latest,
        firstTransaction.occurred_on,
      ),
    }
    return [createGroup('all', 'Toutes les transactions', bounds, transactions)]
  }

  const grouped = new Map<string, Transaction[]>()
  for (const transaction of transactions) {
    const fullPeriod =
      groupBy === 'day'
        ? getDayPeriod(transaction.occurred_on)
        : groupBy === 'week'
          ? getWeekPeriod(transaction.occurred_on)
          : getMonthPeriod(transaction.occurred_on)
    const key =
      groupBy === 'week'
        ? `week:${fullPeriod.start}`
        : groupBy === 'month'
          ? `month:${fullPeriod.start.slice(0, 7)}`
          : `day:${transaction.occurred_on}`
    const group = grouped.get(key)
    if (group) group.push(transaction)
    else grouped.set(key, [transaction])
  }

  return [...grouped.entries()]
    .map(([key, groupTransactions]) => {
      const firstGroupTransaction = groupTransactions.at(0)
      if (!firstGroupTransaction) return null
      const date = firstGroupTransaction.occurred_on
      const bounds = groupBounds(date, groupBy, options.period)
      const label =
        groupBy === 'day'
          ? formatDate(bounds.start, {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })
          : groupBy === 'week'
            ? `Du ${formatDate(bounds.start, { day: 'numeric', month: 'short' })} au ${formatDate(
                bounds.end,
                {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                },
              )}`
            : formatDate(bounds.start, { month: 'long', year: 'numeric' })
      return createGroup(key, label, bounds, groupTransactions)
    })
    .filter((group): group is TransactionGroup => group !== null)
    .sort((left, right) => right.bounds.start.localeCompare(left.bounds.start))
}

export function paginateTransactionGroups(
  groups: TransactionGroup[],
  requestedPage: number,
  pageSize: number,
): { groups: TransactionGroup[]; page: number; pageCount: number; totalCount: number } {
  if (!Number.isSafeInteger(pageSize) || pageSize <= 0) {
    throw new Error('Transaction page size must be a positive integer')
  }
  const totalCount = groups.reduce((total, group) => total + group.count, 0)
  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize))
  const page = Math.min(Math.max(1, requestedPage), pageCount)
  const pageStart = (page - 1) * pageSize
  const pageEnd = pageStart + pageSize
  let offset = 0
  const pageGroups: TransactionGroup[] = []

  for (const group of groups) {
    const groupStart = offset
    const groupEnd = offset + group.count
    offset = groupEnd
    const visibleStart = Math.max(pageStart, groupStart)
    const visibleEnd = Math.min(pageEnd, groupEnd)
    if (visibleStart >= visibleEnd) continue

    pageGroups.push({
      ...group,
      transactions: group.transactions.slice(visibleStart - groupStart, visibleEnd - groupStart),
    })
  }

  return { groups: pageGroups, page, pageCount, totalCount }
}
