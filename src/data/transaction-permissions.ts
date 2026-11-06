import type { Membership, Transaction } from './models'

export type TransactionWriteRole = Membership['role'] | undefined

export function canCreateTransaction(
  userId: string,
  role: TransactionWriteRole,
  createdBy: string,
): boolean {
  return userId === createdBy && (role === 'owner' || role === 'member')
}

export function canEditTransaction(
  userId: string,
  role: TransactionWriteRole,
  transaction: Pick<Transaction, 'created_by'>,
): boolean {
  return role === 'owner' || (role === 'member' && transaction.created_by === userId)
}
