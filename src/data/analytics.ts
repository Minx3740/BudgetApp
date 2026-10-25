import {
  calculateMonthlyBudgetSummary,
  shiftMonth,
  type BudgetCategorySummary,
} from './calculations'
import { calculateExpenseComposition } from './reform-calculations'
import type { Budget, CashflowTransaction, Category, Profile } from './models'

export interface CategorySpending {
  categoryId: string | null
  name: string
  amount: number
  threshold: number | null
  color: string | null
}

export interface CategoryMonthComparison {
  categoryId: string | null
  name: string
  currentAmount: number
  previousAmount: number
}

export interface DailyExpenseTotal {
  day: number
  cumulativeAmount: number
}

export interface MonthlyCashflowTotal {
  month: string
  income: number
  netExpenses: number
}

export interface ResponsibleExpense {
  userId: string
  name: string
  netExpenses: number
}

export interface AnalyticsIndicators {
  fixedExpenses: number
  variableExpenses: number
  netExpenses: number
  uncategorizedExpenses: number
  fixedSharePercent: number | null
  variableSharePercent: number | null
  uncategorizedSharePercent: number | null
  alertThresholds: BudgetCategorySummary[]
  exceededThresholds: BudgetCategorySummary[]
  expensesByResponsible: ResponsibleExpense[]
}

function addSafe(left: number, right: number): number {
  const result = left + right
  if (!Number.isSafeInteger(result)) {
    throw new RangeError('A calculated amount exceeds the safe integer range.')
  }
  return result
}

function selectedMonthTransactions(
  month: string,
  transactions: CashflowTransaction[],
): CashflowTransaction[] {
  shiftMonth(month, 0)
  const prefix = month.slice(0, 7)
  return transactions.filter(
    (transaction) =>
      transaction.deleted_at === null && transaction.occurred_on.startsWith(`${prefix}-`),
  )
}

function addExpenseAmount(totals: Map<string | null, number>, transaction: CashflowTransaction) {
  if (transaction.kind !== 'expense' && transaction.kind !== 'refund') return
  const amount = transaction.kind === 'expense' ? transaction.amount : -transaction.amount
  totals.set(transaction.category_id, addSafe(totals.get(transaction.category_id) ?? 0, amount))
}

function categoryLabel(categoryId: string | null, categoriesById: Map<string, Category>): string {
  if (categoryId === null) return 'Non classé'
  return categoriesById.get(categoryId)?.name ?? 'Catégorie archivée'
}

function categoryColor(categoryId: string | null, categoriesById: Map<string, Category>) {
  return categoryId === null ? null : (categoriesById.get(categoryId)?.color ?? null)
}

function compareByCurrentAmount<T extends { amount: number; name: string }>(
  left: T,
  right: T,
): number {
  return right.amount - left.amount || left.name.localeCompare(right.name, 'fr')
}

export function calculateCategorySpending(
  month: string,
  categories: Category[],
  budgets: Budget[],
  transactions: CashflowTransaction[],
): CategorySpending[] {
  const categoriesById = new Map(
    categories
      .filter((category) => category.kind === 'expense')
      .map((category) => [category.id, category]),
  )
  const totals = new Map<string | null, number>()
  for (const transaction of selectedMonthTransactions(month, transactions)) {
    addExpenseAmount(totals, transaction)
  }

  const thresholds = new Map(
    budgets
      .filter((budget) => budget.month === month && budget.deleted_at === null)
      .map((budget) => [budget.category_id, budget.limit_amount]),
  )
  const categoryIds = new Set<string | null>([...totals.keys(), ...thresholds.keys()])
  return [...categoryIds]
    .map((categoryId) => ({
      categoryId,
      name: categoryLabel(categoryId, categoriesById),
      amount: totals.get(categoryId) ?? 0,
      threshold: categoryId === null ? null : (thresholds.get(categoryId) ?? null),
      color: categoryColor(categoryId, categoriesById),
    }))
    .filter((item) => item.amount !== 0 || item.threshold !== null)
    .sort(compareByCurrentAmount)
}

export function calculateCategoryMonthComparison(
  month: string,
  categories: Category[],
  transactions: CashflowTransaction[],
): CategoryMonthComparison[] {
  const previousMonth = shiftMonth(month, -1)
  const previousTotals = new Map<string | null, number>()
  const currentTotals = new Map<string | null, number>()
  for (const transaction of transactions) {
    if (transaction.deleted_at !== null) continue
    const transactionMonth = `${transaction.occurred_on.slice(0, 7)}-01`
    if (transactionMonth !== month && transactionMonth !== previousMonth) continue
    const totals = transactionMonth === month ? currentTotals : previousTotals
    addExpenseAmount(totals, transaction)
  }

  const categoryIds = new Set([...currentTotals.keys(), ...previousTotals.keys()])
  const categoriesById = new Map(
    categories
      .filter((category) => category.kind === 'expense')
      .map((category) => [category.id, category]),
  )
  return [...categoryIds]
    .map((categoryId) => ({
      categoryId,
      name: categoryLabel(categoryId, categoriesById),
      currentAmount: currentTotals.get(categoryId) ?? 0,
      previousAmount: previousTotals.get(categoryId) ?? 0,
    }))
    .filter((item) => item.currentAmount !== 0 || item.previousAmount !== 0)
    .sort(
      (left, right) =>
        right.currentAmount - left.currentAmount ||
        right.previousAmount - left.previousAmount ||
        left.name.localeCompare(right.name, 'fr'),
    )
}

