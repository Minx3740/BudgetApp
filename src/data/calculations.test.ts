import { describe, expect, it } from 'vitest'
import { calculateAccountBalance, calculateWorkspaceBalance } from './calculations'
import type { Account, Transaction } from './models'

const timestamp = '2026-10-24T00:00:00.000Z'
const workspaceId = '00000000-0000-4000-8000-000000000001'
const sourceId = '00000000-0000-4000-8000-000000000002'
const targetId = '00000000-0000-4000-8000-000000000003'
const categoryId = '00000000-0000-4000-8000-000000000004'
const userId = '00000000-0000-4000-8000-000000000005'

function account(id: string, initialBalance: number): Account {
  return {
    id,
    workspace_id: workspaceId,
    name: id,
    type: 'cash',
    initial_balance: initialBalance,
    archived_at: null,
    created_at: timestamp,
    updated_at: timestamp,
    deleted_at: null,
  }
}

function transaction(
  id: string,
  kind: Transaction['kind'],
  amount: number,
  accountId: string,
  toAccountId: string | null = null,
  deletedAt: string | null = null,
): Transaction {
  return {
    id,
    workspace_id: workspaceId,
    account_id: accountId,
    to_account_id: toAccountId,
    category_id: kind === 'transfer' ? null : categoryId,
    kind,
    amount,
    occurred_on: '2026-10-24',
    note: null,
    created_by: userId,
    created_at: timestamp,
    updated_at: timestamp,
    deleted_at: deletedAt,
  }
}

describe('calcul de solde local', () => {
  it('applique le solde initial, les dépenses, revenus et transferts dans le bon sens', () => {
    const cash = account(sourceId, 100_000)
    const bank = account(targetId, 20_000)
    const transactions = [
      transaction('00000000-0000-4000-8000-000000000010', 'expense', 5_000, sourceId),
      transaction('00000000-0000-4000-8000-000000000011', 'income', 40_000, sourceId),
      transaction('00000000-0000-4000-8000-000000000012', 'transfer', 25_000, sourceId, targetId),
    ]

    expect(calculateAccountBalance(cash, transactions)).toBe(110_000)
    expect(calculateAccountBalance(bank, transactions)).toBe(45_000)
    expect(calculateWorkspaceBalance([cash, bank], transactions)).toBe(155_000)
  })

  it('ignore les transactions supprimées logiquement', () => {
    const cash = account(sourceId, 100_000)
    const transactions = [
      transaction(
        '00000000-0000-4000-8000-000000000013',
        'expense',
        5_000,
        sourceId,
        null,
        timestamp,
      ),
    ]

    expect(calculateAccountBalance(cash, transactions)).toBe(100_000)
  })
})
