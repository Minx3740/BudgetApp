import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { bootstrapLocalData } from './bootstrap'
import { BudgetDatabase, type OutboxOperation } from './database'
import { createRepository } from './repositories'
import { createSyncEngine, retryFailedSyncOperations, SyncFailure, type SyncGateway } from './sync'
import type { Category, Membership, RecurringExpense, SyncTable } from './models'

const workspaceId = '00000000-0000-4000-8000-000000000001'
const userId = '00000000-0000-4000-8000-000000000002'
const categoryId = '00000000-0000-4000-8000-000000000003'
const secondCategoryId = '00000000-0000-4000-8000-000000000004'
const epoch = '2026-10-24T10:00:00.000Z'

function makeCategory(id: string, overrides: Partial<Category> = {}): Category {
  return {
    id,
    workspace_id: workspaceId,
    name: 'Alimentation',
    kind: 'expense',
    icon: null,
    color: null,
    archived_at: null,
    created_at: epoch,
    updated_at: epoch,
    deleted_at: null,
    ...overrides,
  }
}

function categoryInput(id: string, name = 'Alimentation') {
  return {
    id,
    workspace_id: workspaceId,
    name,
    kind: 'expense' as const,
    icon: null,
    color: null,
    archived_at: null,
  }
}

function makeMembership(workspace = workspaceId): Membership {
  return {
    workspace_id: workspace,
    user_id: userId,
    role: 'owner',
    created_at: epoch,
    updated_at: epoch,
  }
}

function makeRecurringExpense(overrides: Partial<RecurringExpense> = {}): RecurringExpense {
  return {
    id: '00000000-0000-4000-8000-000000000005',
    series_id: '00000000-0000-4000-8000-000000000006',
    workspace_id: workspaceId,
    label: 'Loyer',
    amount: 200_000,
    category_id: categoryId,
    day_of_month: 5,
    start_month: '2026-10-01',
    end_month: null,
    created_by: userId,
    version: 1,
    created_at: epoch,
    updated_at: epoch,
    ...overrides,
  }
}

class FakeSyncGateway implements SyncGateway {
  memberships: Membership[] = [makeMembership()]
  serverTime = epoch
  pushes: OutboxOperation[] = []
  changedQueries: { table: SyncTable; after: string; through: string }[] = []
  remoteCategories = new Map<string, Category>()
  remoteRecurringExpenses = new Map<string, RecurringExpense>()
  failNextPush: SyncFailure | null = null
  failOnPushNumber: number | null = null
  failAfterCommitOnce = false
  revokeAfterFirstMembershipCheck = false
  private membershipChecks = 0

  async fetchMemberships(): Promise<Membership[]> {
    this.membershipChecks += 1
    if (this.revokeAfterFirstMembershipCheck && this.membershipChecks > 1) {
      return []
    }
    return this.memberships
  }

  async getServerTime(): Promise<string> {
    return this.serverTime
  }

  async push(operation: OutboxOperation): Promise<unknown> {
    this.pushes.push(operation)
    if (this.failOnPushNumber === this.pushes.length) {
      this.failOnPushNumber = null
      throw new SyncFailure('Push interrompu au milieu de la file.', 'network')
    }
    if (this.failNextPush) {
      const error = this.failNextPush
      this.failNextPush = null
      throw error
    }
    if (operation.table !== 'categories') {
      return operation.payload
    }

    const existing = this.remoteCategories.get(operation.payload.id)
    if (existing && existing.deleted_at !== null && operation.payload.deleted_at === null) {
      return existing
    }
    const row = makeCategory(operation.payload.id, {
      ...operation.payload,
      created_at: existing?.created_at ?? this.serverTime,
      updated_at: this.serverTime,
      deleted_at: existing?.deleted_at ?? operation.payload.deleted_at,
    })
    this.remoteCategories.set(row.id, row)
    if (this.failAfterCommitOnce) {
      this.failAfterCommitOnce = false
      throw new SyncFailure('Réponse perdue après validation du serveur.', 'network')
    }
    return row
  }

  async fetchChangedRows(
    table: SyncTable,
    workspaceId: string,
    after: string,
    through: string,
  ): Promise<unknown[]> {
    this.changedQueries.push({ table, after, through })
    if (table === 'recurringExpenses') {
      return [...this.remoteRecurringExpenses.values()].filter(
        (row) =>
          row.workspace_id === workspaceId &&
          Date.parse(row.updated_at) > Date.parse(after) &&
          Date.parse(row.updated_at) <= Date.parse(through),
      )
    }
    if (table !== 'categories') {
      return []
    }
    return [...this.remoteCategories.values()].filter(
      (row) =>
        row.workspace_id === workspaceId &&
        Date.parse(row.updated_at) > Date.parse(after) &&
        Date.parse(row.updated_at) <= Date.parse(through),
    )
  }
}