export function calculateDailyExpenseCumulative(
  month: string,
  transactions: CashflowTransaction[],
): DailyExpenseTotal[] {
  const monthDate = new Date(`${month}T00:00:00.000Z`)
  shiftMonth(month, 0)
  const daysInMonth = new Date(
    Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth() + 1, 0),
  ).getUTCDate()
  const dailyTotals = Array.from({ length: daysInMonth }, () => 0)
  for (const transaction of selectedMonthTransactions(month, transactions)) {
    if (transaction.kind !== 'expense' && transaction.kind !== 'refund') continue
    const dayIndex = Number(transaction.occurred_on.slice(8, 10)) - 1
    const amount = transaction.kind === 'expense' ? transaction.amount : -transaction.amount
    dailyTotals[dayIndex] = addSafe(dailyTotals[dayIndex] ?? 0, amount)
  }

  let cumulativeAmount = 0
  return dailyTotals.map((amount, index) => {
    cumulativeAmount = addSafe(cumulativeAmount, amount)
    return { day: index + 1, cumulativeAmount }
  })
}

export function calculateSixMonthCashflow(
  month: string,
  transactions: CashflowTransaction[],
): MonthlyCashflowTotal[] {
  const months = Array.from({ length: 6 }, (_, index) => shiftMonth(month, index - 5))
  const totalsByMonth = new Map(months.map((monthKey) => [monthKey, { income: 0, netExpenses: 0 }]))

  for (const transaction of transactions) {
    if (transaction.deleted_at !== null) continue
    const transactionMonth = `${transaction.occurred_on.slice(0, 7)}-01`
    const totals = totalsByMonth.get(transactionMonth)
    if (!totals) continue
    if (transaction.kind === 'income') {
      totals.income = addSafe(totals.income, transaction.amount)
    } else if (transaction.kind === 'expense') {
      totals.netExpenses = addSafe(totals.netExpenses, transaction.amount)
    } else if (transaction.kind === 'refund') {
      totals.netExpenses = addSafe(totals.netExpenses, -transaction.amount)
    }
  }

  return months.map((monthKey) => ({ month: monthKey, ...totalsByMonth.get(monthKey)! }))
}

function sharePercent(amount: number, total: number): number | null {
  return total <= 0 ? null : Math.round((amount / total) * 100)
}

export function calculateAnalyticsIndicators(
  month: string,
  budgets: Budget[],
  categories: Category[],
  transactions: CashflowTransaction[],
  isSharedWorkspace: boolean,
  profiles: Pick<Profile, 'id' | 'display_name'>[] = [],
): AnalyticsIndicators {
  const monthTransactions = selectedMonthTransactions(month, transactions)
  const composition = calculateExpenseComposition(month, monthTransactions)
  const budgetSummary = calculateMonthlyBudgetSummary(
    month,
    budgets,
    categories,
    monthTransactions,
    new Date(`${month}T15:00:00.000Z`),
  )
  const alertThresholds = budgetSummary.categories.filter(
    (item) => item.budgetAmount !== null && !item.isOverBudget && item.progressPercentage >= 80,
  )
  const exceededThresholds = budgetSummary.categories.filter((item) => item.isOverBudget)
  const expensesByResponsible = new Map<string, number>()
  if (isSharedWorkspace) {
    for (const transaction of monthTransactions) {
      if (transaction.kind !== 'expense' && transaction.kind !== 'refund') continue
      const amount = transaction.kind === 'expense' ? transaction.amount : -transaction.amount
      expensesByResponsible.set(
        transaction.paid_by,
        addSafe(expensesByResponsible.get(transaction.paid_by) ?? 0, amount),
      )
    }
  }
  const profileNames = new Map(profiles.map((profile) => [profile.id, profile.display_name.trim()]))
  const expensesByResponsibleList = [...expensesByResponsible]
    .map(([userId, netExpenses]) => ({
      userId,
      name: profileNames.get(userId) || 'Membre non identifié',
      netExpenses,
    }))
    .sort(
      (left, right) =>
        right.netExpenses - left.netExpenses || left.name.localeCompare(right.name, 'fr'),
    )

  return {
    fixedExpenses: composition.fixedExpenses,
    variableExpenses: composition.variableExpenses,
    netExpenses: composition.netExpenses,
    uncategorizedExpenses: composition.uncategorizedExpenses,
    fixedSharePercent: sharePercent(composition.fixedExpenses, composition.netExpenses),
    variableSharePercent: sharePercent(composition.variableExpenses, composition.netExpenses),
    uncategorizedSharePercent: sharePercent(
      composition.uncategorizedExpenses,
      composition.netExpenses,
    ),
    alertThresholds,
    exceededThresholds,
    expensesByResponsible: expensesByResponsibleList,
  }
}
