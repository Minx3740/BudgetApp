import type { SupabaseClient } from '@supabase/supabase-js'
import type { Table } from 'dexie'
import type { BudgetDatabase, OutboxOperation, SyncCursor } from './database'
import { db } from './database'
import { purgeLocalWorkspace } from './bootstrap'
import {
  editableRowSchemas,
  membershipSchema,
  type EditableRows,
  type EditableTable,
  type Membership,
} from './models'

const pageSize = 1000
const cursorOverlapMs = 60_000
const editableTables: EditableTable[] = [
  'categories',
  'transactions',
  'budgets',
  'monthlyBudgets',
  'monthCarryDecisions',
]

export type SyncFailureKind = 'network' | 'unauthorized' | 'forbidden' | 'permanent'

export class SyncFailure extends Error {
  readonly kind: SyncFailureKind
  readonly code: string | undefined

  constructor(message: string, kind: SyncFailureKind, code?: string) {
    super(message)
    this.name = 'SyncFailure'
    this.kind = kind
    this.code = code
  }
}

export interface SyncGateway {
  fetchMemberships(userId: string, signal: AbortSignal): Promise<Membership[]>
  getServerTime(signal: AbortSignal): Promise<string>
  push(operation: OutboxOperation, signal: AbortSignal): Promise<unknown>
  fetchChangedRows(
    table: EditableTable,
    workspaceId: string,
    after: string,
    through: string,
    signal: AbortSignal,
  ): Promise<unknown[]>
}

export interface SyncResult {
  pushed: number
  pulled: number
  workspaceCount: number
}

interface SupabaseErrorLike {
  message: string
  code?: string
  status?: number
}

interface PageResult {
  data: unknown[] | null
  error: SupabaseErrorLike | null
}

type PageQuery = (from: number, to: number) => PromiseLike<PageResult>

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new DOMException('Synchronisation annulée.', 'AbortError')
  }
}

function classifyFailure(error: unknown): SyncFailure {
  if (error instanceof SyncFailure) {
    return error
  }
  if (error instanceof TypeError) {
    return new SyncFailure(error.message || 'Réseau indisponible.', 'network')
  }
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const candidate = error as SupabaseErrorLike
    if (candidate.status === 401 || candidate.code === 'PGRST301' || candidate.code === '401') {
      return new SyncFailure(
        'Session expirée. Reconnecte-toi pour synchroniser.',
        'unauthorized',
        candidate.code,
      )
    }
    if (candidate.status === 403 || candidate.code === '42501' || candidate.code === '403') {
      return new SyncFailure('Accès refusé par le serveur.', 'forbidden', candidate.code)
    }
    if (
      candidate.status === 0 ||
      candidate.status === 408 ||
      candidate.status === 429 ||
      (typeof candidate.status === 'number' && candidate.status >= 500)
    ) {
      return new SyncFailure(
        'Le serveur est temporairement indisponible.',
        'network',
        candidate.code,
      )
    }
    return new SyncFailure(candidate.message, 'permanent', candidate.code)
  }
  return new SyncFailure(
    error instanceof Error ? error.message : 'Erreur inconnue de synchronisation.',
    'permanent',
  )
}

function throwSupabaseError(error: SupabaseErrorLike | null): void {
  if (error) {
    throw classifyFailure(error)
  }
}

async function fetchAllPages(queryPage: PageQuery): Promise<unknown[]> {
  const rows: unknown[] = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await queryPage(from, from + pageSize - 1)
    throwSupabaseError(error)
    if (!data) {
      throw new SyncFailure('Le serveur a renvoyé une réponse sans données.', 'permanent')
    }
    rows.push(...data)
    if (data.length < pageSize) {
      return rows
    }
  }
}

function parseRow<K extends EditableTable>(table: K, row: unknown): EditableRows[K] {
  const result = editableRowSchemas[table].safeParse(row)
  if (!result.success) {
    const detail = result.error.issues[0]?.message ?? 'structure invalide'
    throw new SyncFailure(`Données invalides reçues pour ${table} : ${detail}`, 'permanent')
  }
  return result.data
}

