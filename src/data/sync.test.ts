import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { bootstrapLocalData } from './bootstrap'
import { BudgetDatabase, type OutboxOperation } from './database'
import { createRepository } from './repositories'
import { createSyncEngine, retryFailedSyncOperations, SyncFailure, type SyncGateway } from './sync'
import type { Account, EditableTable, Membership } from './models'

const workspaceId = '00000000-0000-4000-8000-000000000001'
const userId = '00000000-0000-4000-8000-000000000002'
const accountId = '00000000-0000-4000-8000-000000000003'
const secondAccountId = '00000000-0000-4000-8000-000000000004'
const epoch = '2026-10-24T10:00:00.000Z'

function makeAccount(id: string, overrides: Partial<Account> = {}): Account {
  return {
    id,
    workspace_id: workspaceId,
    name: 'Espèces',
    type: 'cash',
    initial_balance: 0,
    archived_at: null,
    created_at: epoch,
    updated_at: epoch,
    deleted_at: null,
    ...overrides,
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

class FakeSyncGateway implements SyncGateway {
  memberships: Membership[] = [makeMembership()]
  serverTime = epoch
  pushes: OutboxOperation[] = []
  changedQueries: { table: EditableTable; after: string; through: string }[] = []
  remoteAccounts = new Map<string, Account>()
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
    if (operation.table !== 'accounts') {
      return operation.payload
    }

    const existing = this.remoteAccounts.get(operation.payload.id)
    if (existing && existing.deleted_at !== null && operation.payload.deleted_at === null) {
      return existing
    }
    const row = makeAccount(operation.payload.id, {
      ...operation.payload,
      created_at: existing?.created_at ?? this.serverTime,
      updated_at: this.serverTime,
      deleted_at: existing?.deleted_at ?? operation.payload.deleted_at,
    })
    this.remoteAccounts.set(row.id, row)
    if (this.failAfterCommitOnce) {
      this.failAfterCommitOnce = false
      throw new SyncFailure('Réponse perdue après validation du serveur.', 'network')
    }
    return row
  }

  async fetchChangedRows(
    table: EditableTable,
    workspaceId: string,
    after: string,
    through: string,
  ): Promise<unknown[]> {
    this.changedQueries.push({ table, after, through })
    if (table !== 'accounts') {
      return []
    }
    return [...this.remoteAccounts.values()].filter(
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
    const repository = createRepository('accounts', database.accounts, database)
    const first = await repository.create({
      id: accountId,
      workspace_id: workspaceId,
      name: 'Espèces',
      type: 'cash',
      initial_balance: 100,
      archived_at: null,
    })
    await repository.create({
      id: secondAccountId,
      workspace_id: workspaceId,
      name: 'Banque',
      type: 'bank',
      initial_balance: 200,
      archived_at: null,
    })
    gateway.failOnPushNumber = 2
    const engine = createSyncEngine(userId, gateway, database)

    await expect(engine.synchronize(new AbortController().signal)).rejects.toMatchObject({
      kind: 'network',
    })
    expect(await database.outbox.orderBy('created_at').toArray()).toMatchObject([
      { payload: { id: secondAccountId }, status: 'pending', attempts: 1 },
    ])
    expect(gateway.remoteAccounts.size).toBe(1)

    const result = await engine.synchronize(new AbortController().signal)

    expect(result.pushed).toBe(1)
    expect(gateway.pushes.map((operation) => operation.payload.id)).toEqual([
      first.id,
      secondAccountId,
      secondAccountId,
    ])
    expect(gateway.remoteAccounts.size).toBe(2)
    expect(await database.outbox.count()).toBe(0)
    expect((await database.accounts.get(first.id))?.updated_at).toBe(epoch)
    expect(await database.syncMetadata.get('last-successful-sync')).toEqual({
      key: 'last-successful-sync',
      value: epoch,
    })
  })

  it('récupère une opération restée en traitement après fermeture de l’application', async () => {
    const repository = createRepository('accounts', database.accounts, database)
    const account = await repository.create({
      id: accountId,
      workspace_id: workspaceId,
      name: 'Espèces',
      type: 'cash',
      initial_balance: 0,
      archived_at: null,
    })
    await database.outbox.update((await database.outbox.toArray())[0]!.op_id, {
      status: 'processing',
    })

    await createSyncEngine(userId, gateway, database).synchronize(new AbortController().signal)

    expect(gateway.remoteAccounts.get(account.id)?.name).toBe('Espèces')
    expect(await database.outbox.count()).toBe(0)
  })

  it('préserve les tables et lignes existantes lors de la migration Dexie vers le schéma M6', async () => {
    const name = `sync-upgrade-${crypto.randomUUID()}`
    const legacyDatabase = new Dexie(name)
    legacyDatabase.version(1).stores({
      accounts: 'id, workspace_id, updated_at, deleted_at',
      outbox: 'op_id, status, created_at, [status+created_at]',
    })
    await legacyDatabase.open()
    const account = makeAccount(accountId)
    await legacyDatabase.table('accounts').put(account)
    await legacyDatabase.table('outbox').put({
      op_id: '00000000-0000-4000-8000-000000000005',
      table: 'accounts',
      action: 'upsert',
      payload: account,
      created_at: epoch,
      attempts: 1,
      status: 'pending',
    })
    legacyDatabase.close()

    const upgradedDatabase = new BudgetDatabase(name)
    await upgradedDatabase.open()

    expect(await upgradedDatabase.accounts.get(accountId)).toEqual(account)
    expect(await upgradedDatabase.outbox.count()).toBe(1)
    expect(upgradedDatabase.tables.map((table) => table.name)).toContain('syncCursors')
    expect(upgradedDatabase.tables.map((table) => table.name)).toContain('syncMetadata')

    upgradedDatabase.close()
  })

  it('rejoue sans doublon une opération acceptée par le serveur dont l’accusé a été perdu', async () => {
    const repository = createRepository('accounts', database.accounts, database)
    await repository.create({
      id: accountId,
      workspace_id: workspaceId,
      name: 'Espèces',
      type: 'cash',
      initial_balance: 0,
      archived_at: null,
    })
    gateway.failAfterCommitOnce = true
    const engine = createSyncEngine(userId, gateway, database)

    await expect(engine.synchronize(new AbortController().signal)).rejects.toMatchObject({
      kind: 'network',
    })
    expect(gateway.remoteAccounts.size).toBe(1)
    expect(await database.outbox.count()).toBe(1)

    await engine.synchronize(new AbortController().signal)

    expect(gateway.remoteAccounts.size).toBe(1)
    expect(await database.outbox.count()).toBe(0)
    expect(gateway.pushes).toHaveLength(2)
    expect(gateway.pushes[0]?.payload.id).toBe(gateway.pushes[1]?.payload.id)
  })

  it('applique les lignes distantes et réutilise le curseur avec le chevauchement serveur', async () => {
    const stale = makeAccount(accountId, { name: 'Ancien nom' })
    await database.accounts.put(stale)
    gateway.remoteAccounts.set(
      accountId,
      makeAccount(accountId, { name: 'Nouveau nom', updated_at: epoch }),
    )
    const engine = createSyncEngine(userId, gateway, database)

    await engine.synchronize(new AbortController().signal)
    expect((await database.accounts.get(accountId))?.name).toBe('Nouveau nom')
    expect(await database.syncCursors.get(`${workspaceId}:accounts`)).toEqual({
      id: `${workspaceId}:accounts`,
      workspace_id: workspaceId,
      table: 'accounts',
      cursor: epoch,
    })

    gateway.serverTime = '2026-10-24T10:01:00.000Z'
    await engine.synchronize(new AbortController().signal)

    const accountQuery = gateway.changedQueries.filter((query) => query.table === 'accounts')
    expect(accountQuery[1]?.after).toBe('2026-10-24T09:59:00.000Z')
    expect(accountQuery[1]?.through).toBe(gateway.serverTime)
    expect((await database.accounts.get(accountId))?.name).toBe('Nouveau nom')
  })

  it('arbitre un conflit avec le timestamp serveur plutôt que l’horloge locale', async () => {
    gateway.remoteAccounts.set(
      accountId,
      makeAccount(accountId, { name: 'Modification distante', updated_at: epoch }),
    )
    const repository = createRepository('accounts', database.accounts, database)
    await repository.create({
      id: accountId,
      workspace_id: workspaceId,
      name: 'Modification de cet appareil',
      type: 'cash',
      initial_balance: 0,
      archived_at: null,
    })

    await createSyncEngine(userId, gateway, database).synchronize(new AbortController().signal)

    expect(gateway.remoteAccounts.get(accountId)).toMatchObject({
      name: 'Modification de cet appareil',
      updated_at: epoch,
    })
    expect(await database.accounts.get(accountId)).toMatchObject({
      name: 'Modification de cet appareil',
      updated_at: epoch,
    })
  })

  it('fait primer une suppression serveur sur une modification locale en attente', async () => {
    const repository = createRepository('accounts', database.accounts, database)
    await repository.create({
      id: accountId,
      workspace_id: workspaceId,
      name: 'Espèces',
      type: 'cash',
      initial_balance: 0,
      archived_at: null,
    })
    const deleted = makeAccount(accountId, {
      name: 'Espèces supprimées',
      deleted_at: '2026-10-24T09:59:00.000Z',
      updated_at: '2026-10-24T09:59:00.000Z',
    })
    gateway.remoteAccounts.set(accountId, deleted)

    await createSyncEngine(userId, gateway, database).synchronize(new AbortController().signal)

    expect((await database.accounts.get(accountId))?.deleted_at).not.toBeNull()
    expect(await database.outbox.count()).toBe(0)
    expect(gateway.remoteAccounts.get(accountId)?.deleted_at).not.toBeNull()
  })

  it('propage une suppression locale au serveur sous forme de tombstone', async () => {
    const repository = createRepository('accounts', database.accounts, database)
    const account = await repository.create({
      id: accountId,
      workspace_id: workspaceId,
      name: 'Espèces',
      type: 'cash',
      initial_balance: 0,
      archived_at: null,
    })
    await repository.softDelete(account.id, workspaceId)

    await createSyncEngine(userId, gateway, database).synchronize(new AbortController().signal)

    expect(gateway.remoteAccounts.get(accountId)?.deleted_at).not.toBeNull()
    expect((await database.accounts.get(accountId))?.deleted_at).not.toBeNull()
    expect(await database.outbox.count()).toBe(0)
  })

  it('purge les données et la file locale dès que l’accès à un espace est retiré', async () => {
    const repository = createRepository('accounts', database.accounts, database)
    await repository.create({
      id: accountId,
      workspace_id: workspaceId,
      name: 'Espèces',
      type: 'cash',
      initial_balance: 0,
      archived_at: null,
    })
    gateway.memberships = []

    await createSyncEngine(userId, gateway, database).synchronize(new AbortController().signal)

    expect(await database.workspaces.get(workspaceId)).toBeUndefined()
    expect(await database.accounts.get(accountId)).toBeUndefined()
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

  it('bloque la file après une erreur permanente et permet une reprise explicite', async () => {
    const repository = createRepository('accounts', database.accounts, database)
    await repository.create({
      id: accountId,
      workspace_id: workspaceId,
      name: 'Espèces',
      type: 'cash',
      initial_balance: 0,
      archived_at: null,
    })
    await repository.create({
      id: secondAccountId,
      workspace_id: workspaceId,
      name: 'Banque',
      type: 'bank',
      initial_balance: 0,
      archived_at: null,
    })
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
    expect(gateway.remoteAccounts.size).toBe(2)
  })

  it('conserve les opérations locales quand la session a expiré', async () => {
    const repository = createRepository('accounts', database.accounts, database)
    await repository.create({
      id: accountId,
      workspace_id: workspaceId,
      name: 'Espèces',
      type: 'cash',
      initial_balance: 0,
      archived_at: null,
    })
    gateway.failNextPush = new SyncFailure('Session expirée.', 'unauthorized')

    await expect(
      createSyncEngine(userId, gateway, database).synchronize(new AbortController().signal),
    ).rejects.toMatchObject({ kind: 'unauthorized' })

    expect(await database.outbox.where('status').equals('pending').count()).toBe(1)
    expect(await database.outbox.where('status').equals('failed').count()).toBe(0)
    expect(await database.accounts.get(accountId)).toBeDefined()
  })

  it('reconcilie un accès retiré pendant le push et purge sans perdre un tombstone', async () => {
    const repository = createRepository('accounts', database.accounts, database)
    await repository.create({
      id: accountId,
      workspace_id: workspaceId,
      name: 'Espèces',
      type: 'cash',
      initial_balance: 0,
      archived_at: null,
    })
    gateway.revokeAfterFirstMembershipCheck = true
    gateway.failNextPush = new SyncFailure('Accès refusé.', 'forbidden')

    await createSyncEngine(userId, gateway, database).synchronize(new AbortController().signal)

    expect(await database.workspaces.get(workspaceId)).toBeUndefined()
    expect(await database.outbox.count()).toBe(0)
  })

  it('le chargement initial reste séparé de l’outbox', async () => {
    const remote = makeAccount(accountId)
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
          accounts: [remote],
          categories: [],
          transactions: [],
          budgets: [],
        }),
      },
      database,
    )

    expect(await database.accounts.get(accountId)).toEqual(remote)
    expect(await database.outbox.count()).toBe(0)
  })
})
