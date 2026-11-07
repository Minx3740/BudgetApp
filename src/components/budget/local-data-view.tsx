import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  Archive,
  CirclePlus,
  Download,
  Filter,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { categoriesRepository, transactionsRepository } from '@/data/repositories'
import type { Category, Membership, Transaction } from '@/data/models'
import type { Profile } from '@/data/models'
import { db } from '@/data/database'
import {
  CATEGORY_COLOR_TOKENS,
  firstUnusedCategoryColor,
  isCategoryPaletteColor,
} from '@/data/category-colors'
import { useCategories, useTransactionsInRange } from '@/data/hooks'
import {
  calculateHistoryThresholdUsage,
  calculateTransactionHistorySummary,
  createEmptyTransactionHistoryFilters,
  countAdvancedTransactionHistoryFilters,
  filterAndSortTransactions,
  TRANSACTION_HISTORY_PAGE_SIZE,
  type TransactionHistoryFilters,
} from '@/data/transaction-history'
import { canEditTransaction } from '@/data/transaction-permissions'
import {
  getHistoryPeriodBounds,
  createDefaultTransactionHistoryUrlState,
  parseTransactionHistoryUrlState,
  serializeTransactionHistoryUrlState,
  type HistoryPeriodSelection,
  type TransactionHistoryUrlState,
} from '@/data/transaction-history-url'
import { isLocalDate } from '@/data/periods'
import { groupTransactions, paginateTransactionGroups } from '@/data/transaction-grouping'
import {
  buildTransactionCsv,
  downloadCsvFile,
  transactionCsvFilename,
} from '@/data/transaction-export'

type DataTab = 'transactions' | 'categories'
type TransactionKind = Transaction['kind']

interface LocalDataViewProps {
  workspaceId: string | undefined
  month: string
  userId: string
  canEdit: boolean
  isSharedWorkspace: boolean
  memberships: Membership[]
  profiles: Profile[]
  isQuickEntryOpen: boolean
  onQuickEntryOpenChange: (isOpen: boolean) => void
}

interface CategoryDraft {
  id: string | null
  name: string
  kind: Category['kind']
  icon: string
  color: string
}

interface TransactionDraft {
  kind: TransactionKind
  amount: string
  categoryId: string
  occurredOn: string
  note: string
  responsibleId: string
}

type LocalTransactionHistoryState = TransactionHistoryUrlState & {
  workspaceId: string | undefined
}

const dataTabs: { id: DataTab; label: string }[] = [
  { id: 'transactions', label: 'Transactions' },
  { id: 'categories', label: 'Catégories' },
]

function localDate(): string {
  const today = new Date()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')
  return `${today.getFullYear()}-${month}-${day}`
}

function formatMoney(amount: number): string {
  return `${new Intl.NumberFormat('fr-FR', {
    maximumFractionDigits: 0,
  }).format(amount)} Ar`
}

function formatMonthLabel(month: string): string {
  const value = new Date(`${month.slice(0, 7)}-01T00:00:00`).toLocaleDateString('fr-FR', {
    month: 'long',
    year: 'numeric',
  })
  return `${value.charAt(0).toLocaleUpperCase('fr-FR')}${value.slice(1)}`
}

