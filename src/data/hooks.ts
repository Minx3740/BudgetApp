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

export function useWorkspaces() {
  return useLiveQuery(() => db.workspaces.toArray(), [], [])
}
