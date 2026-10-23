import type { Table } from 'dexie'
import { db, type BudgetDatabase, type OutboxOperation } from './database'
import { editableRowSchemas, type EditableRows, type EditableTable } from './models'

type RepositoryRow<K extends EditableTable> = EditableRows[K]
type CreateInput<K extends EditableTable> = Omit<
  RepositoryRow<K>,
  'id' | 'created_at' | 'updated_at' | 'deleted_at'
> & { id?: string }
type UpdateInput<K extends EditableTable> = Partial<
  Omit<
    RepositoryRow<K>,
    'id' | 'workspace_id' | 'created_at' | 'updated_at' | 'deleted_at' | 'created_by'
  >
>

export interface Repository<K extends EditableTable> {
  create(input: CreateInput<K>): Promise<RepositoryRow<K>>
  update(id: string, workspaceId: string, changes: UpdateInput<K>): Promise<RepositoryRow<K>>
  softDelete(id: string, workspaceId: string): Promise<RepositoryRow<K>>
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
): OutboxOperation {
  return {
    op_id: createUuid(),
    table,
    action,
    payload,
    created_at: createdAt,
    attempts: 0,
    status: 'pending',
  } as OutboxOperation
}

export function createRepository<K extends EditableTable>(
  tableName: K,
  table: Table<RepositoryRow<K>, string>,
  database: BudgetDatabase = db,
): Repository<K> {
  const schema = editableRowSchemas[tableName]

  return {
    async create(input) {
      const now = new Date().toISOString()
      const row = schema.parse({
        ...input,
        id: input.id ?? createUuid(),
        created_at: now,
        updated_at: now,
        deleted_at: null,
      })

      await database.transaction('rw', table, database.outbox, async () => {
        await table.add(row)
        const queuedAt = await nextOutboxTimestamp(database, now)
        await database.outbox.add(makeOutboxOperation(tableName, 'upsert', row, queuedAt))
      })

      return row
    },

    async update(id, workspaceId, changes) {
      return database.transaction('rw', table, database.outbox, async () => {
        const existing = await table.get(id)
        if (!existing || existing.workspace_id !== workspaceId || existing.deleted_at !== null) {
          throw new Error(`${tableName} row ${id} is not available in workspace ${workspaceId}.`)
        }

        const now = nextTimestamp(existing.updated_at)
        const row = schema.parse({ ...existing, ...changes, updated_at: now })
        await table.put(row)
        const queuedAt = await nextOutboxTimestamp(database, now)
        await database.outbox.add(makeOutboxOperation(tableName, 'upsert', row, queuedAt))
        return row
      })
    },

    async softDelete(id, workspaceId) {
      return database.transaction('rw', table, database.outbox, async () => {
        const existing = await table.get(id)
        if (!existing || existing.workspace_id !== workspaceId || existing.deleted_at !== null) {
          throw new Error(`${tableName} row ${id} is not available in workspace ${workspaceId}.`)
        }

        const now = nextTimestamp(existing.updated_at)
        const row = schema.parse({ ...existing, updated_at: now, deleted_at: now })
        await table.put(row)
        const queuedAt = await nextOutboxTimestamp(database, now)
        await database.outbox.add(makeOutboxOperation(tableName, 'delete', row, queuedAt))
        return row
      })
    },

    async list(workspaceId, includeDeleted = false) {
      const rows = await table.where('workspace_id').equals(workspaceId).toArray()
      return includeDeleted ? rows : rows.filter((row) => row.deleted_at === null)
    },
  }
}

export const accountsRepository = createRepository('accounts', db.accounts)
export const categoriesRepository = createRepository('categories', db.categories)
export const transactionsRepository = createRepository('transactions', db.transactions)
export const budgetsRepository = createRepository('budgets', db.budgets)

export async function listOutbox(): Promise<OutboxOperation[]> {
  return db.outbox.orderBy('created_at').toArray()
}

export async function countPendingOperations(): Promise<number> {
  return db.outbox.where('status').equals('pending').count()
}
