import type { SupabaseClient } from '@supabase/supabase-js'
import type { Table } from 'dexie'
import { z } from 'zod'
import { db, type BudgetDatabase, type OutboxOperation } from './database'
import {
  budgetSchema,
  cashflowTransactionSchema,
  categorySchema,
  invitationSchema,
  membershipSchema,
  monthCarryDecisionSchema,
  monthlyBudgetSchema,
  profileSchema,
  workspaceSchema,
  type Budget,
  type CashflowTransaction,
  type Category,
  type EditableRows,
  type EditableTable,
  type Invitation,
  type MonthCarryDecision,
  type Membership,
  type MonthlyBudget,
  type Profile,
  type Workspace,
} from './models'

export interface RawSnapshot {
  profiles: unknown[]
  workspaces: unknown[]
  memberships: unknown[]
  invitations: unknown[]
  categories: unknown[]
  transactions: unknown[]
  budgets: unknown[]
  monthlyBudgets: unknown[]
  monthCarryDecisions: unknown[]
}

export interface WorkspaceSnapshot {
  profiles: Profile[]
  workspaces: Workspace[]
  memberships: Membership[]
  invitations: Invitation[]
  categories: Category[]
  transactions: CashflowTransaction[]
  budgets: Budget[]
  monthlyBudgets: MonthlyBudget[]
  monthCarryDecisions: MonthCarryDecision[]
}

export interface SnapshotSource {
  fetchSnapshot(userId: string): Promise<RawSnapshot>
}

const pageSize = 1000

type PageResult = {
  data: unknown[] | null
  error: { message: string } | null
}

type PageQuery = (from: number, to: number) => PromiseLike<PageResult>

async function fetchAllPages(queryPage: PageQuery): Promise<unknown[]> {
  const rows: unknown[] = []

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await queryPage(from, from + pageSize - 1)
    if (error) {
      throw new Error(error.message)
    }
    if (!data) {
      throw new Error('Le serveur a renvoyé une réponse sans données.')
    }

    rows.push(...data)
    if (data.length < pageSize) {
      return rows
    }
  }
}

function parseRows<T>(table: string, schema: z.ZodType<T>, rows: unknown[]): T[] {
  return rows.map((row, index) => {
    const result = schema.safeParse(row)
    if (!result.success) {
      const detail = result.error.issues[0]?.message ?? 'structure invalide'
      throw new Error(`Données invalides dans ${table}, ligne ${index + 1} : ${detail}`)
    }
    return result.data
  })
}

export function createSupabaseSnapshotSource(
  client: SupabaseClient,
  signal: AbortSignal = new AbortController().signal,
): SnapshotSource {
  return {
    async fetchSnapshot(userId) {
      const ownMemberships = await fetchAllPages((from, to) =>
        client
          .from('memberships')
          .select('*')
          .eq('user_id', userId)
          .order('workspace_id')
          .abortSignal(signal)
          .range(from, to),
      )
      const parsedOwnMemberships = parseRows('memberships', membershipSchema, ownMemberships)
      const workspaceIds = [
        ...new Set(parsedOwnMemberships.map((membership) => membership.workspace_id)),
      ]
      const membershipRows =
        workspaceIds.length === 0
          ? ownMemberships
          : await fetchAllPages((from, to) =>
              client
                .from('memberships')
                .select('*')
                .in('workspace_id', workspaceIds)
                .order('workspace_id')
                .order('user_id')
                .abortSignal(signal)
                .range(from, to),
            )
      const parsedMemberships = parseRows('memberships', membershipSchema, membershipRows)

      const profilesQuery = (from: number, to: number) => {
        const query = client.from('profiles').select('*')
        return (
          workspaceIds.length > 0
            ? query.in('id', [
                ...new Set([userId, ...parsedMemberships.map((membership) => membership.user_id)]),
              ])
            : query.eq('id', userId)
        )
          .order('id')
          .abortSignal(signal)
          .range(from, to)
      }

      const profileRows = await fetchAllPages(profilesQuery)
      if (workspaceIds.length === 0) {
        return {
          profiles: profileRows,
          workspaces: [],
          memberships: parsedMemberships,
          invitations: [],
          categories: [],
          transactions: [],
          budgets: [],
          monthlyBudgets: [],
          monthCarryDecisions: [],
        }
      }

      const [
        workspaces,
        invitations,
        categories,
        transactions,
        budgets,
        monthlyBudgets,
        monthCarryDecisions,
      ] = await Promise.all([
        fetchAllPages((from, to) =>
          client
            .from('workspaces')
            .select('*')
            .in('id', workspaceIds)
            .order('id')
            .abortSignal(signal)
            .range(from, to),
        ),
        fetchAllPages((from, to) =>
          client
            .from('invitations')
            .select('*')
            .in('workspace_id', workspaceIds)
            .order('id')
            .abortSignal(signal)
            .range(from, to),
        ),
        fetchAllPages((from, to) =>
          client
            .from('categories')
            .select('*')
            .in('workspace_id', workspaceIds)
            .order('id')
            .abortSignal(signal)
            .range(from, to),
        ),
        fetchAllPages((from, to) =>
          client
            .from('transactions')
            .select('*')
            .in('workspace_id', workspaceIds)
            .order('id')
            .abortSignal(signal)
            .range(from, to),
        ),
        fetchAllPages((from, to) =>
          client
            .from('budgets')
            .select('*')
            .in('workspace_id', workspaceIds)
            .order('id')
            .range(from, to),
        ),
        fetchAllPages((from, to) =>
          client
            .from('monthly_budgets')
            .select('*')
            .in('workspace_id', workspaceIds)
            .order('id')
            .abortSignal(signal)
            .range(from, to),
        ),
        fetchAllPages((from, to) =>
          client
            .from('month_carry_decisions')
            .select('*')
            .in('workspace_id', workspaceIds)
            .order('id')
            .abortSignal(signal)
            .range(from, to),
        ),
      ])

      return {
        profiles: profileRows,
        workspaces,
        memberships: membershipRows,
        invitations,
        categories,
        transactions,
        budgets,
        monthlyBudgets,
        monthCarryDecisions,
      }
    },
  }
}

