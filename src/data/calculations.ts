import type { Budget, Category, Transaction } from './models'

export interface BudgetCategorySummary {
  categoryId: string
  categoryName: string
  budgetAmount: number | null
  spentAmount: number
  thresholdSpentAmount: number
  remainingAmount: number | null
  progressPercentage: number
  isOverBudget: boolean
}

export interface MonthlyBudgetSummary {
  month: string
  totalBudgeted: number
  totalSpent: number
  remaining: number
  categories: BudgetCategorySummary[]
}

export interface RemainingPerDay {
  state: 'available' | 'deficit' | 'month-ended'
  dailyAmount: number | null
  deficitAmount: number | null
  daysRemaining: number
}

function addSafe(left: number, right: number): number {
  const result = left + right
  if (!Number.isSafeInteger(result)) {
    throw new RangeError('A calculated amount exceeds the safe integer range.')
  }
  return result
}

function subtractSafe(left: number, right: number): number {
  const result = left - right
  if (!Number.isSafeInteger(result)) {
    throw new RangeError('A calculated amount exceeds the safe integer range.')
  }
  return result
}

export function monthKeyForDate(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${year}-${month}-01`
}

export function shiftMonth(month: string, offset: number): string {
  const date = new Date(`${month}T00:00:00.000Z`)
  if (
    !/^\d{4}-\d{2}-01$/.test(month) ||
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== month
  ) {
    throw new Error(`Invalid budget month: ${month}`)
  }

  date.setUTCMonth(date.getUTCMonth() + offset)
  return date.toISOString().slice(0, 10)
}

export function calculateMonthlyBudgetSummary(
  month: string,
  budgets: Budget[],
  categories: Category[],
  transactions: Transaction[],
): MonthlyBudgetSummary {
  const monthDate = new Date(`${month}T00:00:00.000Z`)
  if (
    !/^\d{4}-\d{2}-01$/.test(month) ||
    Number.isNaN(monthDate.getTime()) ||
    monthDate.toISOString().slice(0, 10) !== month
  ) {
    throw new Error(`Invalid budget month: ${month}`)
  }

  const monthPrefix = month.slice(0, 7)
  const monthBudgets = budgets.filter(
    (budget) =>
      budget.period === 'month' &&
      budget.month === month &&
      budget.enabled &&
      budget.deleted_at === null,
  )
  const categoryMonthBudgets = monthBudgets.filter((budget) => budget.category_id !== null)
  const categoryBudgets = new Map(
    categoryMonthBudgets.map((budget) => [budget.category_id, budget.limit_amount]),
  )
  const categorySpending = new Map<string, number>()
  const thresholdCategorySpending = new Map<string, number>()
  let totalSpent = 0
  let totalThresholdSpent = 0

  for (const transaction of transactions) {
    if (
      transaction.deleted_at !== null ||
      (transaction.kind !== 'expense' && transaction.kind !== 'refund') ||
      !transaction.occurred_on.startsWith(`${monthPrefix}-`)
    ) {
      continue
    }
    const amount = transaction.kind === 'expense' ? transaction.amount : -transaction.amount
    totalSpent = addSafe(totalSpent, amount)
    if (transaction.category_id !== null) {
      categorySpending.set(
        transaction.category_id,
        addSafe(categorySpending.get(transaction.category_id) ?? 0, amount),
      )
    }
    if (transaction.recurring_id === null) {
      totalThresholdSpent = addSafe(totalThresholdSpent, amount)
      if (transaction.category_id !== null) {
        thresholdCategorySpending.set(
          transaction.category_id,
          addSafe(thresholdCategorySpending.get(transaction.category_id) ?? 0, amount),
        )
      }
    }
  }

  const categoryById = new Map(categories.map((category) => [category.id, category]))
  const categoryIds = new Set([
    ...categories.filter((category) => category.kind === 'expense').map((category) => category.id),
    ...categoryMonthBudgets
      .map((budget) => budget.category_id)
      .filter((categoryId): categoryId is string => categoryId !== null)
      .filter((categoryId) => categoryById.get(categoryId)?.kind !== 'income'),
    ...[...categorySpending.keys()].filter(
      (categoryId) => categoryById.get(categoryId)?.kind !== 'income',
    ),
  ])
  const categorySummaries = [...categoryIds]
    .map((categoryId) => {
      const budgetAmount = categoryBudgets.get(categoryId) ?? null
      const spentAmount = categorySpending.get(categoryId) ?? 0
      const thresholdSpentAmount = thresholdCategorySpending.get(categoryId) ?? 0
      return {
        categoryId,
        categoryName: categoryById.get(categoryId)?.name ?? 'Catégorie archivée',
        budgetAmount,
        spentAmount,
        thresholdSpentAmount,
        remainingAmount:
          budgetAmount === null ? null : subtractSafe(budgetAmount, thresholdSpentAmount),
        progressPercentage:
          budgetAmount === null
            ? 0
            : budgetAmount === 0
              ? thresholdSpentAmount > 0
                ? 100
                : 0
              : Math.max(0, Math.min((thresholdSpentAmount / budgetAmount) * 100, 100)),
        isOverBudget: budgetAmount !== null && thresholdSpentAmount > budgetAmount,
      }
    })
    .sort((left, right) => right.spentAmount - left.spentAmount)

  const totalBudgeted = categoryMonthBudgets.reduce(
    (total, budget) => addSafe(total, budget.limit_amount),
    0,
  )
  const remaining = subtractSafe(totalBudgeted, totalThresholdSpent)

  return {
    month,
    totalBudgeted,
    totalSpent,
    remaining,
    categories: categorySummaries,
  }
}

export function calculateRemainingPerDay(
  month: string,
  usableRemaining: number,
  today: Date = new Date(),
): RemainingPerDay {
  shiftMonth(month, 0)
  if (!Number.isSafeInteger(usableRemaining)) {
    throw new RangeError('The usable remaining amount must be a safe integer.')
  }
  if (Number.isNaN(today.getTime())) {
    throw new Error('Invalid date for remaining-per-day calculation.')
  }

  const lastDay = new Date(0)
  lastDay.setUTCFullYear(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)
  lastDay.setUTCHours(0, 0, 0, 0)
  const daysInMonth = lastDay.getUTCDate()
  const todayMonth = monthKeyForDate(today)
  const daysRemaining =
    month < todayMonth ? 0 : month > todayMonth ? daysInMonth : daysInMonth - today.getDate() + 1

  if (daysRemaining === 0) {
    return { state: 'month-ended', dailyAmount: null, deficitAmount: null, daysRemaining }
  }
  if (usableRemaining < 0) {
    return {
      state: 'deficit',
      dailyAmount: null,
      deficitAmount: -usableRemaining,
      daysRemaining,
    }
  }
  return {
    state: 'available',
    dailyAmount: Math.floor(usableRemaining / daysRemaining),
    deficitAmount: null,
    daysRemaining,
  }
}
