import { getDayPeriod, getMonthPeriod, getWeekPeriod } from './periods'
import type { Budget, CashflowTransaction, Category } from './models'

export interface ThresholdStatus {
  budgetId: string
  period: Budget['period']
  categoryId: string | null
  label: string
  enabled: boolean
  amount: number
  spentAmount: number
  remainingAmount: number
  progressPercentage: number
  isOverThreshold: boolean
  isNearThreshold: boolean
  start: string
  end: string
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

function localDateKey(date: Date): string {
  if (Number.isNaN(date.getTime())) throw new Error('Invalid date for threshold calculation.')
  return `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`
}

export function calculateThresholdStatuses(
  month: string,
  budgets: Budget[],
  categories: Category[],
  transactions: CashflowTransaction[],
  today: Date = new Date(),
): ThresholdStatus[] {
  const monthPeriod = getMonthPeriod(month)
  const todayKey = localDateKey(today)
  const dayPeriod = getDayPeriod(todayKey)
  const weekPeriod = getWeekPeriod(todayKey)
  const categoryNames = new Map(categories.map((category) => [category.id, category.name]))

  return budgets
    .filter((budget) => {
      if (budget.deleted_at !== null) return false
      if (budget.period === 'month') return budget.month === month
      return budget.category_id === null && budget.month === null
    })
    .map((budget) => {
      const period =
        budget.period === 'day' ? dayPeriod : budget.period === 'week' ? weekPeriod : monthPeriod
      let spentAmount = 0

      for (const transaction of transactions) {
        if (
          transaction.deleted_at !== null ||
          transaction.recurring_id !== null ||
          (transaction.kind !== 'expense' && transaction.kind !== 'refund') ||
          transaction.occurred_on < period.start ||
          transaction.occurred_on > period.end ||
          (budget.category_id !== null && transaction.category_id !== budget.category_id)
        ) {
          continue
        }
        spentAmount = addSafe(
          spentAmount,
          transaction.kind === 'expense' ? transaction.amount : -transaction.amount,
        )
      }

      const progressPercentage =
        budget.limit_amount === 0
          ? spentAmount > 0
            ? 100
            : 0
          : Math.max(0, Math.min((spentAmount / budget.limit_amount) * 100, 100))
      const isOverThreshold = budget.enabled && spentAmount > budget.limit_amount

      return {
        budgetId: budget.id,
        period: budget.period,
        categoryId: budget.category_id,
        label:
          budget.category_id === null
            ? budget.period === 'day'
              ? 'Seuil par jour'
              : budget.period === 'week'
                ? 'Seuil par semaine'
                : 'Seuil mensuel global'
            : (categoryNames.get(budget.category_id) ?? 'Catégorie archivée'),
        enabled: budget.enabled,
        amount: budget.limit_amount,
        spentAmount,
        remainingAmount: subtractSafe(budget.limit_amount, spentAmount),
        progressPercentage,
        isOverThreshold,
        isNearThreshold: budget.enabled && !isOverThreshold && progressPercentage >= 80,
        start: period.start,
        end: period.end,
      }
    })
    .sort(
      (left, right) =>
        ['day', 'week', 'month'].indexOf(left.period) -
          ['day', 'week', 'month'].indexOf(right.period) ||
        left.label.localeCompare(right.label, 'fr'),
    )
}
