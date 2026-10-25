import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './database'
import type { Invitation, Membership, Profile, RecurringExpense } from './models'
import {
  budgetsRepository,
  categoriesRepository,
  countPendingOperations,
  monthCarryDecisionsRepository,
  monthlyBudgetsRepository,
  transactionsRepository,
} from './repositories'

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

export function useMonthlyBudgets(workspaceId: string | undefined) {
  return useLiveQuery(
    () => (workspaceId ? monthlyBudgetsRepository.list(workspaceId) : Promise.resolve([])),
    [workspaceId],
    [],
  )
}

export function useMonthCarryDecisions(workspaceId: string | undefined) {
  return useLiveQuery(
    () => (workspaceId ? monthCarryDecisionsRepository.list(workspaceId) : Promise.resolve([])),
    [workspaceId],
    [],
  )
}

export function useRecurringExpenses(workspaceId: string | undefined) {
  return useLiveQuery(
    () =>
      workspaceId
        ? db.recurringExpenses.where('workspace_id').equals(workspaceId).toArray()
        : Promise.resolve([] as RecurringExpense[]),
    [workspaceId],
    [] as RecurringExpense[],
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

export function useMemberships(workspaceId: string | undefined) {
  return useLiveQuery(
    () =>
      workspaceId
        ? db.memberships.where('workspace_id').equals(workspaceId).toArray()
        : Promise.resolve([] as Membership[]),
    [workspaceId],
    [] as Membership[],
  )
}

export function useProfiles() {
  return useLiveQuery(() => db.profiles.toArray(), [], [] as Profile[])
}

export function useInvitations(workspaceId: string | undefined) {
  return useLiveQuery(
    () =>
      workspaceId
        ? db.invitations.where('workspace_id').equals(workspaceId).toArray()
        : Promise.resolve([] as Invitation[]),
    [workspaceId],
    [] as Invitation[],
  )
}