describe('moteur de synchronisation', () => {
  let database: BudgetDatabase
  let gateway: FakeSyncGateway

  beforeEach(async () => {
    database = new BudgetDatabase(`sync-test-${crypto.randomUUID()}`)
    await database.open()
    gateway = new FakeSyncGateway()
    await database.workspaces.put({
      id: workspaceId,
      name: 'Perso',
      type: 'personal',
      currency: 'MGA',
      owner_id: userId,
      created_at: epoch,
      updated_at: epoch,
      deleted_at: null,
    })
    await database.memberships.put(makeMembership())
  })

  afterEach(() => {
    database.close()
  })

  it('pousse dans l’ordre, reprend après une coupure et ne duplique pas les lignes', async () => {
    const repository = createRepository('categories', database.categories, database)
    const first = await repository.create(categoryInput(categoryId, 'Alimentation'))
    await repository.create(categoryInput(secondCategoryId, 'Transport'))
    gateway.failOnPushNumber = 2
    const engine = createSyncEngine(userId, gateway, database)

    await expect(engine.synchronize(new AbortController().signal)).rejects.toMatchObject({
      kind: 'network',
    })
    expect(await database.outbox.orderBy('created_at').toArray()).toMatchObject([
      { payload: { id: secondCategoryId }, status: 'pending', attempts: 1 },
    ])
    expect(gateway.remoteCategories.size).toBe(1)

    const result = await engine.synchronize(new AbortController().signal)

    expect(result.pushed).toBe(1)
    expect(gateway.pushes.map((operation) => operation.payload.id)).toEqual([
      first.id,
      secondCategoryId,
      secondCategoryId,
    ])
    expect(gateway.remoteCategories.size).toBe(2)
    expect(await database.outbox.count()).toBe(0)
    expect((await database.categories.get(first.id))?.updated_at).toBe(epoch)
    expect(await database.syncMetadata.get('last-successful-sync')).toEqual({
      key: 'last-successful-sync',
      value: epoch,
    })
  })

  it('récupère une opération restée en traitement après fermeture de l’application', async () => {
    const repository = createRepository('categories', database.categories, database)
    const category = await repository.create(categoryInput(categoryId))
    await database.outbox.update((await database.outbox.toArray())[0]!.op_id, {
      status: 'processing',
    })

    await createSyncEngine(userId, gateway, database).synchronize(new AbortController().signal)

    expect(gateway.remoteCategories.get(category.id)?.name).toBe('Alimentation')
    expect(await database.outbox.count()).toBe(0)
  })

  it('rejoue sans doublon une opération acceptée par le serveur dont l’accusé a été perdu', async () => {
    const repository = createRepository('categories', database.categories, database)
    await repository.create(categoryInput(categoryId))
    gateway.failAfterCommitOnce = true
    const engine = createSyncEngine(userId, gateway, database)

    await expect(engine.synchronize(new AbortController().signal)).rejects.toMatchObject({
      kind: 'network',
    })
    expect(gateway.remoteCategories.size).toBe(1)
    expect(await database.outbox.count()).toBe(1)

    await engine.synchronize(new AbortController().signal)

    expect(gateway.remoteCategories.size).toBe(1)
    expect(await database.outbox.count()).toBe(0)
    expect(gateway.pushes).toHaveLength(2)
    expect(gateway.pushes[0]?.payload.id).toBe(gateway.pushes[1]?.payload.id)
  })

  it('applique les lignes distantes et réutilise le curseur avec le chevauchement serveur', async () => {
    const stale = makeCategory(categoryId, { name: 'Ancien nom' })
    await database.categories.put(stale)
    gateway.remoteCategories.set(
      categoryId,
      makeCategory(categoryId, { name: 'Nouveau nom', updated_at: epoch }),
    )
    const engine = createSyncEngine(userId, gateway, database)

    await engine.synchronize(new AbortController().signal)
    expect((await database.categories.get(categoryId))?.name).toBe('Nouveau nom')
    expect(await database.syncCursors.get(`${workspaceId}:categories`)).toEqual({
      id: `${workspaceId}:categories`,
      workspace_id: workspaceId,
      table: 'categories',
      cursor: epoch,
    })

    gateway.serverTime = '2026-10-24T10:01:00.000Z'
    await engine.synchronize(new AbortController().signal)

    const categoryQuery = gateway.changedQueries.filter((query) => query.table === 'categories')
    expect(categoryQuery[1]?.after).toBe('2026-10-24T09:59:00.000Z')
    expect(categoryQuery[1]?.through).toBe(gateway.serverTime)
    expect((await database.categories.get(categoryId))?.name).toBe('Nouveau nom')
  })

  it('arbitre un conflit avec le timestamp serveur plutôt que l’horloge locale', async () => {
    gateway.remoteCategories.set(
      categoryId,
      makeCategory(categoryId, { name: 'Modification distante', updated_at: epoch }),
    )
    const repository = createRepository('categories', database.categories, database)
    await repository.create(categoryInput(categoryId, 'Modification de cet appareil'))

    await createSyncEngine(userId, gateway, database).synchronize(new AbortController().signal)

    expect(gateway.remoteCategories.get(categoryId)).toMatchObject({
      name: 'Modification de cet appareil',
      updated_at: epoch,
    })
    expect(await database.categories.get(categoryId)).toMatchObject({
      name: 'Modification de cet appareil',
      updated_at: epoch,
    })
  })

  it('fait primer une suppression serveur sur une modification locale en attente', async () => {
    const repository = createRepository('categories', database.categories, database)
    await repository.create(categoryInput(categoryId))
    const deleted = makeCategory(categoryId, {
      name: 'Alimentation supprimée',
      deleted_at: '2026-10-24T09:59:00.000Z',
      updated_at: '2026-10-24T09:59:00.000Z',
    })
    gateway.remoteCategories.set(categoryId, deleted)

    await createSyncEngine(userId, gateway, database).synchronize(new AbortController().signal)

    expect((await database.categories.get(categoryId))?.deleted_at).not.toBeNull()
    expect(await database.outbox.count()).toBe(0)
    expect(gateway.remoteCategories.get(categoryId)?.deleted_at).not.toBeNull()
  })

  it('propage une suppression locale au serveur sous forme de tombstone', async () => {
    const repository = createRepository('categories', database.categories, database)
    const category = await repository.create(categoryInput(categoryId))
    await repository.softDelete(category.id, workspaceId)

    await createSyncEngine(userId, gateway, database).synchronize(new AbortController().signal)

    expect(gateway.remoteCategories.get(categoryId)?.deleted_at).not.toBeNull()
    expect((await database.categories.get(categoryId))?.deleted_at).not.toBeNull()
    expect(await database.outbox.count()).toBe(0)
  })

  it('purge les données et la file locale dès que l’accès à un espace est retiré', async () => {
    const repository = createRepository('categories', database.categories, database)
    await repository.create(categoryInput(categoryId))
    gateway.memberships = []

    await createSyncEngine(userId, gateway, database).synchronize(new AbortController().signal)

    expect(await database.workspaces.get(workspaceId)).toBeUndefined()
    expect(await database.categories.get(categoryId)).toBeUndefined()
    expect(await database.outbox.count()).toBe(0)
    expect(gateway.pushes).toEqual([])
  })

  it('met à jour le rôle local lors de la synchronisation', async () => {
    gateway.memberships = [{ ...makeMembership(), role: 'viewer' }]

    await createSyncEngine(userId, gateway, database).synchronize(new AbortController().signal)

    await expect(database.memberships.get([workspaceId, userId])).resolves.toMatchObject({
      role: 'viewer',
    })
  })

  it('récupère les forfaits en cache sans les ajouter à la file hors ligne', async () => {
    const recurringExpense = makeRecurringExpense()
    gateway.remoteRecurringExpenses.set(recurringExpense.id, recurringExpense)

    const result = await createSyncEngine(userId, gateway, database).synchronize(
      new AbortController().signal,
    )

    expect(await database.recurringExpenses.get(recurringExpense.id)).toEqual(recurringExpense)
    expect(await database.outbox.count()).toBe(0)
    expect(result.pulled).toBe(1)
    expect(await database.syncCursors.get(`${workspaceId}:recurringExpenses`)).toMatchObject({
      table: 'recurringExpenses',
      cursor: epoch,
    })
  })

  it('synchronise les tables de budget mensuel et de report en push et en pull', async () => {
    await createRepository('categories', database.categories, database).create(
      categoryInput(categoryId),
    )
    await createRepository('transactions', database.transactions, database).create({
      workspace_id: workspaceId,
      category_id: categoryId,
      kind: 'expense',
      amount: 1_200,
      occurred_on: '2026-10-24',
      note: null,
      created_by: userId,
      paid_by: userId,
    })
    await createRepository('budgets', database.budgets, database).create({
      workspace_id: workspaceId,
      category_id: categoryId,
      month: '2026-10-01',
      limit_amount: 10_000,
    })
    await createRepository('monthlyBudgets', database.monthlyBudgets, database).create({
      workspace_id: workspaceId,
      month: '2026-10-01',
      budget_amount: 100_000,
    })
    await createRepository('monthCarryDecisions', database.monthCarryDecisions, database).create({
      workspace_id: workspaceId,
      month: '2026-10-01',
      accepted: true,
    })

    const result = await createSyncEngine(userId, gateway, database).synchronize(
      new AbortController().signal,
    )

    expect(result.pushed).toBe(5)
    expect(gateway.pushes.map((operation) => operation.table)).toEqual([
      'categories',
      'transactions',
      'budgets',
      'monthlyBudgets',
      'monthCarryDecisions',
    ])
    expect(new Set(gateway.changedQueries.map((query) => query.table))).toEqual(
      new Set([
        'categories',
        'transactions',
        'budgets',
        'monthlyBudgets',
        'monthCarryDecisions',
        'recurringExpenses',
      ]),
    )
    expect(await database.outbox.count()).toBe(0)
  })

  it('bloque la file après une erreur permanente et permet une reprise explicite', async () => {
    const repository = createRepository('categories', database.categories, database)
    await repository.create(categoryInput(categoryId, 'Alimentation'))
    await repository.create(categoryInput(secondCategoryId, 'Transport'))
    gateway.failNextPush = new SyncFailure('Écriture refusée.', 'permanent')
    const engine = createSyncEngine(userId, gateway, database)

    await expect(engine.synchronize(new AbortController().signal)).rejects.toMatchObject({
      kind: 'permanent',
    })
    expect(await database.outbox.where('status').equals('failed').count()).toBe(1)
    expect(gateway.pushes).toHaveLength(1)

    await retryFailedSyncOperations(database)
    await engine.synchronize(new AbortController().signal)

    expect(await database.outbox.count()).toBe(0)
    expect(gateway.remoteCategories.size).toBe(2)
  })

  it('conserve les opérations locales quand la session a expiré', async () => {
    const repository = createRepository('categories', database.categories, database)
    await repository.create(categoryInput(categoryId))
    gateway.failNextPush = new SyncFailure('Session expirée.', 'unauthorized')

    await expect(
      createSyncEngine(userId, gateway, database).synchronize(new AbortController().signal),
    ).rejects.toMatchObject({ kind: 'unauthorized' })

    expect(await database.outbox.where('status').equals('pending').count()).toBe(1)
    expect(await database.outbox.where('status').equals('failed').count()).toBe(0)
    expect(await database.categories.get(categoryId)).toBeDefined()
  })

  it('reconcilie un accès retiré pendant le push et purge sans perdre un tombstone', async () => {
    const repository = createRepository('categories', database.categories, database)
    await repository.create(categoryInput(categoryId))
    gateway.revokeAfterFirstMembershipCheck = true
    gateway.failNextPush = new SyncFailure('Accès refusé.', 'forbidden')

    await createSyncEngine(userId, gateway, database).synchronize(new AbortController().signal)

    expect(await database.workspaces.get(workspaceId)).toBeUndefined()
    expect(await database.outbox.count()).toBe(0)
  })

  it('le chargement initial reste séparé de l’outbox', async () => {
    const remote = makeCategory(categoryId)
    await bootstrapLocalData(
      userId,
      {
        fetchSnapshot: async () => ({
          profiles: [],
          workspaces: [
            {
              id: workspaceId,
              name: 'Perso',
              type: 'personal',
              currency: 'MGA',
              owner_id: userId,
              created_at: epoch,
              updated_at: epoch,
              deleted_at: null,
            },
          ],
          memberships: [makeMembership()],
          invitations: [],
          categories: [remote],
          transactions: [],
          budgets: [],
          monthlyBudgets: [],
          monthCarryDecisions: [],
          recurringExpenses: [],
        }),
      },
      database,
    )

    expect(await database.categories.get(categoryId)).toEqual(remote)
    expect(await database.outbox.count()).toBe(0)
  })
})
