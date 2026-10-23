import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './database'
import {
  accountsRepository,
  budgetsRepository,
  categoriesRepository,
  countPendingOperations,
  transactionsRepository,
} from './repositories'

export function useAccounts(workspaceId: string | undefined) {
  return useLiveQuery(
    () => (workspaceId ? accountsRepository.list(workspaceId) : Promise.resolve([])),
    [workspaceId],
    [],
  )
}

export function useCategories(workspaceId: string | undefined) {
  return useLiveQuery(
    () => (workspaceId ? categoriesRepository.list(workspaceId) : Promise.resolve([])),
    [workspaceId],
    [],
  )
}

export function useTransactions(workspaceId: string | undefined) {
  return useLiveQuery(
    () => (workspaceId ? transactionsRepository.list(workspaceId) : Promise.resolve([])),
    [workspaceId],
    [],
  )
}

export function useBudgets(workspaceId: string | undefined) {
  return useLiveQuery(
    () => (workspaceId ? budgetsRepository.list(workspaceId) : Promise.resolve([])),
    [workspaceId],
    [],
  )
}

export function usePendingOperationCount() {
  return useLiveQuery(() => countPendingOperations(), [], 0)
}

export function useSyncSummary() {
  return useLiveQuery(
    async () => {
      const operations = await db.outbox.toArray()
      const failedOperations = operations.filter((operation) => operation.status === 'failed')
      const lastSync = await db.syncMetadata.get('last-successful-sync')

      return {
        pendingCount: operations.filter((operation) => operation.status !== 'failed').length,
        failedCount: failedOperations.length,
        lastError: failedOperations[0]?.last_error ?? null,
        lastSuccessfulSync: lastSync?.value ?? null,
      }
    },
    [],
    { pendingCount: 0, failedCount: 0, lastError: null, lastSuccessfulSync: null },
  )
}

export function useWorkspaces() {
  return useLiveQuery(() => db.workspaces.toArray(), [], [])
}
