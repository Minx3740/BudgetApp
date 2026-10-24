import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { bootstrapLocalData, type RawSnapshot, type SnapshotSource } from './bootstrap'
import { BudgetDatabase, type OutboxOperation } from './database'
import type { CashflowTransaction, MonthCarryDecision, MonthlyBudget, Workspace } from './models'

const userId = '00000000-0000-4000-8000-000000000001'
const workspaceId = '00000000-0000-4000-8000-000000000002'
const transactionId = '00000000-0000-4000-8000-000000000003'
const categoryId = '00000000-0000-4000-8000-000000000004'
const monthBudgetId = '00000000-0000-4000-8000-000000000005'
const carryDecisionId = '00000000-0000-4000-8000-000000000006'
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

const transaction: CashflowTransaction = {
  id: transactionId,
  workspace_id: workspaceId,
  category_id: categoryId,
  kind: 'expense',
  amount: 250,
  occurred_on: '2026-10-24',
  note: 'Repas',
  created_by: userId,
  paid_by: userId,
  created_at: timestamp,
  updated_at: timestamp,
  deleted_at: null,
}

const monthlyBudget: MonthlyBudget = {
  id: monthBudgetId,
  workspace_id: workspaceId,
  month: '2026-10-01',
  budget_amount: 1000,
  created_at: timestamp,
  updated_at: timestamp,
  deleted_at: null,
}

const monthCarryDecision: MonthCarryDecision = {
  id: carryDecisionId,
  workspace_id: workspaceId,
  month: '2026-10-01',
  accepted: true,
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
    categories: [category],
    transactions: [transaction],
    budgets: [],
    monthlyBudgets: [monthlyBudget],
    monthCarryDecisions: [monthCarryDecision],
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

    expect(result).toEqual({ workspaceCount: 1, importedRowCount: 7 })
    expect(await database.workspaces.get(workspaceId)).toEqual(workspace)
    expect(await database.categories.get(categoryId)).toEqual(category)
    expect(await database.transactions.get(transactionId)).toEqual(transaction)
    expect(await database.monthlyBudgets.get(monthBudgetId)).toEqual(monthlyBudget)
    expect(await database.monthCarryDecisions.get(carryDecisionId)).toEqual(monthCarryDecision)
    expect(await database.outbox.count()).toBe(0)

    await bootstrapLocalData(userId, makeSource(makeSnapshot()), database)
    expect(await database.transactions.count()).toBe(1)
  })

  it('préserve une ligne locale qui a déjà une opération en attente', async () => {
    const localTransaction = { ...transaction, note: 'Modifié hors-ligne' }
    const operation: OutboxOperation = {
      op_id: '00000000-0000-4000-8000-000000000005',
      table: 'transactions',
      action: 'upsert',
      payload: localTransaction,
      created_at: timestamp,
      attempts: 0,
      status: 'pending',
    }
    await database.transactions.add(localTransaction)
    await database.outbox.add(operation)

    await bootstrapLocalData(userId, makeSource(makeSnapshot()), database)

    expect((await database.transactions.get(transactionId))?.note).toBe('Modifié hors-ligne')
    expect(await database.outbox.get(operation.op_id)).toEqual(operation)
  })

  it('purge les données et opérations d’un espace dont l’utilisateur a perdu l’accès', async () => {
    const operation: OutboxOperation = {
      op_id: '00000000-0000-4000-8000-000000000007',
      table: 'transactions',
      action: 'upsert',
      payload: transaction,
      created_at: timestamp,
      attempts: 0,
      status: 'pending',
    }
    await database.workspaces.add(workspace)
    await database.memberships.add(membership)
    await database.transactions.add(transaction)
    await database.monthlyBudgets.add(monthlyBudget)
    await database.monthCarryDecisions.add(monthCarryDecision)
    await database.outbox.add(operation)

    await bootstrapLocalData(
      userId,
      makeSource(
        makeSnapshot({
          workspaces: [],
          memberships: [],
          categories: [],
          transactions: [],
          monthlyBudgets: [],
          monthCarryDecisions: [],
        }),
      ),
      database,
    )

    expect(await database.workspaces.get(workspaceId)).toBeUndefined()
    expect(await database.transactions.get(transactionId)).toBeUndefined()
    expect(await database.monthlyBudgets.get(monthBudgetId)).toBeUndefined()
    expect(await database.monthCarryDecisions.get(carryDecisionId)).toBeUndefined()
    expect(await database.outbox.get(operation.op_id)).toBeUndefined()
  })

  it('rejette un snapshot incohérent sans écrire les données', async () => {
    await expect(
      bootstrapLocalData(
        userId,
        makeSource(makeSnapshot({ categories: [{ ...category, name: '' }] })),
        database,
      ),
    ).rejects.toThrow('Données invalides dans categories')

    expect(await database.workspaces.count()).toBe(0)
    expect(await database.transactions.count()).toBe(0)
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
