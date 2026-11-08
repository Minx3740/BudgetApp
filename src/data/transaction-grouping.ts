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

export interface AgendaDayGroup extends Omit<TransactionGroup, 'bounds' | 'label'> {
  date: string
  label: string
}

export interface AgendaWeekGroup extends Omit<TransactionGroup, 'label' | 'transactions'> {
  label: string
  days: AgendaDayGroup[]
  categoryIds: string[]
}

export interface AgendaMonthGroup {
  key: string
  label: string
  bounds: DatePeriod
  weeks: AgendaWeekGroup[]
}

export interface TransactionAgendaOptions {
  period: DatePeriod
  currentDate?: string
  groupByMonth?: boolean
}

export interface TransactionAgendaExpandedKeys {
  monthKeys: string[]
  weekKeys: string[]
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

function formatShortDate(date: string): string {
  return formatDate(date, { day: 'numeric', month: 'short' }).replace(/\.$/u, '')
}

function formatShortMonth(date: string): string {
  return formatDate(date, { month: 'short', year: 'numeric' })
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

export function groupTransactionsForAgenda(
  transactions: Transaction[],
  options: TransactionAgendaOptions,
): AgendaMonthGroup[] {
  if (transactions.length === 0) return []

  const groupByMonth = options.groupByMonth !== false
  const monthTransactions = new Map<string, Transaction[]>()
  for (const transaction of transactions) {
    const monthKey = groupByMonth ? transaction.occurred_on.slice(0, 7) : 'period'
    const group = monthTransactions.get(monthKey)
    if (group) group.push(transaction)
    else monthTransactions.set(monthKey, [transaction])
  }

  return [...monthTransactions.entries()]
    .map(([monthKey, monthRows]) => {
      const monthBounds = groupByMonth ? getMonthPeriod(monthKey) : options.period
      const bounds = {
        start: monthBounds.start < options.period.start ? options.period.start : monthBounds.start,
        end: monthBounds.end > options.period.end ? options.period.end : monthBounds.end,
      }
      const weeks = new Map<string, Transaction[]>()
      for (const transaction of monthRows) {
        const fullWeek = getWeekPeriod(transaction.occurred_on)
        const weekKey = groupByMonth
          ? `week:${monthKey}:${fullWeek.start}`
          : `week:${fullWeek.start}`
        const group = weeks.get(weekKey)
        if (group) group.push(transaction)
        else weeks.set(weekKey, [transaction])
      }

      const agendaWeeks = [...weeks.entries()]
        .map(([weekKey, weekRows]) => {
          const firstTransaction = weekRows[0]
          if (!firstTransaction) return null
          const fullWeekBounds = getWeekPeriod(firstTransaction.occurred_on)
          const weekBounds = {
            start: fullWeekBounds.start < bounds.start ? bounds.start : fullWeekBounds.start,
            end: fullWeekBounds.end > bounds.end ? bounds.end : fullWeekBounds.end,
          }
          const days = new Map<string, Transaction[]>()
          for (const transaction of weekRows) {
            const group = days.get(transaction.occurred_on)
            if (group) group.push(transaction)
            else days.set(transaction.occurred_on, [transaction])
          }

          const agendaDays = [...days.entries()]
            .map(([date, dayRows]) => ({
              ...createGroup(
                `day:${date}`,
                formatDate(date, { weekday: 'short', day: 'numeric', month: 'short' }),
                getDayPeriod(date),
                dayRows,
              ),
              date,
            }))
            .sort((left, right) => right.date.localeCompare(left.date))
          const totals = createGroup(weekKey, '', weekBounds, weekRows)
          return {
            key: totals.key,
            label:
              options.currentDate &&
              options.currentDate >= weekBounds.start &&
              options.currentDate <= weekBounds.end
                ? `Cette semaine · ${formatShortDate(weekBounds.start)} – ${formatShortDate(weekBounds.end)}`
                : `${formatShortDate(weekBounds.start)} – ${formatShortDate(weekBounds.end)}`,
            bounds: totals.bounds,
            totalIncome: totals.totalIncome,
            totalExpenses: totals.totalExpenses,
            totalAdjustments: totals.totalAdjustments,
            net: totals.net,
            count: totals.count,
            days: agendaDays,
            categoryIds: [
              ...new Set(weekRows.map((transaction) => transaction.category_id ?? 'uncategorized')),
            ],
          }
        })
        .filter((week): week is NonNullable<typeof week> => week !== null)
        .sort((left, right) => right.bounds.start.localeCompare(left.bounds.start))

      return {
        key: groupByMonth ? `month:${monthKey}` : 'period',
        label: formatShortMonth(bounds.start),
        bounds,
        weeks: agendaWeeks,
      }
    })
    .sort((left, right) => right.bounds.start.localeCompare(left.bounds.start))
}

export function getTransactionAgendaExpandedKeys(
  months: AgendaMonthGroup[],
  filtersActive: boolean,
  currentDate: string,
): TransactionAgendaExpandedKeys {
  const matchingWeeks = months.flatMap((month) =>
    month.weeks.filter(
      (week) =>
        filtersActive || (currentDate >= week.bounds.start && currentDate <= week.bounds.end),
    ),
  )

  return {
    monthKeys: filtersActive ? months.map((month) => month.key) : [],
    weekKeys: matchingWeeks.map((week) => week.key),
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
