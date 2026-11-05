import type { Table } from 'dexie'
import { db, type BudgetDatabase, type OutboxOperation } from './database'
import {
  editableRowSchemas,
  type EditableInputs,
  type EditableRows,
  type EditableTable,
} from './models'
import { canCreateTransaction, canEditTransaction } from './transaction-permissions'

type RepositoryRow<K extends EditableTable> = EditableRows[K]
type CreateInput<K extends EditableTable> = Omit<
  EditableInputs[K],
  'id' | 'created_at' | 'updated_at' | 'deleted_at'
> & { id?: string }
type UpdateInput<K extends EditableTable> = Partial<
  Omit<
    RepositoryRow<K>,
    'id' | 'workspace_id' | 'created_at' | 'updated_at' | 'deleted_at' | 'created_by'
  >
>

type RepositoryWriteGuard<K extends EditableTable> = (
  row: RepositoryRow<K>,
  actorUserId: string | undefined,
  mode: 'create' | 'update' | 'delete',
) => Promise<void>

export interface Repository<K extends EditableTable> {
  create(input: CreateInput<K>, actorUserId?: string): Promise<RepositoryRow<K>>
  update(
    id: string,
    workspaceId: string,
    changes: UpdateInput<K>,
    actorUserId?: string,
  ): Promise<RepositoryRow<K>>
  softDelete(
    id: string,
    workspaceId: string,
    actorUserId?: string,
    changes?: UpdateInput<K>,
  ): Promise<RepositoryRow<K>>
  list(workspaceId: string, includeDeleted?: boolean): Promise<RepositoryRow<K>[]>
}

function createUuid(): string {
  return globalThis.crypto.randomUUID()
}

function nextTimestamp(previous: string): string {
  return new Date(Math.max(Date.now(), Date.parse(previous) + 1)).toISOString()
}

async function nextOutboxTimestamp(database: BudgetDatabase, candidate: string): Promise<string> {
  const latest = await database.outbox.orderBy('created_at').last()
  if (!latest || Date.parse(latest.created_at) < Date.parse(candidate)) {
    return candidate
  }
  return new Date(Date.parse(latest.created_at) + 1).toISOString()
}

function makeOutboxOperation<K extends EditableTable>(
  table: K,
  action: OutboxOperation['action'],
  payload: RepositoryRow<K>,
  createdAt: string,
  previousPayload: RepositoryRow<K> | null,
): OutboxOperation {
  return {
    op_id: createUuid(),
    table,
    action,
    payload,
    previousPayload,
    created_at: createdAt,
    attempts: 0,
    status: 'pending',
  } as OutboxOperation
}

export function createRepository<K extends EditableTable>(
  tableName: K,
  table: Table<RepositoryRow<K>, string>,
  database: BudgetDatabase = db,
  writeGuard?: RepositoryWriteGuard<K>,
): Repository<K> {
  if (tableName === 'transactions' && !writeGuard) {
    throw new Error('Transactions require an authorizing repository.')
  }

  const schema = editableRowSchemas[tableName]

  return {
    async create(input, actorUserId) {
      const now = new Date().toISOString()
      const row = schema.parse({
        ...input,
        id: input.id ?? createUuid(),
        created_at: now,
        updated_at: now,
        deleted_at: null,
      })

      await database.transaction('rw', table, database.memberships, database.outbox, async () => {
        await writeGuard?.(row, actorUserId, 'create')
        await table.add(row)
        const queuedAt = await nextOutboxTimestamp(database, now)
        await database.outbox.add(makeOutboxOperation(tableName, 'upsert', row, queuedAt, null))
      })

      return row
    },

    async update(id, workspaceId, changes, actorUserId) {
      return database.transaction('rw', table, database.memberships, database.outbox, async () => {
        const existing = await table.get(id)
        if (!existing || existing.workspace_id !== workspaceId || existing.deleted_at !== null) {
          throw new Error(`${tableName} row ${id} is not available in workspace ${workspaceId}.`)
        }

        await writeGuard?.(existing, actorUserId, 'update')
        const now = nextTimestamp(existing.updated_at)
        const row = schema.parse({ ...existing, ...changes, updated_at: now })
        await table.put(row)
        const queuedAt = await nextOutboxTimestamp(database, now)
        await database.outbox.add(makeOutboxOperation(tableName, 'upsert', row, queuedAt, existing))
        return row
      })
    },

    async softDelete(id, workspaceId, actorUserId, changes) {
      return database.transaction('rw', table, database.memberships, database.outbox, async () => {
        const existing = await table.get(id)
        if (!existing || existing.workspace_id !== workspaceId || existing.deleted_at !== null) {
          throw new Error(`${tableName} row ${id} is not available in workspace ${workspaceId}.`)
        }

        await writeGuard?.(existing, actorUserId, 'delete')
        const now = nextTimestamp(existing.updated_at)
        const row = schema.parse({ ...existing, ...changes, updated_at: now, deleted_at: now })
        await table.put(row)
        const queuedAt = await nextOutboxTimestamp(database, now)
        await database.outbox.add(makeOutboxOperation(tableName, 'delete', row, queuedAt, existing))
        return row
      })
    },

    async list(workspaceId, includeDeleted = false) {
      const rows = await table.where('workspace_id').equals(workspaceId).toArray()
      return includeDeleted ? rows : rows.filter((row) => row.deleted_at === null)
    },
  }
}

export const categoriesRepository = createRepository('categories', db.categories)

type TransactionCreateInput = Omit<CreateInput<'transactions'>, 'updated_by'>
type TransactionUpdateInput = Omit<UpdateInput<'transactions'>, 'updated_by'>

export function createTransactionsRepository(database: BudgetDatabase = db) {
  const repository = createRepository(
    'transactions',
    database.transactions,
    database,
    async (transaction, actorUserId, mode) => {
      if (!actorUserId) {
        throw new Error('Un utilisateur est requis pour modifier une transaction.')
      }
      const membership = await database.memberships.get([transaction.workspace_id, actorUserId])
      const allowed =
        mode === 'create'
          ? canCreateTransaction(actorUserId, membership?.role, transaction.created_by)
          : canEditTransaction(actorUserId, membership?.role, transaction)
      if (!allowed) {
        throw new Error('Tu ne peux pas modifier cette transaction dans cet espace.')
      }
    },
  )

  return {
    create(input: TransactionCreateInput, userId: string) {
      return repository.create({ ...input, updated_by: userId }, userId)
    },
    update(id: string, workspaceId: string, changes: TransactionUpdateInput, userId: string) {
      return repository.update(id, workspaceId, { ...changes, updated_by: userId }, userId)
    },
    softDelete(id: string, workspaceId: string, userId: string) {
      return repository.softDelete(id, workspaceId, userId, {
        updated_by: userId,
      })
    },
    list: repository.list,
  }
}

export const transactionsRepository = createTransactionsRepository()

export const budgetsRepository = createRepository('budgets', db.budgets)
export const monthlyBudgetsRepository = createRepository('monthlyBudgets', db.monthlyBudgets)
export const monthCarryDecisionsRepository = createRepository(
  'monthCarryDecisions',
  db.monthCarryDecisions,
)

export async function listOutbox(): Promise<OutboxOperation[]> {
  return db.outbox.orderBy('created_at').toArray()
}

export async function countPendingOperations(): Promise<number> {
  return db.outbox.where('status').equals('pending').count()
}
