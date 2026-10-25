import type { CashflowTransaction, MonthCarryDecision, MonthlyBudget } from './models'
import { shiftMonth } from './calculations'

export interface MonthLedger {
  month: string
  budgetAmount: number | null
  resources: number
  expenses: number
  refunds: number
  netExpenses: number
  income: number
  adjustments: number
  carryIn: number
  available: number
}

export interface ExpenseComposition {
  fixedExpenses: number
  variableExpenses: number
  uncategorizedExpenses: number
  netExpenses: number
}

function addSafe(left: number, right: number): number {
  const result = left + right
  if (!Number.isSafeInteger(result)) {
    throw new RangeError('A calculated amount exceeds the safe integer range.')
  }
  return result
}

function monthTransactions(month: string, transactions: CashflowTransaction[]) {
  const prefix = month.slice(0, 7)
  return transactions.filter(
    (transaction) =>
      transaction.deleted_at === null && transaction.occurred_on.startsWith(`${prefix}-`),
  )
}

export function calculateExpenseComposition(
  month: string,
  transactions: CashflowTransaction[],
): ExpenseComposition {
  shiftMonth(month, 0)
  let fixedExpenses = 0
  let variableExpenses = 0
  let uncategorizedExpenses = 0

  for (const transaction of monthTransactions(month, transactions)) {
    if (transaction.kind === 'expense') {
      if (transaction.recurring_id === null) {
        variableExpenses = addSafe(variableExpenses, transaction.amount)
      } else {
        fixedExpenses = addSafe(fixedExpenses, transaction.amount)
      }
      if (transaction.category_id === null) {
        uncategorizedExpenses = addSafe(uncategorizedExpenses, transaction.amount)
      }
    } else if (transaction.kind === 'refund') {
      variableExpenses = addSafe(variableExpenses, -transaction.amount)
      if (transaction.category_id === null) {
        uncategorizedExpenses = addSafe(uncategorizedExpenses, -transaction.amount)
      }
    }
  }

  return {
    fixedExpenses,
    variableExpenses,
    uncategorizedExpenses,
    netExpenses: addSafe(fixedExpenses, variableExpenses),
  }
}

function totalsForMonth(month: string, transactions: CashflowTransaction[]) {
  let expenses = 0
  let refunds = 0
  let income = 0
  let adjustments = 0

  for (const transaction of monthTransactions(month, transactions)) {
    switch (transaction.kind) {
      case 'expense':
        expenses = addSafe(expenses, transaction.amount)
        break
      case 'refund':
        refunds = addSafe(refunds, transaction.amount)
        break
      case 'income':
        income = addSafe(income, transaction.amount)
        break
      case 'adjustment':
        adjustments = addSafe(adjustments, transaction.amount)
        break
    }
  }

  return {
    expenses,
    refunds,
    income,
    adjustments,
    netExpenses: addSafe(expenses, -refunds),
  }
}

export function resourceUsagePercentage(netExpenses: number, resources: number): number | null {
  if (resources <= 0) return null
  return Math.max(0, Math.min((netExpenses / resources) * 100, 100))
}

export function calculateMonthLedger(
  month: string,
  monthlyBudgets: MonthlyBudget[],
  transactions: CashflowTransaction[],
  carryDecisions: MonthCarryDecision[],
): MonthLedger {
  shiftMonth(month, 0)
  const budget = monthlyBudgets.find((item) => item.month === month && item.deleted_at === null)
  const currentTotals = totalsForMonth(month, transactions)
  const decisionByMonth = new Map(
    carryDecisions
      .filter((decision) => decision.deleted_at === null)
      .map((decision) => [decision.month, decision.accepted]),
  )
  const budgetByMonth = new Map(
    monthlyBudgets
      .filter((item) => item.deleted_at === null)
      .map((item) => [item.month, item.budget_amount]),
  )

  const getAvailable = (monthKey: string, depth: number): number => {
    if (depth >= 120) {
      throw new RangeError('Carry calculation exceeds the 120-month safety limit.')
    }
    let carryIn = 0
    if (decisionByMonth.get(monthKey) === true) {
      carryIn = Math.max(0, getAvailable(shiftMonth(monthKey, -1), depth + 1))
    }
    const totals = totalsForMonth(monthKey, transactions)
    const netExpenses = addSafe(totals.expenses, -totals.refunds)
    const resources = addSafe(
      addSafe(addSafe(carryIn, budgetByMonth.get(monthKey) ?? 0), totals.income),
      totals.adjustments,
    )
    return addSafe(resources, -netExpenses)
  }

  const previousMonth = shiftMonth(month, -1)
  const carryIn =
    decisionByMonth.get(month) === true ? Math.max(0, getAvailable(previousMonth, 0)) : 0
  const netExpenses = addSafe(currentTotals.expenses, -currentTotals.refunds)
  const budgetAmount = budget?.budget_amount ?? 0
  const resources = addSafe(
    addSafe(addSafe(carryIn, budgetAmount), currentTotals.income),
    currentTotals.adjustments,
  )
  const available = addSafe(resources, -netExpenses)
  return {
    month,
    budgetAmount: budget?.budget_amount ?? null,
    resources,
    ...currentTotals,
    netExpenses,
    carryIn,
    available,
  }
}
