import type { CashflowTransaction, MonthCarryDecision, MonthlyBudget } from './models'
import { shiftMonth } from './calculations'

export interface MonthLedger {
  month: string
  budgetAmount: number | null
  expenses: number
  refunds: number
  netExpenses: number
  income: number
  adjustments: number
  carryIn: number
  balance: number
  remainingBudget: number | null
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

  return { expenses, refunds, income, adjustments, netExpenses: expenses - refunds }
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
  const transactionCountByMonth = new Map<string, number>()
  for (const transaction of transactions) {
    if (transaction.deleted_at !== null) continue
    const transactionMonth = `${transaction.occurred_on.slice(0, 7)}-01`
    transactionCountByMonth.set(
      transactionMonth,
      (transactionCountByMonth.get(transactionMonth) ?? 0) + 1,
    )
  }

  const getBalance = (monthKey: string, depth: number): number => {
    if (depth >= 120) {
      throw new RangeError('Carry calculation exceeds the 120-month safety limit.')
    }
    let carryIn = 0
    if (
      decisionByMonth.get(monthKey) === true &&
      (transactionCountByMonth.get(shiftMonth(monthKey, -1)) ?? 0) > 0
    ) {
      carryIn = Math.max(0, getBalance(shiftMonth(monthKey, -1), depth + 1))
    }
    const totals = totalsForMonth(monthKey, transactions)
    const netExpenses = addSafe(totals.expenses, -totals.refunds)
    return addSafe(addSafe(addSafe(carryIn, totals.income), totals.adjustments), -netExpenses)
  }

  const previousMonth = shiftMonth(month, -1)
  const carryIn =
    decisionByMonth.get(month) === true && (transactionCountByMonth.get(previousMonth) ?? 0) > 0
      ? Math.max(0, getBalance(previousMonth, 0))
      : 0
  const netExpenses = addSafe(currentTotals.expenses, -currentTotals.refunds)
  const balance = addSafe(
    addSafe(addSafe(carryIn, currentTotals.income), currentTotals.adjustments),
    -netExpenses,
  )
  return {
    month,
    budgetAmount: budget?.budget_amount ?? null,
    ...currentTotals,
    netExpenses,
    carryIn,
    balance,
    remainingBudget: budget ? addSafe(budget.budget_amount, -netExpenses) : null,
  }
}
