import type { Category, Transaction } from './models'
import type { DatePeriod } from './periods'
import { calculateNetExpenseTotals } from './reform-calculations'
import { calculateTransactionHistorySummary } from './transaction-history'
import { groupTransactionsForAgenda, type AgendaMonthGroup } from './transaction-grouping'

export interface TransactionExportModelOptions {
  period: DatePeriod
  groupByMonth?: boolean
}

export interface TransactionExportRow {
  id: string
  occurredOn: string
  weekday: string
  categoryId: string | null
  categoryName: string
  categoryColor: string | null
  note: string
  responsibleId: string
  responsible: string
  createdById: string
  createdBy: string
  kind: Transaction['kind']
  signedAmount: number
  origin: 'Forfait' | 'Manuelle'
}

export interface TransactionExportCategoryTotal {
  categoryId: string | null
  categoryName: string
  categoryColor: string | null
  transactionCount: number
  nonRecurringExpenseTransactionCount: number
  totalExpenses: number
  recurringExpenses: number
  nonRecurringExpenses: number
  income: number
  percentageOfNonRecurringExpenses: number
}

export interface TransactionExportMemberTotal {
  responsible: string
  transactionCount: number
  totalExpenses: number
  recurringExpenses: number
  nonRecurringExpenses: number
}

export interface TransactionExportModel {
  rows: TransactionExportRow[]
  totals: {
    expenses: number
    recurringExpenses: number
    nonRecurringExpenses: number
    income: number
    adjustments: number
    net: number
    count: number
  }
  weeks: AgendaMonthGroup[]
  categories: TransactionExportCategoryTotal[]
  members: TransactionExportMemberTotal[]
  includeTypeColumn: boolean
  includeCreatedByColumn: boolean
}

function buildMemberTotals(
  transactions: Transaction[],
  members: ReadonlyMap<string, string>,
): TransactionExportMemberTotal[] {
  const transactionsByMember = new Map<string, Transaction[]>()
  for (const transaction of transactions) {
    const name = formatMemberName(members, transaction.paid_by)
    const rows = transactionsByMember.get(name)
    if (rows) rows.push(transaction)
    else transactionsByMember.set(name, [transaction])
  }

  return [...transactionsByMember.entries()]
    .map(([name, rows]) => {
      const recurringRows = rows.filter((transaction) => transaction.recurring_id !== null)
      const nonRecurringRows = rows.filter((transaction) => transaction.recurring_id === null)

      return {
        responsible: name,
        transactionCount: rows.length,
        totalExpenses: calculateTransactionHistorySummary(rows).netExpenses,
        recurringExpenses: netExpenses(recurringRows),
        nonRecurringExpenses: netExpenses(nonRecurringRows),
      }
    })
    .sort((left, right) => left.responsible.localeCompare(right.responsible, 'fr'))
}

function signedAmount(transaction: Transaction): number {
  return transaction.kind === 'expense' ? -transaction.amount : transaction.amount
}

function weekdayLabel(date: string): string {
  const dateValue = new Date(`${date}T00:00:00.000Z`)
  return new Intl.DateTimeFormat('fr-FR', {
    weekday: 'short',
    timeZone: 'UTC',
  }).format(dateValue)
}

function formatMemberName(members: ReadonlyMap<string, string>, memberId: string): string {
  return members.get(memberId)?.trim() || 'Membre'
}

function netExpenses(transactions: Transaction[]): number {
  return calculateNetExpenseTotals(
    transactions.filter(
      (transaction) => transaction.kind === 'expense' || transaction.kind === 'refund',
    ),
  ).netExpenses
}