function formatHistoryPeriodLabel(
  period: HistoryPeriodSelection,
  bounds: { start: string; end: string },
): string {
  const formatDate = (value: string, options: Intl.DateTimeFormatOptions) =>
    new Date(`${value}T00:00:00`).toLocaleDateString('fr-FR', options)

  switch (period.type) {
    case 'day': {
      const value = formatDate(period.date, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
      return `${value.charAt(0).toLocaleUpperCase('fr-FR')}${value.slice(1)}`
    }
    case 'week':
      return `Semaine du ${formatDate(bounds.start, { day: 'numeric', month: 'short' })} au ${formatDate(bounds.end, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })}`
    case 'month':
      return formatMonthLabel(bounds.start.slice(0, 7))
    case 'custom':
      return `Du ${formatDate(bounds.start, { day: 'numeric', month: 'short' })} au ${formatDate(bounds.end, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })}`
  }
}

function errorMessage(failure: unknown): string {
  return failure instanceof Error ? failure.message : 'Erreur inconnue.'
}

function newTransactionDraft(month: string, userId: string): TransactionDraft {
  const today = localDate()
  const selectedMonth = month.slice(0, 7)
  return {
    kind: 'expense',
    amount: '',
    categoryId: '',
    occurredOn: today.startsWith(`${selectedMonth}-`) ? today : `${selectedMonth}-01`,
    note: '',
    responsibleId: userId,
  }
}

function transactionLabel(kind: TransactionKind): string {
  switch (kind) {
    case 'expense':
      return 'Dépense'
    case 'refund':
      return 'Remboursement'
    case 'income':
      return 'Revenu'
    case 'adjustment':
      return 'Ajustement'
  }
}

export function LocalDataView({
  workspaceId,
  month,
  userId,
  canEdit,
  isSharedWorkspace,
  memberships,
  profiles,
  isQuickEntryOpen,
  onQuickEntryOpenChange,
}: LocalDataViewProps) {
  const [activeTab, setActiveTab] = useState<DataTab>('transactions')
  const [error, setError] = useState<string | null>(null)
  const [transactionError, setTransactionError] = useState<string | null>(null)
  const [categoryFormError, setCategoryFormError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [pendingDeletionId, setPendingDeletionId] = useState<string | null>(null)
  const [categoryDraft, setCategoryDraft] = useState<CategoryDraft | null>(null)
  const [categoryArchiveTarget, setCategoryArchiveTarget] = useState<Category | null>(null)
  const [editingTransactionId, setEditingTransactionId] = useState<string | null>(null)
  const [transactionDraft, setTransactionDraft] = useState<TransactionDraft>(() =>
    newTransactionDraft(month, userId),
  )
  const [historyState, setHistoryState] = useState<LocalTransactionHistoryState>(() => ({
    workspaceId,
    ...parseTransactionHistoryUrlState(
      typeof window === 'undefined' ? '' : window.location.search,
      month,
    ),
  }))
  const dialogRef = useRef<HTMLDialogElement>(null)
  const categoryDialogRef = useRef<HTMLDialogElement>(null)
  const filterDialogRef = useRef<HTMLDialogElement>(null)
  const [draftFilters, setDraftFilters] = useState(createEmptyTransactionHistoryFilters)
  const categories = useCategories(workspaceId)
  const budgets = useLiveQuery(async () => {
    if (!workspaceId) return []
    return await db.budgets.where('workspace_id').equals(workspaceId).toArray()
  }, [workspaceId])
  const historyStateForWorkspace = useMemo(() => {
    const state =
      historyState.workspaceId === workspaceId
        ? historyState
        : { workspaceId, ...createDefaultTransactionHistoryUrlState(month) }
    if (isSharedWorkspace || !state.filters.memberId) return state
    return { ...state, filters: { ...state.filters, memberId: '' } }
  }, [historyState, isSharedWorkspace, month, workspaceId])
  const historyPeriodBounds = useMemo(
    () => getHistoryPeriodBounds(historyStateForWorkspace.period, month),
    [historyStateForWorkspace.period, month],
  )
  const transactions = useTransactionsInRange(
    workspaceId,
    historyPeriodBounds.start,
    historyPeriodBounds.end,
  )
  const currentRole = memberships.find(
    (membership) => membership.workspace_id === workspaceId && membership.user_id === userId,
  )?.role

  function canEditTransactionRecord(transaction: Transaction): boolean {
    return canEdit && canEditTransaction(userId, currentRole, transaction)
  }

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    if (!canEdit && dialog.open) {
      dialog.close()
    } else if (canEdit && isQuickEntryOpen && !dialog.open) {
      dialog.showModal()
    } else if ((!canEdit || !isQuickEntryOpen) && dialog.open) {
      dialog.close()
    }
  }, [canEdit, isQuickEntryOpen, onQuickEntryOpenChange])

  useEffect(() => {
    const dialog = categoryDialogRef.current
    if (!dialog) return
    if (canEdit && (categoryDraft || categoryArchiveTarget) && !dialog.open) dialog.showModal()
    if ((!canEdit || (!categoryDraft && !categoryArchiveTarget)) && dialog.open) dialog.close()
  }, [canEdit, categoryArchiveTarget, categoryDraft])

  useEffect(() => {
    const url = new URL(window.location.href)
    url.search = serializeTransactionHistoryUrlState(url.search, historyStateForWorkspace)
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
  }, [historyStateForWorkspace])

  useEffect(() => {
    function restoreHistoryStateFromUrl() {
      setHistoryState({
        workspaceId,
        ...parseTransactionHistoryUrlState(window.location.search, month),
      })
    }

    window.addEventListener('popstate', restoreHistoryStateFromUrl)
    return () => window.removeEventListener('popstate', restoreHistoryStateFromUrl)
  }, [month, workspaceId])

  const allTransactions = useLiveQuery(async () => {
    if (!workspaceId) return null
    return await db.transactions.where('workspace_id').equals(workspaceId).toArray()
  }, [workspaceId])
  const categoryIdsWithTransactions = new Set(
    (allTransactions ?? []).flatMap((transaction) =>
      transaction.category_id ? [transaction.category_id] : [],
    ),
  )

  const expenseCategories = categories.filter(
    (category) => category.kind === 'expense' && category.archived_at === null,
  )
  const incomeCategories = categories.filter(
    (category) => category.kind === 'income' && category.archived_at === null,
  )
  const currentCategory = categories.find((category) => category.id === transactionDraft.categoryId)
  const availableCategories =
    transactionDraft.kind === 'income' ? incomeCategories : expenseCategories
  if (
    editingTransactionId &&
    currentCategory?.archived_at &&
    currentCategory.kind === (transactionDraft.kind === 'income' ? 'income' : 'expense') &&
    !availableCategories.some((category) => category.id === currentCategory.id)
  ) {
    availableCategories.push(currentCategory)
  }
  const selectedCategoryId =
    transactionDraft.kind === 'adjustment'
      ? ''
      : (availableCategories.find((category) => category.id === transactionDraft.categoryId)?.id ??
        '')
  const workspaceMemberIds = new Set(
    memberships
      .filter((membership) => membership.workspace_id === workspaceId)
      .map((membership) => membership.user_id),
  )
  workspaceMemberIds.add(userId)
  const responsibleMembers = profiles
    .filter((profile) => workspaceMemberIds.has(profile.id) && profile.deleted_at === null)
    .map((profile) => ({
      id: profile.id,
      name:
        profile.id === userId
          ? `Moi${profile.display_name ? ` — ${profile.display_name}` : ''}`
          : profile.display_name || 'Membre',
    }))
    .sort((left, right) => left.name.localeCompare(right.name, 'fr'))
  if (!responsibleMembers.some((member) => member.id === userId)) {
    responsibleMembers.unshift({ id: userId, name: 'Moi' })
  }
  const historyFilters = historyStateForWorkspace.filters
  const groupBy = historyStateForWorkspace.groupBy
  const historyNames = useMemo(
    () => ({
      categories: new Map(categories.map((category) => [category.id, category.name])),
      members: new Map(profiles.map((profile) => [profile.id, profile.display_name])),
    }),
    [categories, profiles],
  )
  const filteredTransactions = useMemo(
    () =>
      filterAndSortTransactions(
        transactions,
        historyFilters,
        historyNames.categories,
        historyNames.members,
      ),
    [historyFilters, historyNames, transactions],
  )
  const transactionSummary = useMemo(
    () => calculateTransactionHistorySummary(filteredTransactions),
    [filteredTransactions],
  )
  const transactionGroups = useMemo(
    () => groupTransactions(filteredTransactions, groupBy, { period: historyPeriodBounds }),
    [filteredTransactions, groupBy, historyPeriodBounds],
  )
  const transactionPage = useMemo(
    () =>
      paginateTransactionGroups(
        transactionGroups,
        historyStateForWorkspace.page,
        TRANSACTION_HISTORY_PAGE_SIZE,
      ),
    [historyStateForWorkspace.page, transactionGroups],
  )
  const transactionMembers = useMemo(() => {
    const memberIds = [...new Set(transactions.map((transaction) => transaction.created_by))]
    return memberIds
      .map((id) => ({
        id,
        name: historyNames.members.get(id) ?? id,
      }))
      .sort((left, right) => left.name.localeCompare(right.name, 'fr'))
  }, [historyNames.members, transactions])

  function updateHistoryState(updates: Partial<TransactionHistoryUrlState>) {
    setHistoryState((current) => {
      const currentForWorkspace =
        current.workspaceId === workspaceId
          ? current
          : { workspaceId, ...createDefaultTransactionHistoryUrlState(month) }
      return { ...currentForWorkspace, ...updates, workspaceId }
    })
  }

  function openHistoryFilterDialog() {
    setDraftFilters(historyFilters)
    filterDialogRef.current?.showModal()
  }

  function applyHistoryFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    updateHistoryState({
      filters: { ...draftFilters, memberId: isSharedWorkspace ? draftFilters.memberId : '' },
      page: 1,
    })
    filterDialogRef.current?.close()
  }

  function removeHistoryFilter(key: keyof TransactionHistoryFilters) {
    updateHistoryState({
      filters: {
        ...historyFilters,
        [key]: key === 'transactionType' ? 'all' : '',
      },
      page: 1,
    })
  }

  function changeHistoryPeriodType(type: HistoryPeriodSelection['type']) {
    const currentPeriod = historyStateForWorkspace.period
    const date =
      currentPeriod.type === 'day' || currentPeriod.type === 'week'
        ? currentPeriod.date
        : currentPeriod.type === 'custom'
          ? currentPeriod.start
          : historyPeriodBounds.start
    const period: HistoryPeriodSelection =
      type === 'month'
        ? { type }
        : type === 'custom'
          ? { type, start: historyPeriodBounds.start, end: historyPeriodBounds.end }
          : { type, date }
    updateHistoryState({ period, page: 1 })
  }

  function changeHistoryAnchorDate(date: string) {
    if (!isLocalDate(date)) return
    const period = historyStateForWorkspace.period
    if (period.type === 'day' || period.type === 'week') {
      updateHistoryState({ period: { ...period, date }, page: 1 })
    }
  }

  function changeCustomPeriodDate(part: 'start' | 'end', date: string) {
    if (!isLocalDate(date) || historyStateForWorkspace.period.type !== 'custom') return
    const current = historyStateForWorkspace.period
    updateHistoryState({
      period:
        part === 'start'
          ? { ...current, start: date, end: current.end < date ? date : current.end }
          : { ...current, start: current.start > date ? date : current.start, end: date },
      page: 1,
    })
  }

  function resetDraftFilters() {
    setDraftFilters(createEmptyTransactionHistoryFilters())
  }

  const activeFilterCount =
    countAdvancedTransactionHistoryFilters(historyFilters, isSharedWorkspace) +
    Number(historyFilters.transactionType !== 'all') +
    Number(historyFilters.search.trim() !== '')
  const thresholdUsage = useMemo(() => {
    const periodType = historyStateForWorkspace.period.type
    if (activeFilterCount > 0 || (periodType !== 'day' && periodType !== 'week')) {
      return null
    }
    if (!Array.isArray(budgets)) return null
    return calculateHistoryThresholdUsage(
      transactions,
      budgets,
      historyPeriodBounds.start,
      historyPeriodBounds.end,
      periodType,
    )
  }, [activeFilterCount, budgets, historyPeriodBounds, historyStateForWorkspace.period.type, transactions])
  const firstVisibleTransaction =
    filteredTransactions.length === 0
      ? 0
      : (transactionPage.page - 1) * TRANSACTION_HISTORY_PAGE_SIZE + 1
  const lastVisibleTransaction = Math.min(
    transactionPage.page * TRANSACTION_HISTORY_PAGE_SIZE,
    filteredTransactions.length,
  )

  function openNewTransaction() {
    if (!canEdit) return
    setError(null)
    setTransactionError(null)
    setNotice(null)
    setEditingTransactionId(null)
    setTransactionDraft(newTransactionDraft(month, userId))
    onQuickEntryOpenChange(true)
  }

  function openCategoryEditor(draft: CategoryDraft) {
    setCategoryFormError(null)
    setError(null)
    setNotice(null)
    setCategoryDraft(draft)
  }

  function closeTransactionDialog() {
    setTransactionError(null)
    onQuickEntryOpenChange(false)
  }

  async function saveCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canEdit || !workspaceId || !categoryDraft) return
    setCategoryFormError(null)
    setNotice(null)

    try {
      if (categoryDraft.id) {
        const existingCategory = categories.find((category) => category.id === categoryDraft.id)
        if (existingCategory && existingCategory.kind !== categoryDraft.kind) {
          const [transaction, budget] = await Promise.all([
            db.transactions.where('category_id').equals(categoryDraft.id).first(),
            db.budgets.where('category_id').equals(categoryDraft.id).first(),
          ])
          if (transaction || budget) {
            setCategoryFormError(
              'Le type ne peut pas être changé car cette catégorie est utilisée. Archive-la et crée une nouvelle catégorie.',
            )
            return
          }
        }
        await categoriesRepository.update(categoryDraft.id, workspaceId, {
          name: categoryDraft.name,
          kind: categoryDraft.kind,
          icon: categoryDraft.icon || null,
          color: categoryDraft.color || null,
        })
      } else {
        await categoriesRepository.create({
          workspace_id: workspaceId,
          name: categoryDraft.name,
          kind: categoryDraft.kind,
          icon: categoryDraft.icon || null,
          color: categoryDraft.color || null,
          archived_at: null,
        })
      }
      categoryDialogRef.current?.close()
      setNotice('Catégorie enregistrée.')
    } catch (failure) {
      setCategoryFormError(`Impossible d’enregistrer cette catégorie. ${errorMessage(failure)}`)
    }
  }

  async function toggleCategoryArchive(categoryId: string, archivedAt: string | null) {
    if (!canEdit || !workspaceId) return
    setError(null)
    setNotice(null)
    try {
      await categoriesRepository.update(categoryId, workspaceId, {
        archived_at: archivedAt === null ? new Date().toISOString() : null,
      })
      setNotice(archivedAt === null ? 'Catégorie archivée.' : 'Catégorie restaurée.')
    } catch (failure) {
      setError(`Impossible de modifier cette catégorie. ${errorMessage(failure)}`)
    }
  }

  async function confirmCategoryArchive() {
    if (!canEdit || !workspaceId || !categoryArchiveTarget) return
    setCategoryFormError(null)
    try {
      await categoriesRepository.update(categoryArchiveTarget.id, workspaceId, {
        archived_at: new Date().toISOString(),
      })
      categoryDialogRef.current?.close()
      setNotice('Catégorie archivée. Son historique est conservé.')
    } catch (failure) {
      setCategoryFormError(`Impossible d’archiver cette catégorie. ${errorMessage(failure)}`)
    }
  }

  async function deleteUnusedCategory(category: Category) {
    if (!canEdit || !workspaceId) return
    if (!window.confirm(`Supprimer définitivement la catégorie « ${category.name} » ?`)) return

    setError(null)
    setNotice(null)
    try {
      await db.transaction('rw', [db.categories, db.transactions, db.outbox], async () => {
        const transactionCount = await db.transactions
          .where('category_id')
          .equals(category.id)
          .count()
        if (transactionCount > 0) {
          throw new Error('Cette catégorie est utilisée par une transaction.')
        }
        await categoriesRepository.softDelete(category.id, workspaceId)
      })
      setNotice('Catégorie supprimée.')
    } catch (failure) {
      setError(`Impossible de supprimer cette catégorie. ${errorMessage(failure)}`)
    }
  }

  function renderCategory(category: Category) {
    return (
      <article
        className="flex items-center justify-between gap-3 rounded-xl bg-stone-50 p-3"
        key={category.id}
      >
        <div className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden="true"
            className="size-4 shrink-0 rounded-full ring-1 ring-black/10"
            style={{ backgroundColor: category.color ?? 'var(--category-uncategorized)' }}
          />
          <div className="min-w-0">
            <p className="truncate font-medium">
              {category.name}
              {category.archived_at && (
                <span className="ml-2 text-xs font-normal text-stone-500">Archivée</span>
              )}
            </p>
            <p className="text-sm text-stone-500">
              {category.kind === 'expense' ? 'Dépense' : 'Revenu'} · {category.icon ?? '—'}
            </p>
          </div>
        </div>
        {canEdit && (
          <div className="flex shrink-0">
            <Button
              aria-label={`Modifier ${category.name}`}
              className="min-h-12 min-w-12"
              onClick={() =>
                openCategoryEditor({
                  id: category.id,
                  name: category.name,
                  kind: category.kind,
                  icon: category.icon ?? '',
                  color:
                    category.color ??
                    firstUnusedCategoryColor(
                      categories
                        .filter((existing) => existing.id !== category.id)
                        .map((existing) => existing.color),
                    ),
                })
              }
              size="icon"
              type="button"
              variant="ghost"
            >
              <Pencil aria-hidden="true" size={17} />
            </Button>
            <Button
              aria-label={`${category.archived_at ? 'Restaurer' : 'Archiver'} ${category.name}`}
              className="min-h-12 min-w-12"
              onClick={() => {
                if (category.archived_at) {
                  void toggleCategoryArchive(category.id, category.archived_at)
                  return
                }
                setCategoryFormError(null)
                setCategoryArchiveTarget(category)
              }}
              size="icon"
              type="button"
              variant="ghost"
            >
              {category.archived_at ? (
                <RotateCcw aria-hidden="true" size={17} />
              ) : (
                <Archive aria-hidden="true" size={17} />
              )}
            </Button>
            {allTransactions && !categoryIdsWithTransactions.has(category.id) && (
              <Button
                aria-label={`Supprimer ${category.name}`}
                className="min-h-12 min-w-12 text-red-700"
                onClick={() => void deleteUnusedCategory(category)}
                size="icon"
                type="button"
                variant="ghost"
              >
                <Trash2 aria-hidden="true" size={17} />
              </Button>
            )}
          </div>
        )}
      </article>
    )
  }

  function editTransaction(transaction: Transaction) {
    if (!canEditTransactionRecord(transaction)) return
    setError(null)
    setTransactionError(null)
    setNotice(null)
    setEditingTransactionId(transaction.id)
    setTransactionDraft({
      kind: transaction.kind,
      amount: String(transaction.amount),
      categoryId: transaction.category_id ?? '',
      occurredOn: transaction.occurred_on,
      note: transaction.note ?? '',
      responsibleId: transaction.paid_by,
    })
    onQuickEntryOpenChange(true)
  }

  async function saveTransaction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setTransactionError(null)
    if (!canEdit) {
      setTransactionError('Tu as un accès en lecture seule à cet espace.')
      return
    }
    if (!workspaceId) {
      setTransactionError('Aucun espace local n’est disponible. Recharge les données en ligne.')
      return
    }
    if (transactionDraft.kind === 'income' && !selectedCategoryId) {
      setTransactionError('Choisis une catégorie de revenus avant de continuer.')
      return
    }
    if (!responsibleMembers.some((member) => member.id === transactionDraft.responsibleId)) {
      setTransactionError('Choisis un membre de cet espace comme responsable.')
      return
    }

    setError(null)
    setNotice(null)
    const input = {
      workspace_id: workspaceId,
      category_id: transactionDraft.kind === 'adjustment' ? null : selectedCategoryId || null,
      kind: transactionDraft.kind,
      amount: Number(transactionDraft.amount),
      occurred_on: transactionDraft.occurredOn,
      note: transactionDraft.note.trim() || null,
      created_by: userId,
      paid_by: transactionDraft.responsibleId,
    }

    try {
      if (editingTransactionId) {
        const transaction = transactions.find((row) => row.id === editingTransactionId)
        if (!transaction || !canEditTransactionRecord(transaction)) {
          setTransactionError('Tu ne peux modifier que tes propres transactions.')
          return
        }
        const changes = {
          category_id: input.category_id,
          kind: input.kind,
          amount: input.amount,
          occurred_on: input.occurred_on,
          note: input.note,
          paid_by: input.paid_by,
        }
        await transactionsRepository.update(editingTransactionId, workspaceId, changes, userId)
        setNotice('Transaction mise à jour.')
      } else {
        await transactionsRepository.create(input, userId)
        setNotice('Transaction enregistrée.')
      }
      setEditingTransactionId(null)
      setTransactionDraft(newTransactionDraft(month, userId))
      closeTransactionDialog()
    } catch (failure) {
      setTransactionError(`Impossible d’enregistrer cette transaction. ${errorMessage(failure)}`)
    }
  }

  async function deleteTransaction(transaction: Transaction) {
    if (!canEditTransactionRecord(transaction)) {
      setError('Tu ne peux supprimer que tes propres transactions.')
      return
    }
    if (!workspaceId || !window.confirm('Supprimer cette transaction ?')) return
    setError(null)
    setNotice(null)
    try {
      await transactionsRepository.softDelete(transaction.id, workspaceId, userId)
      setPendingDeletionId(transaction.id)
      setNotice('Transaction supprimée.')
    } catch (failure) {
      setError(`Impossible de supprimer cette transaction. ${errorMessage(failure)}`)
    }
  }

  async function restoreTransaction() {
    if (!workspaceId || !pendingDeletionId) return
    setError(null)
    setNotice(null)
    try {
      await transactionsRepository.restore(pendingDeletionId, workspaceId, userId)
      setPendingDeletionId(null)
      setNotice('Suppression annulée.')
    } catch (failure) {
      setError(`Impossible d’annuler la suppression. ${errorMessage(failure)}`)
    }
  }

  function exportTransactions() {
    if (filteredTransactions.length === 0) {
      setError('Aucune transaction à exporter pour cette période et ces filtres.')
      return
    }

    setError(null)
    try {
      const csv = buildTransactionCsv(filteredTransactions, {
        categoryNames: historyNames.categories,
        memberNames: historyNames.members,
      })
      downloadCsvFile(
        csv,
        transactionCsvFilename(historyPeriodBounds.start, historyPeriodBounds.end),
      )
      setNotice(
        `${filteredTransactions.length} transaction${filteredTransactions.length > 1 ? 's' : ''} exportée${filteredTransactions.length > 1 ? 's' : ''} au format CSV.`,
      )
    } catch (failure) {
      setError(`Impossible de créer le fichier CSV. ${errorMessage(failure)}`)
    }
  }

  return (
    <section aria-labelledby="section-title" className="page-shell">
      <p className="mb-2 text-sm font-medium text-emerald-800">Données de l’espace actif</p>
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl" id="section-title">
        Transactions et catégories
      </h1>
      <p className="mt-3 leading-7 text-stone-600">
        {canEdit
          ? 'Tes changements sont enregistrés, même sans connexion.'
          : 'Les données de cet espace sont disponibles.'}
      </p>
      {!canEdit && (
        <p className="mt-4 rounded-xl bg-stone-100 px-4 py-3 text-sm text-stone-700">
          Accès en lecture seule : tu peux consulter les données, mais pas les modifier.
        </p>
      )}

      {error && (
        <p className="mt-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <div
          className="mt-5 flex flex-col gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900 sm:flex-row sm:items-center sm:justify-between"
          role="status"
        >
          <span>{notice}</span>
          {pendingDeletionId && (
            <Button className="min-h-10" onClick={() => void restoreTransaction()} variant="outline">
              Annuler
            </Button>
          )}
        </div>
      )}

      <nav
        aria-label="Données du budget"
        className="mt-6 grid grid-cols-2 gap-2 rounded-2xl bg-stone-100 p-1"
      >
        {dataTabs.map((tab) => (
          <button
            aria-current={activeTab === tab.id ? 'page' : undefined}
            className={`min-h-12 rounded-xl px-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-emerald-800 ${
              activeTab === tab.id
                ? 'bg-white text-emerald-900 shadow-sm'
                : 'text-stone-600 hover:text-stone-950'
            }`}
            key={tab.id}
            onClick={() => {
              setActiveTab(tab.id)
              setError(null)
              setNotice(null)
            }}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {!workspaceId && (
        <Card className="mt-5 rounded-2xl border-0 shadow-sm ring-stone-200">
          <CardContent className="py-6 text-sm text-stone-600">
            Aucun espace local n’est disponible. Connecte-toi à Internet puis relance le chargement
            des données.
          </CardContent>
        </Card>
      )}

      {workspaceId && activeTab === 'transactions' && (
        <div className="mt-5 space-y-4">
          <Card className="rounded-2xl border-0 shadow-sm ring-stone-200">
            <CardHeader className="flex flex-row items-center justify-between gap-3">
              <div>
                <CardTitle>Historique</CardTitle>
                <CardDescription>Les dernières transactions de ton espace.</CardDescription>
              </div>
              {canEdit && (
                <Button
                  className="min-h-12 shrink-0 rounded-xl bg-emerald-800 px-4 text-white hover:bg-emerald-900"
                  onClick={openNewTransaction}
                >
                  <CirclePlus aria-hidden="true" size={18} />
                  Ajouter
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <label className="grid gap-1.5 text-sm font-medium">
                  Période
                  <select
                    className="min-h-11 rounded-xl border border-stone-300 bg-white px-3"
                    onChange={(event) => {
                      const type = event.target.value
                      if (
                        type === 'day' ||
                        type === 'week' ||
                        type === 'month' ||
                        type === 'custom'
                      ) {
                        changeHistoryPeriodType(type)
                      }
                    }}
                    value={historyStateForWorkspace.period.type}
                  >
                    <option value="day">Un jour</option>
                    <option value="week">Une semaine</option>
                    <option value="month">Un mois</option>
                    <option value="custom">Plage personnalisée</option>
                  </select>
                </label>
                {historyStateForWorkspace.period.type === 'month' ? (
                  <div className="grid content-end gap-1.5 text-sm">
                    <span className="font-medium">Mois sélectionné</span>
                    <span className="flex min-h-11 items-center rounded-xl bg-stone-50 px-3 capitalize">
                      {formatMonthLabel(month)}
                    </span>
                  </div>
                ) : historyStateForWorkspace.period.type === 'custom' ? (
                  <>
                    <label className="grid gap-1.5 text-sm font-medium">
                      Du
                      <input
                        className="min-h-11 rounded-xl border border-stone-300 px-3 font-normal"
                        onChange={(event) => changeCustomPeriodDate('start', event.target.value)}
                        type="date"
                        value={historyStateForWorkspace.period.start}
                      />
                    </label>
                    <label className="grid gap-1.5 text-sm font-medium">
                      Au
                      <input
                        className="min-h-11 rounded-xl border border-stone-300 px-3 font-normal"
                        onChange={(event) => changeCustomPeriodDate('end', event.target.value)}
                        type="date"
                        value={historyStateForWorkspace.period.end}
                      />
                    </label>
                  </>
                ) : (
                  <label className="grid gap-1.5 text-sm font-medium">
                    Date
                    <input
                      className="min-h-11 rounded-xl border border-stone-300 px-3 font-normal"
                      onChange={(event) => changeHistoryAnchorDate(event.target.value)}
                      type="date"
                      value={historyStateForWorkspace.period.date}
                    />
                  </label>
                )}
                <label className="grid gap-1.5 text-sm font-medium">
                  Regroupement
                  <select
                    className="min-h-11 rounded-xl border border-stone-300 bg-white px-3"
                    onChange={(event) => {
                      const group = event.target.value
                      if (
                        group === 'none' ||
                        group === 'day' ||
                        group === 'week' ||
                        group === 'month'
                      ) {
                        updateHistoryState({ groupBy: group, page: 1 })
                      }
                    }}
                    value={groupBy}
                  >
                    <option value="none">Aucun</option>
                    <option value="day">Jour</option>
                    <option value="week">Semaine</option>
                    <option value="month">Mois</option>
                  </select>
                </label>
                <div className="flex items-end">
                  <Button
                    aria-label={`Filtres${activeFilterCount ? `, ${activeFilterCount} actif${activeFilterCount > 1 ? 's' : ''}` : ''}`}
                    className="min-h-11 w-full justify-center gap-2"
                    onClick={openHistoryFilterDialog}
                    type="button"
                    variant="outline"
                  >
                    <Filter aria-hidden="true" size={17} />
                    Filtres
                    {activeFilterCount > 0 && (
                      <span
                        aria-hidden="true"
                        className="inline-flex size-5 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground"
                      >
                        {activeFilterCount}
                      </span>
                    )}
                  </Button>
                </div>
              </div>
              {historyStateForWorkspace.period.type === 'week' && (
                <p className="text-xs text-stone-500">
                  {historyPeriodBounds.start} – {historyPeriodBounds.end} (lundi à dimanche)
                </p>
              )}
              {(historyFilters.categoryId ||
                (isSharedWorkspace && historyFilters.memberId) ||
                historyFilters.transactionType !== 'all' ||
                historyFilters.search.trim()) && (
                <div aria-label="Filtres actifs" className="flex flex-wrap gap-2">
                  {historyFilters.transactionType !== 'all' && (
                    <button
                      aria-label="Retirer le filtre de type"
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-stone-100 px-3 text-sm text-stone-800"
                      onClick={() => removeHistoryFilter('transactionType')}
                      type="button"
                    >
                      {historyFilters.transactionType === 'expenses' ? 'Dépenses' : 'Revenus'}
                      <X aria-hidden="true" size={14} />
                    </button>
                  )}
                  {historyFilters.search.trim() && (
                    <button
                      aria-label="Retirer la recherche"
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-stone-100 px-3 text-sm text-stone-800"
                      onClick={() => removeHistoryFilter('search')}
                      type="button"
                    >
                      Recherche : {historyFilters.search}
                      <X aria-hidden="true" size={14} />
                    </button>
                  )}
                  {historyFilters.categoryId && (
                    <button
                      aria-label={`Retirer le filtre catégorie ${historyNames.categories.get(historyFilters.categoryId) ?? 'inconnue'}`}
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-stone-100 px-3 text-sm text-stone-800"
                      onClick={() => removeHistoryFilter('categoryId')}
                      type="button"
                    >
                      {historyNames.categories.get(historyFilters.categoryId) ?? 'Catégorie'}
                      <X aria-hidden="true" size={14} />
                    </button>
                  )}
                  {isSharedWorkspace && historyFilters.memberId && (
                    <button
                      aria-label={`Retirer le filtre saisi par ${historyNames.members.get(historyFilters.memberId) ?? 'membre'}`}
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-stone-100 px-3 text-sm text-stone-800"
                      onClick={() => removeHistoryFilter('memberId')}
                      type="button"
                    >
                      Saisi par {historyNames.members.get(historyFilters.memberId) ?? 'membre'}
                      <X aria-hidden="true" size={14} />
                    </button>
                  )}
                </div>
              )}

              <div className="sticky top-0 z-10 rounded-2xl border border-stone-200 bg-white/95 p-3 shadow-sm backdrop-blur-sm">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-500">
                      Période
                    </p>
                    <p className="truncate text-sm font-semibold text-stone-900">
                      {formatHistoryPeriodLabel(historyStateForWorkspace.period, historyPeriodBounds)}
                    </p>
                  </div>
                  {activeFilterCount > 0 && (
                    <span className="inline-flex w-fit items-center rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-medium text-amber-900">
                      Filtres actifs
                    </span>
                  )}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-stone-600 sm:grid-cols-4">
                  <div className="rounded-xl bg-stone-50 px-2.5 py-2">
                    <p className="text-[10px] uppercase tracking-[0.1em] text-stone-500">
                      Dépenses nettes
                    </p>
                    <p className="mt-1 font-semibold text-stone-900">
                      {formatMoney(transactionSummary.netExpenses)}
                    </p>
                  </div>
                  <div className="rounded-xl bg-stone-50 px-2.5 py-2">
                    <p className="text-[10px] uppercase tracking-[0.1em] text-stone-500">
                      Revenus
                    </p>
                    <p className="mt-1 font-semibold text-stone-900">
                      {formatMoney(transactionSummary.income)}
                    </p>
                  </div>
                  <div className="rounded-xl bg-stone-50 px-2.5 py-2">
                    <p className="text-[10px] uppercase tracking-[0.1em] text-stone-500">Net</p>
                    <p className="mt-1 font-semibold text-stone-900">{formatMoney(transactionSummary.net)}</p>
                  </div>
                  <div className="rounded-xl bg-stone-50 px-2.5 py-2">
                    <p className="text-[10px] uppercase tracking-[0.1em] text-stone-500">
                      Transactions
                    </p>
                    <p className="mt-1 font-semibold text-stone-900">
                      {transactionSummary.count}
                    </p>
                  </div>
                </div>
                {thresholdUsage && (
                  <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/70 p-2.5">
                    <div className="flex items-center justify-between gap-2 text-xs text-stone-700">
                      <span className="font-medium text-stone-800">
                        Comptées dans le seuil : {formatMoney(thresholdUsage.spentAmount)} sur{' '}
                        {formatMoney(thresholdUsage.limitAmount)} (hors forfaits)
                      </span>
                      <span
                        className={`rounded-full px-2 py-1 text-[10px] font-semibold ${
                          thresholdUsage.status === 'over'
                            ? 'bg-red-100 text-red-700'
                            : thresholdUsage.status === 'alert'
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-emerald-100 text-emerald-700'
                        }`}
                      >
                        {thresholdUsage.status === 'over'
                          ? 'Dépassé'
                          : thresholdUsage.status === 'alert'
                            ? 'Alerte'
                            : 'Sous le seuil'}
                      </span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-stone-200">
                      <div
                        className={`h-full rounded-full ${
                          thresholdUsage.status === 'over'
                            ? 'bg-red-500'
                            : thresholdUsage.status === 'alert'
                              ? 'bg-amber-500'
                              : 'bg-emerald-500'
                        }`}
                        style={{ width: `${Math.min(100, thresholdUsage.progressPercentage)}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-2 border-t border-stone-200 pt-3 sm:flex-row sm:items-center sm:justify-between">
                <span aria-live="polite" className="text-sm text-stone-600" role="status">
                  {filteredTransactions.length === 0
                    ? transactions.length === 0
                      ? 'Aucune transaction sur cette période'
                      : 'Aucune transaction ne correspond aux filtres'
                    : `Transactions ${firstVisibleTransaction} à ${lastVisibleTransaction} sur ${filteredTransactions.length}`}
                </span>
                <div className="flex flex-col gap-1 sm:items-end">
                  <Button
                    className="min-h-11 w-full sm:w-auto"
                    disabled={filteredTransactions.length === 0}
                    onClick={exportTransactions}
                    type="button"
                    variant="outline"
                  >
                    <Download aria-hidden="true" size={17} />
                    Exporter CSV ({filteredTransactions.length})
                  </Button>
                  <p className="text-xs text-stone-500">
                    Toute la période filtrée, pas seulement cette page. Disponible hors ligne.
                  </p>
                </div>
              </div>

              {transactions.length === 0 ? (
                <p className="py-5 text-center text-sm text-stone-500">
                  Aucune transaction sur cette période. Tu peux en ajouter une.
                </p>
              ) : filteredTransactions.length === 0 ? (
                <div className="space-y-2 py-5 text-center">
                  <p className="text-sm text-stone-600">
                    Aucune transaction ne correspond à ces critères.
                  </p>
                </div>
              ) : (
                <div className="space-y-5">
                  {transactionPage.groups.map((group) => (
                    <section className="space-y-3" key={group.key}>
                      {groupBy !== 'none' && (
                        <header className="rounded-xl bg-stone-100 px-3 py-3">
                          <h3 className="font-semibold capitalize">{group.label}</h3>
                          <p className="mt-1 text-sm text-stone-600">
                            {group.count} transaction{group.count > 1 ? 's' : ''} · Revenus{' '}
                            {formatMoney(group.totalIncome)} · Dépenses nettes{' '}
                            {formatMoney(group.totalExpenses)}
                            {group.totalAdjustments !== 0 &&
                              ` · Ajustements ${formatMoney(group.totalAdjustments)}`}{' '}
                            · Net {formatMoney(group.net)}
                          </p>
                        </header>
                      )}
                      {group.transactions.map((transaction) => {
                        const category = categories.find(
                          (item) => item.id === transaction.category_id,
                        )
                        const responsibleName =
                          historyNames.members.get(transaction.paid_by) || 'Membre'
                        const amountPrefix =
                          transaction.kind === 'income' || transaction.kind === 'refund'
                            ? '+'
                            : transaction.kind === 'expense'
                              ? '−'
                              : ''

                        const amountTone =
                          transaction.kind === 'income' || transaction.kind === 'refund'
                            ? 'text-[var(--color-income)]'
                            : 'text-[var(--color-neutral)]'
                        const sharedOwnerInitials =
                          isSharedWorkspace && responsibleName
                            ? responsibleName
                                .split(/\s+/)
                                .filter(Boolean)
                                .slice(0, 2)
                                .map((part) => part[0]?.toUpperCase() ?? '')
                                .join('')
                            : ''

                        return (
                          <article
                            className="flex items-center justify-between gap-3 rounded-xl bg-stone-50 p-3"
                            key={transaction.id}
                          >
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-medium">
                                <span
                                  aria-hidden="true"
                                  className="mr-2 inline-block size-2.5 rounded-full align-middle ring-1 ring-black/10"
                                  style={{
                                    backgroundColor:
                                      category?.color ?? 'var(--category-uncategorized)',
                                  }}
                                />
                                {category?.name ?? transactionLabel(transaction.kind)}
                              </p>
                              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-stone-500">
                                {groupBy !== 'day' && (
                                  <span className="tabular-nums">
                                    {new Date(`${transaction.occurred_on}T00:00:00`).toLocaleDateString(
                                      'fr-FR',
                                    )}
                                  </span>
                                )}
                                {transaction.note && <span className="truncate">· {transaction.note}</span>}
                                {isSharedWorkspace && (
                                  <span className="inline-flex items-center gap-1.5">
                                    <span
                                      aria-label={`Payé par ${responsibleName}`}
                                      className="flex size-5 items-center justify-center rounded-full bg-stone-200 text-[10px] font-semibold text-stone-700"
                                      title={`Payé par ${responsibleName}`}
                                    >
                                      {sharedOwnerInitials || 'M'}
                                    </span>
                                    <span className="sr-only">Payé par {responsibleName}</span>
                                    <span className="hidden sm:inline">{responsibleName}</span>
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              <span className={`tabular-nums text-right text-base font-semibold ${amountTone}`}>
                                {amountPrefix}
                                {formatMoney(transaction.amount)}
                              </span>
                              {canEditTransactionRecord(transaction) && (
                                <details className="relative">
                                  <summary
                                    aria-label={`Actions pour ${transactionLabel(transaction.kind).toLowerCase()}`}
                                    className="flex size-8 cursor-pointer list-none items-center justify-center rounded-full text-stone-600 transition hover:bg-stone-200 hover:text-stone-900"
                                  >
                                    <MoreHorizontal aria-hidden="true" size={16} />
                                  </summary>
                                  <div className="absolute right-0 top-full z-20 mt-2 min-w-36 rounded-xl border border-stone-200 bg-white p-1 shadow-lg">
                                    <button
                                      className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm hover:bg-stone-100"
                                      onClick={() => editTransaction(transaction)}
                                      type="button"
                                    >
                                      <Pencil aria-hidden="true" size={15} />
                                      Modifier
                                    </button>
                                    <button
                                      className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm text-red-700 hover:bg-red-50"
                                      onClick={() => void deleteTransaction(transaction)}
                                      type="button"
                                    >
                                      <Trash2 aria-hidden="true" size={15} />
                                      Supprimer
                                    </button>
                                  </div>
                                </details>
                              )}
                            </div>
                          </article>
                        )
                      })}
                    </section>
                  ))}
                </div>
              )}
              {transactionPage.pageCount > 1 && (
                <nav
                  aria-label="Pagination de l’historique"
                  className="flex items-center justify-between gap-3 border-t border-stone-200 pt-4"
                >
                  <Button
                    disabled={transactionPage.page === 1}
                    onClick={() =>
                      updateHistoryState({ page: Math.max(1, transactionPage.page - 1) })
                    }
                    type="button"
                    variant="outline"
                  >
                    Page précédente
                  </Button>
                  <span aria-live="polite" className="text-sm text-stone-600">
                    Page {transactionPage.page} sur {transactionPage.pageCount}
                  </span>
                  <Button
                    disabled={transactionPage.page === transactionPage.pageCount}
                    onClick={() =>
                      updateHistoryState({
                        page: Math.min(transactionPage.pageCount, transactionPage.page + 1),
                      })
                    }
                    type="button"
                    variant="outline"
                  >
                    Page suivante
                  </Button>
                </nav>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {workspaceId && activeTab === 'categories' && (
        <div className="mt-5 space-y-4">
          <Card className="rounded-2xl border-0 shadow-sm ring-stone-200">
            <CardHeader className="flex flex-row items-center justify-between gap-3">
              <div>
                <CardTitle>Catégories</CardTitle>
                <CardDescription>Organise tes dépenses et tes revenus.</CardDescription>
              </div>
              {canEdit && (
                <Button
                  className="min-h-12 shrink-0"
                  onClick={() =>
                    openCategoryEditor({
                      id: null,
                      name: '',
                      kind: 'expense',
                      icon: 'tag',
                      color: firstUnusedCategoryColor(categories.map((category) => category.color)),
                    })
                  }
                  variant="outline"
                >
                  <CirclePlus aria-hidden="true" size={18} />
                  Ajouter
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              {categories.filter((category) => category.archived_at === null).length === 0 && (
                <p className="py-4 text-center text-sm text-stone-500">
                  Aucune catégorie pour le moment.
                </p>
              )}
              {categories.filter((category) => category.archived_at === null).map(renderCategory)}
              {categories.some((category) => category.archived_at !== null) && (
                <details className="pt-2">
                  <summary className="min-h-11 cursor-pointer py-2 font-medium">
                    Archivées (
                    {categories.filter((category) => category.archived_at !== null).length})
                  </summary>
                  <div className="mt-3 space-y-3">
                    {categories
                      .filter((category) => category.archived_at !== null)
                      .map(renderCategory)}
                  </div>
                </details>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <dialog
        aria-labelledby="category-dialog-title"
        className="fixed inset-x-0 bottom-0 m-0 max-h-[92svh] w-full max-w-none overflow-y-auto rounded-t-3xl border-0 bg-white p-0 shadow-2xl backdrop:bg-stone-950/45 sm:inset-0 sm:m-auto sm:max-w-xl sm:rounded-3xl"
        onClose={() => {
          setCategoryDraft(null)
          setCategoryArchiveTarget(null)
          setCategoryFormError(null)
        }}
        ref={categoryDialogRef}
      >
        {canEdit && categoryArchiveTarget && (
          <div className="space-y-5 p-5 sm:p-7">
            <div>
              <p className="text-sm font-medium text-emerald-800">Catégories</p>
              <h2 className="mt-1 text-2xl font-bold" id="category-dialog-title">
                Archiver la catégorie
              </h2>
            </div>
            {categoryFormError && (
              <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
                {categoryFormError}
              </p>
            )}
            <p className="text-sm leading-6 text-stone-700">
              « {categoryArchiveTarget.name} » disparaîtra des nouveaux choix, mais restera
              disponible dans l’historique. Tu pourras la restaurer plus tard.
            </p>
            <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
              <Button
                className="min-h-12"
                onClick={() => categoryDialogRef.current?.close()}
                type="button"
                variant="outline"
              >
                Annuler
              </Button>
              <Button
                className="min-h-12"
                onClick={() => void confirmCategoryArchive()}
                type="button"
              >
                Archiver
              </Button>
            </div>
          </div>
        )}
        {canEdit && categoryDraft && (
          <form
            className="grid gap-4 p-5 sm:grid-cols-2 sm:p-7"
            onSubmit={(event) => void saveCategory(event)}
          >
            <div className="flex items-start justify-between gap-4 sm:col-span-2">
              <div>
                <p className="text-sm font-medium text-emerald-800">Catégories</p>
                <h2 className="mt-1 text-2xl font-bold" id="category-dialog-title">
                  {categoryDraft.id ? 'Modifier la catégorie' : 'Nouvelle catégorie'}
                </h2>
              </div>
              <Button
                aria-label="Fermer le formulaire de catégorie"
                className="min-h-12 min-w-12"
                onClick={() => categoryDialogRef.current?.close()}
                size="icon"
                type="button"
                variant="ghost"
              >
                ×
              </Button>
            </div>
            {categoryFormError && (
              <p
                className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 sm:col-span-2"
                role="alert"
              >
                {categoryFormError}
              </p>
            )}
            <label className="grid gap-2 text-sm font-medium">
              Nom
              <input
                className="min-h-12 rounded-xl border border-stone-300 px-3"
                maxLength={80}
                onChange={(event) =>
                  setCategoryDraft({ ...categoryDraft, name: event.target.value })
                }
                required
                value={categoryDraft.name}
              />
            </label>
            <label className="grid gap-2 text-sm font-medium">
              Type
              <select
                className="min-h-12 rounded-xl border border-stone-300 bg-white px-3"
                onChange={(event) => {
                  const kind = event.target.value
                  if (kind === 'expense' || kind === 'income') {
                    setCategoryDraft({ ...categoryDraft, kind })
                  }
                }}
                value={categoryDraft.kind}
              >
                <option value="expense">Dépense</option>
                <option value="income">Revenu</option>
              </select>
            </label>
            <label className="grid gap-2 text-sm font-medium">
              Icône (nom)
              <input
                className="min-h-12 rounded-xl border border-stone-300 px-3"
                maxLength={40}
                onChange={(event) =>
                  setCategoryDraft({ ...categoryDraft, icon: event.target.value })
                }
                value={categoryDraft.icon}
              />
            </label>
            <fieldset className="grid gap-2 sm:col-span-2">
              <legend className="text-sm font-medium">Couleur</legend>
              <div
                aria-label="Palette de couleurs des catégories"
                className="grid grid-cols-3 gap-2 sm:grid-cols-4"
                role="group"
              >
                {!isCategoryPaletteColor(categoryDraft.color) && categoryDraft.id && (
                  <div className="flex min-h-12 items-center gap-2 rounded-xl border border-primary p-2 text-left text-xs font-medium">
                    <span
                      aria-hidden="true"
                      className="size-6 shrink-0 rounded-full ring-1 ring-black/10"
                      style={{ backgroundColor: categoryDraft.color }}
                    />
                    Couleur actuelle (hors palette)
                  </div>
                )}
                {CATEGORY_COLOR_TOKENS.map((color, index) => (
                  <button
                    aria-label={`Couleur ${index + 1}`}
                    aria-pressed={categoryDraft.color === color}
                    className={`flex min-h-12 items-center gap-2 rounded-xl border p-2 text-left text-xs font-medium ${
                      categoryDraft.color === color ? 'border-primary ring-2 ring-primary/40' : ''
                    }`}
                    key={color}
                    onClick={() => setCategoryDraft({ ...categoryDraft, color })}
                    type="button"
                  >
                    <span
                      aria-hidden="true"
                      className="size-6 shrink-0 rounded-full ring-1 ring-black/10"
                      style={{ backgroundColor: color }}
                    />
                    Couleur {index + 1}
                  </button>
                ))}
              </div>
            </fieldset>
            <div className="flex flex-col-reverse gap-3 pt-2 sm:col-span-2 sm:flex-row sm:justify-end">
              <Button
                className="min-h-12"
                onClick={() => categoryDialogRef.current?.close()}
                type="button"
                variant="outline"
              >
                Annuler
              </Button>
              <Button className="min-h-12" type="submit">
                Enregistrer
              </Button>
            </div>
          </form>
        )}
      </dialog>

      <dialog
        aria-labelledby="transaction-filters-title"
        className="fixed inset-x-0 bottom-0 m-0 max-h-[85svh] w-full max-w-none overflow-y-auto rounded-t-3xl border-0 bg-white p-0 shadow-2xl backdrop:bg-stone-950/45 sm:inset-0 sm:m-auto sm:max-w-lg sm:rounded-3xl"
        ref={filterDialogRef}
      >
        <form className="space-y-5 p-5 sm:p-7" onSubmit={applyHistoryFilters}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-emerald-800">Historique</p>
              <h2 className="mt-1 text-2xl font-bold" id="transaction-filters-title">
                Filtres
              </h2>
            </div>
            <Button
              aria-label="Fermer les filtres"
              className="min-h-12 min-w-12"
              onClick={() => filterDialogRef.current?.close()}
              size="icon"
              type="button"
              variant="ghost"
            >
              ×
            </Button>
          </div>

          <label className="grid gap-2 text-sm font-medium">
            <span className="flex items-center gap-2">
              <Search aria-hidden="true" size={16} />
              Rechercher
            </span>
            <input
              autoComplete="off"
              className="min-h-12 rounded-xl border border-stone-300 px-3 font-normal"
              onChange={(event) => setDraftFilters({ ...draftFilters, search: event.target.value })}
              placeholder="Note, catégorie, membre, montant…"
              type="search"
              value={draftFilters.search}
            />
          </label>
          <label className="grid gap-2 text-sm font-medium">
            Type de transaction
            <select
              className="min-h-12 rounded-xl border border-stone-300 bg-white px-3 font-normal"
              onChange={(event) => {
                const transactionType = event.target.value
                if (
                  transactionType === 'all' ||
                  transactionType === 'expenses' ||
                  transactionType === 'income'
                ) {
                  setDraftFilters({ ...draftFilters, transactionType })
                }
              }}
              value={draftFilters.transactionType}
            >
              <option value="all">Tout</option>
              <option value="expenses">Dépenses (remboursements inclus)</option>
              <option value="income">Revenus</option>
            </select>
          </label>
          <label className="grid gap-2 text-sm font-medium">
            Catégorie
            <select
              className="min-h-12 rounded-xl border border-stone-300 bg-white px-3 font-normal"
              onChange={(event) =>
                setDraftFilters({ ...draftFilters, categoryId: event.target.value })
              }
              value={draftFilters.categoryId}
            >
              <option value="">Toutes les catégories</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                  {category.archived_at ? ' (archivée)' : ''}
                </option>
              ))}
            </select>
          </label>
          {isSharedWorkspace && (
            <label className="grid gap-2 text-sm font-medium">
              Saisi par
              <select
                className="min-h-12 rounded-xl border border-stone-300 bg-white px-3 font-normal"
                onChange={(event) =>
                  setDraftFilters({ ...draftFilters, memberId: event.target.value })
                }
                value={draftFilters.memberId}
              >
                <option value="">Tous les membres</option>
                {transactionMembers.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-between">
            <Button
              className="min-h-12"
              onClick={resetDraftFilters}
              type="button"
              variant="outline"
            >
              Réinitialiser
            </Button>
            <Button className="min-h-12" type="submit">
              Appliquer
            </Button>
          </div>
        </form>
      </dialog>

      <dialog
        aria-labelledby="quick-entry-title"
        className="fixed inset-x-0 bottom-0 m-0 max-h-[92svh] w-full max-w-none overflow-y-auto rounded-t-3xl border-0 bg-white p-0 shadow-2xl backdrop:bg-stone-950/45 sm:inset-0 sm:m-auto sm:max-w-xl sm:rounded-3xl"
        onClose={() => onQuickEntryOpenChange(false)}
        ref={dialogRef}
      >
        <form className="space-y-5 p-5 sm:p-7" onSubmit={(event) => void saveTransaction(event)}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-emerald-800">Enregistrement local</p>
              <h2 className="mt-1 text-2xl font-bold" id="quick-entry-title">
                {editingTransactionId ? 'Modifier la transaction' : 'Nouvelle transaction'}
              </h2>
            </div>
            <Button
              aria-label="Fermer"
              className="min-h-12 min-w-12"
              onClick={closeTransactionDialog}
              size="icon"
              type="button"
              variant="ghost"
            >
              ×
            </Button>
          </div>

          <div aria-label="Type de transaction" className="grid grid-cols-2 gap-2" role="group">
            {(['expense', 'refund', 'income', 'adjustment'] as const).map((kind) => (
              <button
                aria-pressed={transactionDraft.kind === kind}
                className={`min-h-12 rounded-xl text-sm font-semibold focus-visible:outline-2 focus-visible:outline-emerald-800 ${
                  transactionDraft.kind === kind
                    ? 'bg-emerald-800 text-white'
                    : 'bg-stone-100 text-stone-700'
                }`}
                key={kind}
                onClick={() => setTransactionDraft({ ...transactionDraft, kind })}
                type="button"
              >
                {transactionLabel(kind)}
              </button>
            ))}
          </div>

          {transactionError && (
            <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
              {transactionError}
            </p>
          )}

          <label className="grid gap-2 text-sm font-medium">
            {transactionDraft.kind === 'adjustment' ? 'Montant signé' : 'Montant'}
            <input
              autoFocus
              className="min-h-14 rounded-xl border border-stone-300 px-4 text-2xl font-semibold"
              inputMode="numeric"
              min={transactionDraft.kind === 'adjustment' ? undefined : '1'}
              onChange={(event) =>
                setTransactionDraft({ ...transactionDraft, amount: event.target.value })
              }
              placeholder={transactionDraft.kind === 'adjustment' ? '-500 ou 500' : '0'}
              required
              step="1"
              type="number"
              value={transactionDraft.amount}
            />
          </label>
          {transactionDraft.kind === 'income' && (
            <p className="text-sm text-stone-600">Argent reçu en plus de ton budget du mois.</p>
          )}

          {transactionDraft.kind !== 'adjustment' && (
            <fieldset className="grid gap-2">
              <legend className="text-sm font-medium">Catégorie</legend>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Choisir une catégorie">
                {transactionDraft.kind === 'expense' && (
                  <button
                    aria-pressed={selectedCategoryId === ''}
                    className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-3 text-sm font-medium ${
                      selectedCategoryId === '' ? 'border-primary ring-2 ring-primary/40' : ''
                    }`}
                    onClick={() => setTransactionDraft({ ...transactionDraft, categoryId: '' })}
                    type="button"
                  >
                    <span
                      aria-hidden="true"
                      className="size-2.5 rounded-full"
                      style={{ backgroundColor: 'var(--category-uncategorized)' }}
                    />
                    Sans catégorie
                  </button>
                )}
                {availableCategories.map((category) => (
                  <button
                    aria-pressed={selectedCategoryId === category.id}
                    className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-3 text-sm font-medium ${
                      selectedCategoryId === category.id
                        ? 'border-primary ring-2 ring-primary/40'
                        : ''
                    }`}
                    key={category.id}
                    onClick={() =>
                      setTransactionDraft({ ...transactionDraft, categoryId: category.id })
                    }
                    type="button"
                  >
                    <span
                      aria-hidden="true"
                      className="size-2.5 rounded-full ring-1 ring-black/10"
                      style={{
                        backgroundColor: category.color ?? 'var(--category-uncategorized)',
                      }}
                    />
                    {category.name}
                    {category.archived_at && ' (archivée)'}
                  </button>
                ))}
              </div>
              {transactionDraft.kind === 'income' && !selectedCategoryId && (
                <p className="text-sm text-red-700">Choisis une catégorie de revenus.</p>
              )}
            </fieldset>
          )}

          {isSharedWorkspace && (
            <label className="grid gap-2 text-sm font-medium">
              Responsable — qui a payé ou reçu l’argent ?
              <select
                className="min-h-12 rounded-xl border border-stone-300 bg-white px-3"
                onChange={(event) =>
                  setTransactionDraft({ ...transactionDraft, responsibleId: event.target.value })
                }
                required
                value={transactionDraft.responsibleId}
              >
                {responsibleMembers.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </select>
              <span className="text-xs font-normal text-stone-500">
                Cette personne peut être différente de celle qui saisit l’opération.
              </span>
            </label>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium">
              Date
              <input
                className="min-h-12 rounded-xl border border-stone-300 px-3"
                onChange={(event) =>
                  setTransactionDraft({ ...transactionDraft, occurredOn: event.target.value })
                }
                required
                type="date"
                value={transactionDraft.occurredOn}
              />
            </label>
            <label className="grid gap-2 text-sm font-medium">
              Note (facultative)
              <input
                className="min-h-12 rounded-xl border border-stone-300 px-3"
                maxLength={500}
                onChange={(event) =>
                  setTransactionDraft({ ...transactionDraft, note: event.target.value })
                }
                value={transactionDraft.note}
              />
            </label>
          </div>

          <div className="flex gap-3 pb-[env(safe-area-inset-bottom)]">
            <Button
              className="min-h-12 flex-1 rounded-xl bg-emerald-800 text-white hover:bg-emerald-900"
              disabled={!workspaceId}
              type="submit"
            >
              Enregistrer
            </Button>
            <Button
              className="min-h-12 rounded-xl"
              onClick={closeTransactionDialog}
              type="button"
              variant="outline"
            >
              Annuler
            </Button>
          </div>
        </form>
      </dialog>
    </section>
  )
}
