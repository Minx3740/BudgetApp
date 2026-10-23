import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { bootstrapLocalData, type RawSnapshot, type SnapshotSource } from './bootstrap'
import { BudgetDatabase, type OutboxOperation } from './database'
import type { Account, Workspace } from './models'

const userId = '00000000-0000-4000-8000-000000000001'
const workspaceId = '00000000-0000-4000-8000-000000000002'
const accountId = '00000000-0000-4000-8000-000000000003'
const categoryId = '00000000-0000-4000-8000-000000000004'
const timestamp = '2026-10-24T00:00:00.000Z'

const profile = {
  id: userId,
  display_name: 'Utilisateur',
  created_at: timestamp,
  updated_at: timestamp,
  deleted_at: null,
}

const workspace: Workspace = {
  id: workspaceId,
  name: 'Perso',
  type: 'personal',
  currency: 'MGA',
  owner_id: userId,
  created_at: timestamp,
  updated_at: timestamp,
  deleted_at: null,
}

const membership = {
  workspace_id: workspaceId,
  user_id: userId,
  role: 'owner' as const,
  created_at: timestamp,
  updated_at: timestamp,
}

const account: Account = {
  id: accountId,
  workspace_id: workspaceId,
  name: 'Espèces',
  type: 'cash',
  initial_balance: 0,
  archived_at: null,
  created_at: timestamp,
  updated_at: timestamp,
  deleted_at: null,
}

const category = {
  id: categoryId,
  workspace_id: workspaceId,
  name: 'Alimentation',
  kind: 'expense' as const,
  icon: 'basket',
  color: '#e07a5f',
  archived_at: null,
  created_at: timestamp,
  updated_at: timestamp,
  deleted_at: null,
}

function makeSnapshot(overrides: Partial<RawSnapshot> = {}): RawSnapshot {
  return {
    profiles: [profile],
    workspaces: [workspace],
    memberships: [membership],
    invitations: [],
    accounts: [account],
    categories: [category],
    transactions: [],
    budgets: [],
    ...overrides,
  }
}

function makeSource(snapshot: RawSnapshot): SnapshotSource {
  return { fetchSnapshot: async () => snapshot }
}

describe('import initial vers Dexie', () => {
  let database: BudgetDatabase

  beforeEach(async () => {
    database = new BudgetDatabase(`bootstrap-test-${crypto.randomUUID()}`)
    await database.open()
  })

  afterEach(async () => {
    await database.delete()
  })

  it('importe les espaces et leurs données sans créer d’opérations à synchroniser', async () => {
    const result = await bootstrapLocalData(userId, makeSource(makeSnapshot()), database)

    expect(result).toEqual({ workspaceCount: 1, importedRowCount: 5 })
    expect(await database.workspaces.get(workspaceId)).toEqual(workspace)
    expect(await database.accounts.get(accountId)).toEqual(account)
    expect(await database.categories.get(categoryId)).toEqual(category)
    expect(await database.outbox.count()).toBe(0)

    await bootstrapLocalData(userId, makeSource(makeSnapshot()), database)
    expect(await database.accounts.count()).toBe(1)
  })

  it('préserve une ligne locale qui a déjà une opération en attente', async () => {
    const localAccount = { ...account, name: 'Nom modifié hors-ligne' }
    const operation: OutboxOperation = {
      op_id: '00000000-0000-4000-8000-000000000005',
      table: 'accounts',
      action: 'upsert',
      payload: localAccount,
      created_at: timestamp,
      attempts: 0,
      status: 'pending',
    }
    await database.accounts.add(localAccount)
    await database.outbox.add(operation)

    await bootstrapLocalData(userId, makeSource(makeSnapshot()), database)

    expect((await database.accounts.get(accountId))?.name).toBe('Nom modifié hors-ligne')
    expect(await database.outbox.get(operation.op_id)).toEqual(operation)
  })

  it('purge les données et opérations d’un espace dont l’utilisateur a perdu l’accès', async () => {
    const operation: OutboxOperation = {
      op_id: '00000000-0000-4000-8000-000000000006',
      table: 'accounts',
      action: 'upsert',
      payload: account,
      created_at: timestamp,
      attempts: 0,
      status: 'pending',
    }
    await database.workspaces.add(workspace)
    await database.memberships.add(membership)
    await database.accounts.add(account)
    await database.outbox.add(operation)

    await bootstrapLocalData(
      userId,
      makeSource(
        makeSnapshot({
          workspaces: [],
          memberships: [],
          accounts: [],
          categories: [],
        }),
      ),
      database,
    )

    expect(await database.workspaces.get(workspaceId)).toBeUndefined()
    expect(await database.accounts.get(accountId)).toBeUndefined()
    expect(await database.outbox.get(operation.op_id)).toBeUndefined()
  })

  it('rejette un snapshot incohérent sans écrire les données', async () => {
    await expect(
      bootstrapLocalData(
        userId,
        makeSource(makeSnapshot({ accounts: [{ ...account, name: '' }] })),
        database,
      ),
    ).rejects.toThrow('Données invalides dans accounts')

    expect(await database.workspaces.count()).toBe(0)
    expect(await database.accounts.count()).toBe(0)
  })

  it('annule l’import lorsque la session est interrompue avant l’écriture', async () => {
    const controller = new AbortController()
    const source: SnapshotSource = {
      async fetchSnapshot() {
        controller.abort()
        return makeSnapshot()
      },
    }

    await expect(
      bootstrapLocalData(userId, source, database, controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(await database.workspaces.count()).toBe(0)
  })
})