function createPageQuery(
  client: SupabaseClient,
  table: EditableTable,
  workspaceId: string,
  after: string,
  through: string,
  signal: AbortSignal,
): (from: number, to: number) => PromiseLike<PageResult> {
  switch (table) {
    case 'categories':
      return (from, to) =>
        client
          .from('categories')
          .select('*')
          .eq('workspace_id', workspaceId)
          .gt('updated_at', after)
          .lte('updated_at', through)
          .order('updated_at')
          .order('id')
          .abortSignal(signal)
          .range(from, to)
    case 'transactions':
      return (from, to) =>
        client
          .from('transactions')
          .select('*')
          .eq('workspace_id', workspaceId)
          .gt('updated_at', after)
          .lte('updated_at', through)
          .order('updated_at')
          .order('id')
          .abortSignal(signal)
          .range(from, to)
    case 'budgets':
      return (from, to) =>
        client
          .from('budgets')
          .select('*')
          .eq('workspace_id', workspaceId)
          .gt('updated_at', after)
          .lte('updated_at', through)
          .order('updated_at')
          .order('id')
          .abortSignal(signal)
          .range(from, to)
    case 'monthlyBudgets':
      return (from, to) =>
        client
          .from('monthly_budgets')
          .select('*')
          .eq('workspace_id', workspaceId)
          .gt('updated_at', after)
          .lte('updated_at', through)
          .order('updated_at')
          .order('id')
          .abortSignal(signal)
          .range(from, to)
    case 'monthCarryDecisions':
      return (from, to) =>
        client
          .from('month_carry_decisions')
          .select('*')
          .eq('workspace_id', workspaceId)
          .gt('updated_at', after)
          .lte('updated_at', through)
          .order('updated_at')
          .order('id')
          .abortSignal(signal)
          .range(from, to)
  }
}

export function createSupabaseSyncGateway(client: SupabaseClient): SyncGateway {
  return {
    async fetchMemberships(userId, signal) {
      const rows = await fetchAllPages((from, to) =>
        client
          .from('memberships')
          .select('*')
          .eq('user_id', userId)
          .order('workspace_id')
          .abortSignal(signal)
          .range(from, to),
      )
      return rows.map((row, index) => {
        const result = membershipSchema.safeParse(row)
        if (!result.success) {
          const detail = result.error.issues[0]?.message ?? 'structure invalide'
          throw new SyncFailure(
            `Appartenance invalide reçue à la ligne ${index + 1} : ${detail}`,
            'permanent',
          )
        }
        return result.data
      })
    },

    async getServerTime(signal) {
      const { data, error } = await client.rpc('sync_server_time').abortSignal(signal)
      throwSupabaseError(error)
      if (typeof data !== 'string' || Number.isNaN(Date.parse(data))) {
        throw new SyncFailure('Le serveur a renvoyé une heure invalide.', 'permanent')
      }
      return new Date(data).toISOString()
    },

    async push(operation, signal) {
      switch (operation.table) {
        case 'categories': {
          const { data, error } = await client
            .from('categories')
            .upsert(operation.payload, { onConflict: 'id' })
            .abortSignal(signal)
            .select('*')
            .single()
          throwSupabaseError(error)
          return data
        }
        case 'transactions': {
          const { data, error } = await client
            .from('transactions')
            .upsert(operation.payload, { onConflict: 'id' })
            .abortSignal(signal)
            .select('*')
            .single()
          throwSupabaseError(error)
          return data
        }
        case 'budgets': {
          const { data, error } = await client
            .from('budgets')
            .upsert(operation.payload, { onConflict: 'id' })
            .abortSignal(signal)
            .select('*')
            .single()
          throwSupabaseError(error)
          return data
        }
        case 'monthlyBudgets': {
          const { data, error } = await client
            .from('monthly_budgets')
            .upsert(operation.payload, { onConflict: 'id' })
            .abortSignal(signal)
            .select('*')
            .single()
          throwSupabaseError(error)
          return data
        }
        case 'monthCarryDecisions': {
          const { data, error } = await client
            .from('month_carry_decisions')
            .upsert(operation.payload, { onConflict: 'id' })
            .abortSignal(signal)
            .select('*')
            .single()
          throwSupabaseError(error)
          return data
        }
      }
    },

    async fetchChangedRows(table, workspaceId, after, through, signal) {
      return fetchAllPages(createPageQuery(client, table, workspaceId, after, through, signal))
    },
  }
}

function operationKey(operation: OutboxOperation): string {
  return `${operation.table}:${operation.payload.id}`
}

function cursorId(workspaceId: string, table: EditableTable): string {
  return `${workspaceId}:${table}`
}

function localTableFor<K extends EditableTable>(
  database: BudgetDatabase,
  tableName: K,
): Table<EditableRows[K], string> {
  return database[tableName] as Table<EditableRows[K], string>
}

function subtractOverlap(timestamp: string): string {
  return new Date(Date.parse(timestamp) - cursorOverlapMs).toISOString()
}

async function deleteOutboxOperation(database: BudgetDatabase, operationId: string): Promise<void> {
  await database.outbox.delete(operationId)
}

