import type { Account, Budget, Category, Transaction } from './models'

export interface BudgetCategorySummary {
  categoryId: string
  categoryName: string
  budgetAmount: number | null
  spentAmount: number
  remainingAmount: number | null
  progressPercentage: number
  isOverBudget: boolean
}

export interface MonthlyBudgetSummary {
  month: string
  totalBudgeted: number
  totalSpent: number
  remaining: number
  remainingPerDay: number
  daysRemaining: number
  categories: BudgetCategorySummary[]
}

export function monthKeyForDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${date.getFullYear()}-${month}-01`
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
  today: Date = new Date(),
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
    (budget) => budget.month === month && budget.deleted_at === null,
  )
  const categoryBudgets = new Map(
    monthBudgets.map((budget) => [budget.category_id, budget.limit_amount]),
  )
  const categorySpending = new Map<string, number>()
  let totalSpent = 0

  for (const transaction of transactions) {
    if (
      transaction.deleted_at !== null ||
      transaction.kind !== 'expense' ||
      !transaction.occurred_on.startsWith(`${monthPrefix}-`)
    ) {
      continue
    }
    totalSpent += transaction.amount
    if (transaction.category_id !== null) {
      categorySpending.set(
        transaction.category_id,
        (categorySpending.get(transaction.category_id) ?? 0) + transaction.amount,
      )
    }
  }

  const categoryById = new Map(categories.map((category) => [category.id, category]))
  const categoryIds = new Set([
    ...categories.filter((category) => category.kind === 'expense').map((category) => category.id),
    ...monthBudgets
      .map((budget) => budget.category_id)
      .filter((categoryId) => categoryById.get(categoryId)?.kind !== 'income'),
    ...[...categorySpending.keys()].filter(
      (categoryId) => categoryById.get(categoryId)?.kind !== 'income',
    ),
  ])
  const categorySummaries = [...categoryIds]
    .map((categoryId) => {
      const budgetAmount = categoryBudgets.get(categoryId) ?? null
      const spentAmount = categorySpending.get(categoryId) ?? 0
      return {
        categoryId,
        categoryName: categoryById.get(categoryId)?.name ?? 'Catégorie archivée',
        budgetAmount,
        spentAmount,
        remainingAmount: budgetAmount === null ? null : budgetAmount - spentAmount,
        progressPercentage:
          budgetAmount === null ? 0 : Math.min((spentAmount / budgetAmount) * 100, 100),
        isOverBudget: budgetAmount !== null && spentAmount > budgetAmount,
      }
    })
    .sort((left, right) => right.spentAmount - left.spentAmount)

  const totalBudgeted = monthBudgets.reduce((total, budget) => total + budget.limit_amount, 0)
  const remaining = totalBudgeted - totalSpent
  const todayMonth = monthKeyForDate(today)
  const daysInMonth = new Date(
    Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth() + 1, 0),
  ).getUTCDate()
  const daysRemaining =
    month < todayMonth ? 0 : month > todayMonth ? daysInMonth : daysInMonth - today.getDate() + 1

  return {
    month,
    totalBudgeted,
    totalSpent,
    remaining,
    remainingPerDay: daysRemaining === 0 ? 0 : remaining / daysRemaining,
    daysRemaining,
    categories: categorySummaries,
  }
}

export function calculateAccountBalance(account: Account, transactions: Transaction[]): number {
  return transactions.reduce((balance, transaction) => {
    if (transaction.deleted_at !== null) {
      return balance
    }

    if (transaction.account_id === account.id) {
      return balance + (transaction.kind === 'income' ? transaction.amount : -transaction.amount)
    }

    if (transaction.kind === 'transfer' && transaction.to_account_id === account.id) {
      return balance + transaction.amount
    }

    return balance
  }, account.initial_balance)
}

export function calculateWorkspaceBalance(
  accounts: Account[],
  transactions: Transaction[],
): number {
  return accounts.reduce(
    (balance, account) => balance + calculateAccountBalance(account, transactions),
    0,
  )
}
