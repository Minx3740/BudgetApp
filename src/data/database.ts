import Dexie, { type Table } from 'dexie'
import type {
  Budget,
  Category,
  EditableRows,
  EditableTable,
  Invitation,
  Membership,
  MonthCarryDecision,
  MonthlyBudget,
  Profile,
  RecurringExpense,
  SyncTable,
  Transaction,
  Workspace,
} from './models'

export type OutboxOperation = {
  [K in EditableTable]: {
    op_id: string
    table: K
    action: 'upsert' | 'delete'
    payload: EditableRows[K]
    created_at: string
    attempts: number
    status: 'pending' | 'processing' | 'failed'
    last_error?: string
  }
}[EditableTable]

export interface SyncCursor {
  id: string
  workspace_id: string
  table: SyncTable
  cursor: string
}

export interface SyncMetadata {
  key: string
  value: string
}

export class BudgetDatabase extends Dexie {
  profiles!: Table<Profile, string>
  workspaces!: Table<Workspace, string>
  memberships!: Table<Membership, [string, string]>
  invitations!: Table<Invitation, string>
  categories!: Table<Category, string>
  transactions!: Table<Transaction, string>
  budgets!: Table<Budget, string>
  monthlyBudgets!: Table<MonthlyBudget, string>
  monthCarryDecisions!: Table<MonthCarryDecision, string>
  recurringExpenses!: Table<RecurringExpense, string>
  outbox!: Table<OutboxOperation, string>
  syncCursors!: Table<SyncCursor, string>
  syncMetadata!: Table<SyncMetadata, string>

  constructor(name = 'budget-app') {
    super(name)
    this.version(1).stores({
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
    this.version(2).stores({
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
    this.version(3)
      .stores({
        profiles: 'id, updated_at',
        workspaces: 'id, owner_id, type, updated_at',
        memberships: '[workspace_id+user_id], workspace_id, user_id',
        invitations: 'id, workspace_id, expires_at, updated_at',
        accounts: 'id, workspace_id, updated_at, deleted_at',
        categories: 'id, workspace_id, kind, updated_at, deleted_at',
        transactions:
          'id, workspace_id, occurred_on, category_id, paid_by, created_by, updated_at, deleted_at',
        budgets: 'id, workspace_id, category_id, month, &[workspace_id+category_id+month]',
        monthlyBudgets: 'id, workspace_id, month, updated_at, deleted_at, &[workspace_id+month]',
        monthCarryDecisions:
          'id, workspace_id, month, updated_at, deleted_at, &[workspace_id+month]',
        outbox: 'op_id, status, created_at, [status+created_at]',
        syncCursors: 'id, workspace_id, table',
        syncMetadata: 'key',
      })
      .upgrade(async (transaction) => {
        const tableNames = [
          'profiles',
          'workspaces',
          'memberships',
          'invitations',
          'accounts',
          'categories',
          'transactions',
          'budgets',
          'monthlyBudgets',
          'monthCarryDecisions',
          'outbox',
          'syncCursors',
          'syncMetadata',
        ]
        await Promise.all(tableNames.map((tableName) => transaction.table(tableName).clear()))
      })
    this.version(4)
      .stores({
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
        monthCarryDecisions:
          'id, workspace_id, month, updated_at, deleted_at, &[workspace_id+month]',
        outbox: 'op_id, status, created_at, [status+created_at]',
        syncCursors: 'id, workspace_id, table',
        syncMetadata: 'key',
      })
      .upgrade(async (transaction) => {
        const tableNames = [
          'profiles',
          'workspaces',
          'memberships',
          'invitations',
          'categories',
          'transactions',
          'budgets',
          'monthlyBudgets',
          'monthCarryDecisions',
          'outbox',
          'syncCursors',
          'syncMetadata',
        ]
        await Promise.all(tableNames.map((tableName) => transaction.table(tableName).clear()))
      })
    this.version(5)
      .stores({
        profiles: 'id, updated_at',
        workspaces: 'id, owner_id, type, updated_at',
        memberships: '[workspace_id+user_id], workspace_id, user_id',
        invitations: 'id, workspace_id, expires_at, updated_at',
        accounts: null,
        categories: 'id, workspace_id, kind, updated_at, deleted_at',
        transactions:
          'id, workspace_id, occurred_on, category_id, paid_by, created_by, recurring_id, recurring_month, updated_at, deleted_at',
        budgets: 'id, workspace_id, category_id, month, &[workspace_id+category_id+month]',
        monthlyBudgets: 'id, workspace_id, month, updated_at, deleted_at, &[workspace_id+month]',
        monthCarryDecisions:
          'id, workspace_id, month, updated_at, deleted_at, &[workspace_id+month]',
        recurringExpenses: 'id, workspace_id, series_id, start_month, end_month, updated_at',
        outbox: 'op_id, status, created_at, [status+created_at]',
        syncCursors: 'id, workspace_id, table',
        syncMetadata: 'key',
      })
      .upgrade(async (transaction) => {
        await transaction
          .table('transactions')
          .toCollection()
          .modify((row: { recurring_id?: string | null; recurring_month?: string | null }) => {
            row.recurring_id ??= null
            row.recurring_month ??= null
          })
        await transaction
          .table('outbox')
          .toCollection()
          .modify(
            (operation: {
              table?: string
              payload?: { recurring_id?: string | null; recurring_month?: string | null }
            }) => {
              if (operation.table !== 'transactions' || !operation.payload) return
              operation.payload.recurring_id ??= null
              operation.payload.recurring_month ??= null
            },
          )
      })
  }
}

export const db = new BudgetDatabase()

export async function clearLocalData(database: BudgetDatabase = db): Promise<void> {
  await database.transaction('rw', database.tables, async () => {
    await Promise.all(database.tables.map((table) => table.clear()))
  })
}