async function savePushResult(
  database: BudgetDatabase,
  operation: OutboxOperation,
  rawServerRow: unknown,
): Promise<void> {
  const serverRow = parseRow(operation.table, rawServerRow)
  const localTable = localTableFor(database, operation.table)

  await database.transaction('rw', localTable, database.outbox, async () => {
    const sameRowOperations = (await database.outbox.toArray()).filter(
      (candidate) => operationKey(candidate) === operationKey(operation),
    )
    if (serverRow.deleted_at !== null) {
      await localTable.put(serverRow)
      await database.outbox.bulkDelete(sameRowOperations.map((candidate) => candidate.op_id))
      return
    }
    const hasLaterOperation = sameRowOperations.some(
      (candidate) => candidate.op_id !== operation.op_id,
    )
    if (!hasLaterOperation) {
      await localTable.put(serverRow)
    }
    await deleteOutboxOperation(database, operation.op_id)
  })
}

async function markOperationFailure(
  userId: string,
  gateway: SyncGateway,
  database: BudgetDatabase,
  operation: OutboxOperation,
  error: SyncFailure,
  signal: AbortSignal,
): Promise<boolean> {
  if (error.kind === 'forbidden') {
    try {
      const remoteMemberships = await gateway.fetchMemberships(userId, signal)
      const stillHasAccess = remoteMemberships.some(
        (membership) =>
          membership.user_id === userId &&
          membership.workspace_id === operation.payload.workspace_id,
      )
      if (!stillHasAccess) {
        await database.transaction('rw', database.tables, async () => {
          await purgeLocalWorkspace(database, operation.payload.workspace_id)
        })
        return true
      }
    } catch (membershipFailure) {
      await database.outbox.update(operation.op_id, {
        status: 'pending',
        last_error: 'Impossible de vérifier les droits. La synchronisation sera réessayée.',
      })
      throw classifyFailure(membershipFailure)
    }
  }

  await database.outbox.update(operation.op_id, {
    status:
      signal.aborted || error.kind === 'network' || error.kind === 'unauthorized'
        ? 'pending'
        : 'failed',
    last_error: error.message,
  })
  return false
}

async function pushPendingOperations(
  userId: string,
  accessibleWorkspaceIds: Set<string>,
  gateway: SyncGateway,
  database: BudgetDatabase,
  signal: AbortSignal,
): Promise<number> {
  await database.outbox.where('status').equals('processing').modify({ status: 'pending' })
  const queue = (await database.outbox.toArray()).sort(
    (left, right) =>
      left.created_at.localeCompare(right.created_at) || left.op_id.localeCompare(right.op_id),
  )
  let pushed = 0

  for (const operation of queue) {
    throwIfAborted(signal)
    if (!accessibleWorkspaceIds.has(operation.payload.workspace_id)) {
      continue
    }
    if (operation.status === 'failed') {
      throw new SyncFailure(
        operation.last_error ?? 'Une opération précédente doit être corrigée avant de continuer.',
        'permanent',
      )
    }
    if (operation.status !== 'pending') {
      continue
    }

    const claimed = await database.transaction('rw', database.outbox, async () => {
      const current = await database.outbox.get(operation.op_id)
      if (!current || current.status !== 'pending') {
        return false
      }
      await database.outbox.update(operation.op_id, {
        status: 'processing',
        attempts: current.attempts + 1,
        last_error: undefined,
      })
      return true
    })
    if (!claimed) {
      continue
    }

    try {
      const serverRow = await gateway.push(operation, signal)
      throwIfAborted(signal)
      await savePushResult(database, operation, serverRow)
      pushed += 1
    } catch (failure) {
      const syncFailure = classifyFailure(failure)
      const accessWasRevoked = await markOperationFailure(
        userId,
        gateway,
        database,
        operation,
        syncFailure,
        signal,
      )
      if (accessWasRevoked) {
        continue
      }
      throw syncFailure
    }
  }
  return pushed
}

function parseChangedRows<K extends EditableTable>(
  table: K,
  workspaceId: string,
  rows: unknown[],
): EditableRows[K][] {
  return rows.map((rawRow, index) => {
    const row = parseRow(table, rawRow)
    if (row.workspace_id !== workspaceId) {
      throw new SyncFailure(
        `Le serveur a renvoyé une ligne ${table} appartenant à un autre espace (ligne ${index + 1}).`,
        'permanent',
      )
    }
    return row
  })
}

