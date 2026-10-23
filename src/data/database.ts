import Dexie, { type Table } from 'dexie'
import type {
  Account,
  Budget,
  Category,
  EditableRows,
  EditableTable,
  Invitation,
  Membership,
  Profile,
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
  table: EditableTable
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
  accounts!: Table<Account, string>
  categories!: Table<Category, string>
  transactions!: Table<Transaction, string>
  budgets!: Table<Budget, string>
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
  }
}

export const db = new BudgetDatabase()

export async function clearLocalData(database: BudgetDatabase = db): Promise<void> {
  await database.transaction('rw', database.tables, async () => {
    await Promise.all(database.tables.map((table) => table.clear()))
  })
}