function buildCategoryTotals(
  transactions: Transaction[],
  categories: Category[],
): TransactionExportCategoryTotal[] {
  const categoryById = new Map(categories.map((category) => [category.id, category]))
  const transactionsByCategory = new Map<string | null, Transaction[]>()

  for (const transaction of transactions) {
    const categoryId = transaction.category_id
    const categoryTransactions = transactionsByCategory.get(categoryId)
    if (categoryTransactions) categoryTransactions.push(transaction)
    else transactionsByCategory.set(categoryId, [transaction])
  }

  const totals = [...transactionsByCategory.entries()].map(([categoryId, rows]) => {
    const category = categoryId ? categoryById.get(categoryId) : undefined
    const recurringRows = rows.filter((transaction) => transaction.recurring_id !== null)
    const nonRecurringRows = rows.filter((transaction) => transaction.recurring_id === null)
    const expenses = netExpenses(rows)
    const recurring = netExpenses(recurringRows)
    const nonRecurring = netExpenses(nonRecurringRows)
    const income = calculateNetExpenseTotals(rows).income

    return {
      categoryId,
      categoryName: category?.name ?? 'Sans catégorie',
      categoryColor: category?.color ?? null,
      transactionCount: rows.length,
      nonRecurringExpenseTransactionCount: nonRecurringRows.filter(
        (transaction) => transaction.kind === 'expense' || transaction.kind === 'refund',
      ).length,
      totalExpenses: expenses,
      recurringExpenses: recurring,
      nonRecurringExpenses: nonRecurring,
      income,
      percentageOfNonRecurringExpenses: 0,
    }
  })

  const nonRecurringTotal = Math.max(
    0,
    netExpenses(transactions.filter((transaction) => transaction.recurring_id === null)),
  )

  for (const category of totals) {
    category.percentageOfNonRecurringExpenses =
      nonRecurringTotal > 0
        ? (Math.max(0, category.nonRecurringExpenses) / nonRecurringTotal) * 100
        : 0
  }

  return totals.sort((left, right) => {
    if (left.categoryId === null) return right.categoryId === null ? 0 : 1
    if (right.categoryId === null) return -1
    return (
      right.totalExpenses - left.totalExpenses ||
      left.categoryName.localeCompare(right.categoryName, 'fr')
    )
  })
}

export function buildExportModel(
  transactions: Transaction[],
  categories: Category[],
  members: ReadonlyMap<string, string>,
  options: TransactionExportModelOptions,
): TransactionExportModel {
  const sortedTransactions = [...transactions].sort(
    (left, right) =>
      right.occurred_on.localeCompare(left.occurred_on) ||
      right.created_at.localeCompare(left.created_at) ||
      right.id.localeCompare(left.id),
  )
  const categoryById = new Map(categories.map((category) => [category.id, category]))
  const rows = sortedTransactions.map((transaction) => {
    const category = transaction.category_id ? categoryById.get(transaction.category_id) : undefined

    return {
      id: transaction.id,
      occurredOn: transaction.occurred_on,
      weekday: weekdayLabel(transaction.occurred_on),
      categoryId: transaction.category_id,
      categoryName: category?.name ?? 'Sans catégorie',
      categoryColor: category?.color ?? null,
      note: transaction.note ?? '',
      responsibleId: transaction.paid_by,
      responsible: formatMemberName(members, transaction.paid_by),
      createdById: transaction.created_by,
      createdBy: formatMemberName(members, transaction.created_by),
      kind: transaction.kind,
      signedAmount: signedAmount(transaction),
      origin: transaction.recurring_id === null ? ('Manuelle' as const) : ('Forfait' as const),
    }
  })
  const totals = calculateTransactionHistorySummary(sortedTransactions)
  const recurringTransactions = sortedTransactions.filter(
    (transaction) => transaction.recurring_id !== null,
  )
  const nonRecurringTransactions = sortedTransactions.filter(
    (transaction) => transaction.recurring_id === null,
  )
  const totalAmounts = calculateNetExpenseTotals(sortedTransactions)

  return {
    rows,
    totals: {
      expenses: totals.netExpenses,
      recurringExpenses: netExpenses(recurringTransactions),
      nonRecurringExpenses: netExpenses(nonRecurringTransactions),
      income: totalAmounts.income,
      adjustments: totalAmounts.adjustments,
      net: totals.net,
      count: totals.count,
    },
    weeks: groupTransactionsForAgenda(sortedTransactions, {
      period: options.period,
      groupByMonth: options.groupByMonth,
    }),
    categories: buildCategoryTotals(sortedTransactions, categories),
    members: buildMemberTotals(sortedTransactions, members),
    includeTypeColumn: sortedTransactions.some((transaction) => transaction.kind !== 'expense'),
    includeCreatedByColumn: sortedTransactions.some(
      (transaction) => transaction.created_by !== transaction.paid_by,
    ),
  }
}