async function pullTable<K extends EditableTable>(
  workspaceId: string,
  tableName: K,
  through: string,
  gateway: SyncGateway,
  database: BudgetDatabase,
  signal: AbortSignal,
): Promise<number> {
  const id = cursorId(workspaceId, tableName)
  const cursor = await database.syncCursors.get(id)
  const after = subtractOverlap(cursor?.cursor ?? new Date(0).toISOString())
  const rawRows = await gateway.fetchChangedRows(tableName, workspaceId, after, through, signal)
  throwIfAborted(signal)
  const rows = parseChangedRows(tableName, workspaceId, rawRows)
  const localTable = localTableFor(database, tableName)

  await database.transaction('rw', localTable, database.outbox, database.syncCursors, async () => {
    const operations = await database.outbox.toArray()
    for (const row of rows) {
      const matchingOperations = operations.filter(
        (operation) => operation.table === tableName && operation.payload.id === row.id,
      )
      if (row.deleted_at !== null) {
        await localTable.put(row)
        await database.outbox.bulkDelete(matchingOperations.map((operation) => operation.op_id))
      } else if (matchingOperations.length === 0) {
        await localTable.put(row)
      }
    }
    const nextCursor: SyncCursor = {
      id,
      workspace_id: workspaceId,
      table: tableName,
      cursor: through,
    }
    await database.syncCursors.put(nextCursor)
  })
  return rows.length
}

async function runSync(
  userId: string,
  gateway: SyncGateway,
  database: BudgetDatabase,
  signal: AbortSignal,
): Promise<SyncResult> {
  throwIfAborted(signal)
  const memberships = (await gateway.fetchMemberships(userId, signal)).map((membership) => {
    const result = membershipSchema.safeParse(membership)
    if (!result.success) {
      throw new SyncFailure('Le serveur a renvoyé une appartenance invalide.', 'permanent')
    }
    return result.data
  })
  const accessibleWorkspaceIds = new Set(
    memberships
      .filter((membership) => membership.user_id === userId)
      .map((membership) => membership.workspace_id),
  )
  const localMemberships = await database.memberships.where('user_id').equals(userId).toArray()
  const removedWorkspaceIds = localMemberships
    .filter((membership) => !accessibleWorkspaceIds.has(membership.workspace_id))
    .map((membership) => membership.workspace_id)

  if (removedWorkspaceIds.length > 0) {
    await database.transaction('rw', database.tables, async () => {
      for (const workspaceId of removedWorkspaceIds) {
        await purgeLocalWorkspace(database, workspaceId)
      }
    })
  }
  await database.memberships.bulkPut(
    memberships.filter((membership) => membership.user_id === userId),
  )

  const pushed = await pushPendingOperations(
    userId,
    accessibleWorkspaceIds,
    gateway,
    database,
    signal,
  )
  throwIfAborted(signal)
  const through = await gateway.getServerTime(signal)
  if (Number.isNaN(Date.parse(through))) {
    throw new SyncFailure('Le serveur a renvoyé une heure invalide.', 'permanent')
  }
  const localWorkspaceIds = new Set(await database.workspaces.toCollection().primaryKeys())
  const workspaceIds = [...accessibleWorkspaceIds]
    .filter((workspaceId) => localWorkspaceIds.has(workspaceId))
    .sort()

  let pulled = 0
  for (const workspaceId of workspaceIds) {
    for (const table of editableTables) {
      throwIfAborted(signal)
      pulled += await pullTable(workspaceId, table, through, gateway, database, signal)
    }
  }

  await database.syncMetadata.put({
    key: 'last-successful-sync',
    value: through,
  })
  return { pushed, pulled, workspaceCount: workspaceIds.length }
}

export function createSyncEngine(
  userId: string,
  gateway: SyncGateway,
  database: BudgetDatabase = db,
) {
  let activeRun: Promise<SyncResult> | null = null

  return {
    synchronize(signal: AbortSignal): Promise<SyncResult> {
      if (activeRun) {
        return activeRun
      }
      activeRun = runSync(userId, gateway, database, signal).finally(() => {
        activeRun = null
      })
      return activeRun
    },
  }
}

export function createSupabaseSyncEngine(
  client: SupabaseClient,
  userId: string,
  database: BudgetDatabase = db,
) {
  return createSyncEngine(userId, createSupabaseSyncGateway(client), database)
}

export async function retryFailedSyncOperations(database: BudgetDatabase = db): Promise<void> {
  await database.transaction('rw', database.outbox, async () => {
    const failed = await database.outbox.where('status').equals('failed').toArray()
    await Promise.all(
      failed.map((operation) =>
        database.outbox.update(operation.op_id, {
          status: 'pending',
          last_error: undefined,
        }),
      ),
    )
  })
}
