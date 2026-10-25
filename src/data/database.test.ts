import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { afterEach, describe, expect, it } from 'vitest'
import { BudgetDatabase } from './database'

const openedDatabases: Dexie[] = []

afterEach(async () => {
  await Promise.all(
    openedDatabases.splice(0).map(async (database) => {
      const name = database.name
      database.close()
      await Dexie.delete(name)
    }),
  )
})

describe('migration destructive de Dexie vers R1', () => {
  it('vide les données de test et l’ancienne outbox puis retire accounts', async () => {
    const name = `r1-upgrade-${crypto.randomUUID()}`
    const legacy = new Dexie(name)
    legacy.version(1).stores({
      profiles: 'id, updated_at',
      workspaces: 'id, owner_id, type, updated_at',
      memberships: '[workspace_id+user_id], workspace_id, user_id',
      invitations: 'id, workspace_id, expires_at, updated_at',
      accounts: 'id, workspace_id, updated_at, deleted_at',
      categories: 'id, workspace_id, kind, updated_at, deleted_at',
      transactions:
        'id, workspace_id, occurred_on, account_id, category_id, created_by, updated_at, deleted_at',
      budgets: 'id, workspace_id, category_id, month, &[workspace_id+category_id+month]',
      outbox: 'op_id, status, created_at, [status+created_at]',
    })
    legacy.version(2).stores({
      profiles: 'id, updated_at',
      workspaces: 'id, owner_id, type, updated_at',
      memberships: '[workspace_id+user_id], workspace_id, user_id',
      invitations: 'id, workspace_id, expires_at, updated_at',
      accounts: 'id, workspace_id, updated_at, deleted_at',
      categories: 'id, workspace_id, kind, updated_at, deleted_at',
      transactions:
        'id, workspace_id, occurred_on, account_id, category_id, created_by, updated_at, deleted_at',
      budgets: 'id, workspace_id, category_id, month, &[workspace_id+category_id+month]',
      outbox: 'op_id, status, created_at, [status+created_at]',
      syncCursors: 'id, workspace_id, table',
      syncMetadata: 'key',
    })
    await legacy.open()
    await legacy.table('workspaces').put({
      id: '00000000-0000-4000-8000-000000000001',
      name: 'Test',
    })
    await legacy.table('accounts').put({
      id: '00000000-0000-4000-8000-000000000002',
      workspace_id: '00000000-0000-4000-8000-000000000001',
      initial_balance: 900,
    })
    await legacy.table('outbox').put({
      op_id: '00000000-0000-4000-8000-000000000003',
      table: 'accounts',
      action: 'upsert',
      payload: {
        id: '00000000-0000-4000-8000-000000000002',
        workspace_id: '00000000-0000-4000-8000-000000000001',
      },
      created_at: '2026-10-24T10:00:00.000Z',
      attempts: 1,
      status: 'pending',
    })
    legacy.close()

    const upgraded = new BudgetDatabase(name)
    openedDatabases.push(upgraded)
    await upgraded.open()

    expect(upgraded.tables.map((table) => table.name)).not.toContain('accounts')
    expect(upgraded.tables.map((table) => table.name)).toContain('monthlyBudgets')
    expect(upgraded.tables.map((table) => table.name)).toContain('monthCarryDecisions')
    expect(await upgraded.workspaces.count()).toBe(0)
    expect(await upgraded.outbox.count()).toBe(0)
    expect(await upgraded.syncCursors.count()).toBe(0)
    expect(await upgraded.syncMetadata.count()).toBe(0)
  })

  it('ajoute les forfaits à Dexie v5 sans vider les données R4', async () => {
    const name = `r5-upgrade-${crypto.randomUUID()}`
    const legacy = new Dexie(name)
    legacy.version(4).stores({
      profiles: 'id, updated_at',
      workspaces: 'id, owner_id, type, updated_at',
      memberships: '[workspace_id+user_id], workspace_id, user_id',
      invitations: 'id, workspace_id, expires_at, updated_at',
      accounts: null,
      categories: 'id, workspace_id, kind, updated_at, deleted_at',
      transactions:
        'id, workspace_id, occurred_on, category_id, paid_by, created_by, updated_at, deleted_at',
      budgets: 'id, workspace_id, category_id, month, &[workspace_id+category_id+month]',
      monthlyBudgets: 'id, workspace_id, month, updated_at, deleted_at, &[workspace_id+month]',
      monthCarryDecisions: 'id, workspace_id, month, updated_at, deleted_at, &[workspace_id+month]',
      outbox: 'op_id, status, created_at, [status+created_at]',
      syncCursors: 'id, workspace_id, table',
      syncMetadata: 'key',
    })
    await legacy.open()
    const transaction = {
      id: '00000000-0000-4000-8000-000000000001',
      workspace_id: '00000000-0000-4000-8000-000000000002',
      category_id: null,
      kind: 'expense',
      amount: 2500,
      occurred_on: '2026-10-24',
      note: 'Donnée existante',
      created_by: '00000000-0000-4000-8000-000000000003',
      paid_by: '00000000-0000-4000-8000-000000000003',
      created_at: '2026-10-24T10:00:00.000Z',
      updated_at: '2026-10-24T10:00:00.000Z',
      deleted_at: null,
    }
    await legacy.table('transactions').put(transaction)
    const operation = {
      op_id: '00000000-0000-4000-8000-000000000004',
      table: 'transactions',
      action: 'upsert',
      payload: transaction,
      created_at: '2026-10-24T10:00:00.000Z',
      attempts: 0,
      status: 'pending',
    }
    await legacy.table('outbox').put(operation)
    legacy.close()

    const upgraded = new BudgetDatabase(name)
    openedDatabases.push(upgraded)
    await upgraded.open()

    expect(upgraded.tables.map((table) => table.name)).toContain('recurringExpenses')
    expect(await upgraded.transactions.count()).toBe(1)
    expect(await upgraded.transactions.toArray()).toMatchObject([
      { note: 'Donnée existante', recurring_id: null, recurring_month: null },
    ])
    expect(await upgraded.outbox.get(operation.op_id)).toMatchObject({
      status: 'pending',
      payload: { recurring_id: null, recurring_month: null },
    })
  })
})
