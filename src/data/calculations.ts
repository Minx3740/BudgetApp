import type { Account, Transaction } from './models'

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