function pendingRowKeys(operations: OutboxOperation[]): Set<string> {
  return new Set(operations.map((operation) => `${operation.table}:${operation.payload.id}`))
}

function keyOfMembership(membership: Membership): string {
  return `${membership.workspace_id}:${membership.user_id}`
}

export async function purgeLocalWorkspace(
  database: BudgetDatabase,
  workspaceId: string,
): Promise<void> {
  await Promise.all([
    database.workspaces.delete(workspaceId),
    database.memberships.where('workspace_id').equals(workspaceId).delete(),
    database.invitations.where('workspace_id').equals(workspaceId).delete(),
    database.categories.where('workspace_id').equals(workspaceId).delete(),
    database.transactions.where('workspace_id').equals(workspaceId).delete(),
    database.budgets.where('workspace_id').equals(workspaceId).delete(),
    database.monthlyBudgets.where('workspace_id').equals(workspaceId).delete(),
    database.monthCarryDecisions.where('workspace_id').equals(workspaceId).delete(),
  ])

  const operations = await database.outbox.toArray()
  const workspaceOperations = operations
    .filter((operation) => operation.payload.workspace_id === workspaceId)
    .map((operation) => operation.op_id)
  await database.outbox.bulkDelete(workspaceOperations)
}

export async function bootstrapLocalData(
  userId: string,
  source: SnapshotSource,
  database: BudgetDatabase = db,
  signal?: AbortSignal,
): Promise<{ workspaceCount: number; importedRowCount: number }> {
  const raw = await source.fetchSnapshot(userId)
  if (signal?.aborted) {
    throw new DOMException('Chargement annulé.', 'AbortError')
  }
  const snapshot: WorkspaceSnapshot = {
    profiles: parseRows('profiles', profileSchema, raw.profiles),
    workspaces: parseRows('workspaces', workspaceSchema, raw.workspaces),
    memberships: parseRows('memberships', membershipSchema, raw.memberships),
    invitations: parseRows('invitations', invitationSchema, raw.invitations),
    categories: parseRows('categories', categorySchema, raw.categories),
    transactions: parseRows('transactions', cashflowTransactionSchema, raw.transactions),
    budgets: parseRows('budgets', budgetSchema, raw.budgets),
    monthlyBudgets: parseRows('monthly_budgets', monthlyBudgetSchema, raw.monthlyBudgets),
    monthCarryDecisions: parseRows(
      'month_carry_decisions',
      monthCarryDecisionSchema,
      raw.monthCarryDecisions,
    ),
  }

  const accessibleWorkspaceIds = new Set(
    snapshot.memberships
      .filter((membership) => membership.user_id === userId)
      .map((membership) => membership.workspace_id),
  )
  if (snapshot.workspaces.some((workspace) => !accessibleWorkspaceIds.has(workspace.id))) {
    throw new Error('Le serveur a renvoyé un espace sans appartenance correspondante.')
  }

  const workspaceIds = new Set(snapshot.workspaces.map((workspace) => workspace.id))
  if (snapshot.memberships.some((membership) => !workspaceIds.has(membership.workspace_id))) {
    throw new Error('Le serveur a renvoyé une appartenance sans espace accessible correspondant.')
  }
  const scopedWorkspaceIds = [
    ...snapshot.invitations.map((row) => row.workspace_id),
    ...snapshot.categories.map((row) => row.workspace_id),
    ...snapshot.transactions.map((row) => row.workspace_id),
    ...snapshot.budgets.map((row) => row.workspace_id),
    ...snapshot.monthlyBudgets.map((row) => row.workspace_id),
    ...snapshot.monthCarryDecisions.map((row) => row.workspace_id),
  ]
  if (scopedWorkspaceIds.some((workspaceId) => !workspaceIds.has(workspaceId))) {
    throw new Error('Le serveur a renvoyé des données appartenant à un espace inaccessible.')
  }

  let importedRowCount = 0
  await database.transaction('rw', database.tables, async () => {
    if (signal?.aborted) {
      throw new DOMException('Chargement annulé.', 'AbortError')
    }
    const localMemberships = await database.memberships.where('user_id').equals(userId).toArray()
    const remoteMembershipKeys = new Set(
      snapshot.memberships
        .filter((membership) => membership.user_id === userId)
        .map(keyOfMembership),
    )
    const removedWorkspaceIds = localMemberships
      .filter((membership) => !remoteMembershipKeys.has(keyOfMembership(membership)))
      .map((membership) => membership.workspace_id)

    for (const removedWorkspaceId of removedWorkspaceIds) {
      await purgeLocalWorkspace(database, removedWorkspaceId)
    }

    const pendingKeys = pendingRowKeys(await database.outbox.toArray())
    const replaceUnchanged = async <K extends EditableTable>(
      table: Table<EditableRows[K], string>,
      tableName: K,
      rows: EditableRows[K][],
    ) => {
      const rowsWithoutPendingChanges = rows.filter(
        (row) => !pendingKeys.has(`${tableName}:${row.id}`),
      )
      await table.bulkPut(rowsWithoutPendingChanges)
      return rowsWithoutPendingChanges.length
    }

    await database.profiles.bulkPut(snapshot.profiles)
    await database.workspaces.bulkPut(snapshot.workspaces)

    const remoteMembershipKeysAll = new Set(snapshot.memberships.map(keyOfMembership))
    const localMembershipsInAccessibleWorkspaces = await database.memberships
      .where('workspace_id')
      .anyOf([...workspaceIds])
      .toArray()
    const staleMembershipKeys = localMembershipsInAccessibleWorkspaces
      .filter((membership) => !remoteMembershipKeysAll.has(keyOfMembership(membership)))
      .map((membership): [string, string] => [membership.workspace_id, membership.user_id])
    await database.memberships.bulkDelete(staleMembershipKeys)
    await database.memberships.bulkPut(snapshot.memberships)
    await database.invitations.bulkPut(snapshot.invitations)
    importedRowCount +=
      snapshot.profiles.length +
      snapshot.workspaces.length +
      snapshot.memberships.length +
      snapshot.invitations.length

    importedRowCount += await replaceUnchanged(
      database.categories,
      'categories',
      snapshot.categories,
    )
    importedRowCount += await replaceUnchanged(
      database.transactions,
      'transactions',
      snapshot.transactions,
    )
    importedRowCount += await replaceUnchanged(database.budgets, 'budgets', snapshot.budgets)
    importedRowCount += await replaceUnchanged(
      database.monthlyBudgets,
      'monthlyBudgets',
      snapshot.monthlyBudgets,
    )
    importedRowCount += await replaceUnchanged(
      database.monthCarryDecisions,
      'monthCarryDecisions',
      snapshot.monthCarryDecisions,
    )
  })

  return { workspaceCount: workspaceIds.size, importedRowCount }
}

export async function bootstrapFromSupabase(
  client: SupabaseClient,
  userId: string,
  signal?: AbortSignal,
): Promise<{ workspaceCount: number; importedRowCount: number }> {
  return bootstrapLocalData(userId, createSupabaseSnapshotSource(client, signal), db, signal)
}
