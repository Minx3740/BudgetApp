import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Archive, CirclePlus, Filter, Pencil, RotateCcw, Search, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { categoriesRepository, transactionsRepository } from '@/data/repositories'
import type { Category, Membership, Transaction } from '@/data/models'
import type { Profile } from '@/data/models'
import { db } from '@/data/database'
import { useCategories, useTransactions } from '@/data/hooks'
import {
  createEmptyTransactionHistoryFilters,
  countAdvancedTransactionHistoryFilters,
  filterAndSortTransactions,
  paginateTransactions,
  TRANSACTION_HISTORY_PAGE_SIZE,
  type TransactionHistoryFilters,
} from '@/data/transaction-history'

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

function responsibilityLabel(kind: TransactionKind): string {
  switch (kind) {
    case 'expense':
      return 'payé par'
    case 'refund':
      return 'remboursement reçu par'
    case 'income':
      return 'revenu reçu par'
    case 'adjustment':
      return 'ajustement pour'
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
  const [notice, setNotice] = useState<string | null>(null)
  const [categoryDraft, setCategoryDraft] = useState<CategoryDraft | null>(null)
  const [editingTransactionId, setEditingTransactionId] = useState<string | null>(null)
  const [transactionDraft, setTransactionDraft] = useState<TransactionDraft>(() =>
    newTransactionDraft(month, userId),
  )
  const [historyState, setHistoryState] = useState(() => ({
    workspaceId,
    filters: createEmptyTransactionHistoryFilters(),
    page: 1,
  }))
  const dialogRef = useRef<HTMLDialogElement>(null)
  const filterDialogRef = useRef<HTMLDialogElement>(null)
  const [draftAdvancedFilters, setDraftAdvancedFilters] = useState({ categoryId: '', memberId: '' })
  const categories = useCategories(workspaceId)
  const transactions = useTransactions(workspaceId)

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
  const historyFilters =
    historyState.workspaceId === workspaceId
      ? historyState.filters
      : createEmptyTransactionHistoryFilters()
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
        month,
      ),
    [historyFilters, historyNames, month, transactions],
  )
  const transactionPage = useMemo(
    () =>
      paginateTransactions(
        filteredTransactions,
        historyState.workspaceId === workspaceId ? historyState.page : 1,
      ),
    [filteredTransactions, historyState, workspaceId],
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

  function updateHistoryFilter<Key extends keyof TransactionHistoryFilters>(
    key: Key,
    value: TransactionHistoryFilters[Key],
  ) {
    setHistoryState({
      workspaceId,
      filters: { ...historyFilters, [key]: value },
      page: 1,
    })
  }

  function openHistoryFilterDialog() {
    setDraftAdvancedFilters({
      categoryId: historyFilters.categoryId,
      memberId: historyFilters.memberId,
    })
    filterDialogRef.current?.showModal()
  }

  function applyHistoryFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setHistoryState({
      workspaceId,
      filters: {
        ...historyFilters,
        categoryId: draftAdvancedFilters.categoryId,
        memberId: isSharedWorkspace ? draftAdvancedFilters.memberId : '',
      },
      page: 1,
    })
    filterDialogRef.current?.close()
  }

  function removeHistoryFilter(key: 'categoryId' | 'memberId') {
    setHistoryState({
      workspaceId,
      filters: { ...historyFilters, [key]: '' },
      page: 1,
    })
  }

  const activeAdvancedFilterCount = countAdvancedTransactionHistoryFilters(
    historyFilters,
    isSharedWorkspace,
  )
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

  function closeTransactionDialog() {
    setTransactionError(null)
    onQuickEntryOpenChange(false)
  }

  async function saveCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canEdit || !workspaceId || !categoryDraft) return
    setError(null)
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
            setError(
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
      setCategoryDraft(null)
      setNotice('Catégorie enregistrée sur cet appareil.')
    } catch (failure) {
      setError(`Impossible d’enregistrer cette catégorie. ${errorMessage(failure)}`)
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

  function editTransaction(transaction: Transaction) {
    if (!canEdit) return
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
        const changes = {
          category_id: input.category_id,
          kind: input.kind,
          amount: input.amount,
          occurred_on: input.occurred_on,
          note: input.note,
          paid_by: input.paid_by,
        }
        await transactionsRepository.update(editingTransactionId, workspaceId, changes)
        setNotice('Transaction mise à jour sur cet appareil.')
      } else {
        await transactionsRepository.create(input)
        setNotice('Transaction enregistrée sur cet appareil.')
      }
      setEditingTransactionId(null)
      setTransactionDraft(newTransactionDraft(month, userId))
      closeTransactionDialog()
    } catch (failure) {
      setTransactionError(`Impossible d’enregistrer cette transaction. ${errorMessage(failure)}`)
    }
  }

  async function deleteTransaction(transaction: Transaction) {
    if (!canEdit || !workspaceId || !window.confirm('Supprimer cette transaction ?')) return
    setError(null)
    setNotice(null)
    try {
      await transactionsRepository.softDelete(transaction.id, workspaceId)
      setNotice('Transaction supprimée sur cet appareil.')
    } catch (failure) {
      setError(`Impossible de supprimer cette transaction. ${errorMessage(failure)}`)
    }
  }

  return (
    <section aria-labelledby="section-title" className="max-w-3xl">
      <p className="mb-2 text-sm font-medium text-emerald-800">Données de l’espace actif</p>
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl" id="section-title">
        Transactions et catégories
      </h1>
      <p className="mt-3 leading-7 text-stone-600">
        {canEdit
          ? 'Tes changements sont enregistrés sur cet appareil, même sans connexion.'
          : 'Les données de cet espace sont disponibles sur cet appareil.'}
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
        <p
          className="mt-5 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
          role="status"
        >
          {notice}
        </p>
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
              <div className="space-y-2">
                <div
                  aria-label="Filtrer les transactions par type"
                  className="grid grid-cols-3 gap-2"
                >
                  {(
                    [
                      { value: 'all', label: 'Tout' },
                      { value: 'expenses', label: 'Dépenses' },
                      { value: 'income', label: 'Revenus' },
                    ] as const
                  ).map((option) => (
                    <button
                      aria-pressed={historyFilters.transactionType === option.value}
                      className={`min-h-11 rounded-xl px-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-emerald-800 ${
                        historyFilters.transactionType === option.value
                          ? 'bg-emerald-800 text-white'
                          : 'bg-stone-100 text-stone-700'
                      }`}
                      key={option.value}
                      onClick={() => updateHistoryFilter('transactionType', option.value)}
                      type="button"
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-stone-500">
                  Les remboursements sont classés avec les dépenses ; les ajustements apparaissent
                  dans Tout.
                </p>
              </div>
              <div className="space-y-3">
                <div className="flex items-end gap-2">
                  <label className="grid min-w-0 flex-1 gap-1.5 text-sm font-medium">
                    <span className="flex items-center gap-2">
                      <Search aria-hidden="true" size={16} />
                      Rechercher
                    </span>
                    <input
                      autoComplete="off"
                      className="min-h-11 w-full rounded-xl border border-stone-300 px-3 font-normal"
                      onChange={(event) => updateHistoryFilter('search', event.target.value)}
                      placeholder="Note, catégorie, membre, montant…"
                      type="search"
                      value={historyFilters.search}
                    />
                  </label>
                  <Button
                    aria-label={`Filtres${activeAdvancedFilterCount ? `, ${activeAdvancedFilterCount} actif${activeAdvancedFilterCount > 1 ? 's' : ''}` : ''}`}
                    className="min-h-11 shrink-0 gap-2"
                    onClick={openHistoryFilterDialog}
                    type="button"
                    variant="outline"
                  >
                    <Filter aria-hidden="true" size={17} />
                    Filtres
                    {activeAdvancedFilterCount > 0 && (
                      <span
                        aria-hidden="true"
                        className="inline-flex size-5 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground"
                      >
                        {activeAdvancedFilterCount}
                      </span>
                    )}
                  </Button>
                </div>
                {(historyFilters.categoryId || (isSharedWorkspace && historyFilters.memberId)) && (
                  <div aria-label="Filtres actifs" className="flex flex-wrap gap-2">
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
              </div>

              <div
                aria-live="polite"
                className="flex flex-wrap items-center justify-between gap-2 text-sm text-stone-600"
                role="status"
              >
                <span>
                  {filteredTransactions.length === 0
                    ? `Aucune transaction sur ${transactions.length}`
                    : `Transactions ${firstVisibleTransaction} à ${lastVisibleTransaction} sur ${filteredTransactions.length}`}
                </span>
              </div>

              {transactions.length === 0 ? (
                <p className="py-5 text-center text-sm text-stone-500">
                  Aucune transaction. Tu peux ajouter ta première dépense.
                </p>
              ) : filteredTransactions.length === 0 ? (
                <div className="space-y-2 py-5 text-center">
                  <p className="text-sm text-stone-600">
                    Aucune transaction ne correspond à ces critères.
                  </p>
                </div>
              ) : (
                transactionPage.items.map((transaction) => {
                  const category = categories.find((item) => item.id === transaction.category_id)
                  const responsibleName = historyNames.members.get(transaction.paid_by) || 'Membre'
                  const authorName = historyNames.members.get(transaction.created_by) || 'Membre'
                  const attribution =
                    transaction.created_by === transaction.paid_by
                      ? `${responsibilityLabel(transaction.kind)} ${responsibleName}`
                      : `${responsibilityLabel(transaction.kind)} ${responsibleName} · saisi par ${authorName}`
                  const amountPrefix =
                    transaction.kind === 'income' || transaction.kind === 'refund'
                      ? '+'
                      : transaction.kind === 'expense'
                        ? '−'
                        : ''

                  return (
                    <article
                      className="flex items-center justify-between gap-3 rounded-xl bg-stone-50 p-3"
                      key={transaction.id}
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {category?.name ?? transactionLabel(transaction.kind)}
                        </p>
                        <p className="truncate text-sm text-stone-500">
                          {new Date(`${transaction.occurred_on}T00:00:00`).toLocaleDateString(
                            'fr-FR',
                          )}
                          {transaction.note ? ` · ${transaction.note}` : ''}
                          {isSharedWorkspace && ` · ${attribution}`}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <span className="mr-2 text-right font-semibold">
                          {amountPrefix}
                          {formatMoney(transaction.amount)}
                        </span>
                        {canEdit && (
                          <>
                            <Button
                              aria-label={`Modifier ${transactionLabel(transaction.kind).toLowerCase()}`}
                              className="min-h-12 min-w-12"
                              onClick={() => editTransaction(transaction)}
                              size="icon"
                              variant="ghost"
                            >
                              <Pencil aria-hidden="true" size={17} />
                            </Button>
                            <Button
                              aria-label={`Supprimer ${transactionLabel(transaction.kind).toLowerCase()}`}
                              className="min-h-12 min-w-12 text-red-700 hover:text-red-800"
                              onClick={() => void deleteTransaction(transaction)}
                              size="icon"
                              variant="ghost"
                            >
                              <Trash2 aria-hidden="true" size={17} />
                            </Button>
                          </>
                        )}
                      </div>
                    </article>
                  )
                })
              )}
              {transactionPage.pageCount > 1 && (
                <nav
                  aria-label="Pagination de l’historique"
                  className="flex items-center justify-between gap-3 border-t border-stone-200 pt-4"
                >
                  <Button
                    disabled={transactionPage.page === 1}
                    onClick={() =>
                      setHistoryState({
                        workspaceId,
                        filters: historyFilters,
                        page: Math.max(1, transactionPage.page - 1),
                      })
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
                      setHistoryState({
                        workspaceId,
                        filters: historyFilters,
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
                    setCategoryDraft({
                      id: null,
                      name: '',
                      kind: 'expense',
                      icon: 'tag',
                      color: '#3d8b8b',
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
              {categories.length === 0 && (
                <p className="py-4 text-center text-sm text-stone-500">
                  Aucune catégorie pour le moment.
                </p>
              )}
              {categories.map((category) => (
                <article
                  className="flex items-center justify-between gap-3 rounded-xl bg-stone-50 p-3"
                  key={category.id}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      aria-hidden="true"
                      className="size-4 shrink-0 rounded-full ring-1 ring-black/10"
                      style={{ backgroundColor: category.color ?? '#d6d3d1' }}
                    />
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {category.name}
                        {category.archived_at && (
                          <span className="ml-2 text-xs font-normal text-stone-500">Archivée</span>
                        )}
                      </p>
                      <p className="text-sm text-stone-500">
                        {category.kind === 'expense' ? 'Dépense' : 'Revenu'} ·{' '}
                        {category.icon ?? '—'}
                      </p>
                    </div>
                  </div>
                  {canEdit && (
                    <div className="flex shrink-0">
                      <Button
                        aria-label={`Modifier ${category.name}`}
                        className="min-h-12 min-w-12"
                        onClick={() =>
                          setCategoryDraft({
                            id: category.id,
                            name: category.name,
                            kind: category.kind,
                            icon: category.icon ?? '',
                            color: category.color ?? '#3d8b8b',
                          })
                        }
                        size="icon"
                        variant="ghost"
                      >
                        <Pencil aria-hidden="true" size={17} />
                      </Button>
                      <Button
                        aria-label={`${category.archived_at ? 'Restaurer' : 'Archiver'} ${category.name}`}
                        className="min-h-12 min-w-12"
                        onClick={() =>
                          void toggleCategoryArchive(category.id, category.archived_at)
                        }
                        size="icon"
                        variant="ghost"
                      >
                        {category.archived_at ? (
                          <RotateCcw aria-hidden="true" size={17} />
                        ) : (
                          <Archive aria-hidden="true" size={17} />
                        )}
                      </Button>
                    </div>
                  )}
                </article>
              ))}
            </CardContent>
          </Card>

          {canEdit && categoryDraft && (
            <Card className="rounded-2xl border-0 shadow-sm ring-stone-200">
              <CardHeader>
                <CardTitle>
                  {categoryDraft.id ? 'Modifier la catégorie' : 'Nouvelle catégorie'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form
                  className="grid gap-4 sm:grid-cols-2"
                  onSubmit={(event) => void saveCategory(event)}
                >
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
                  <label className="grid gap-2 text-sm font-medium">
                    Couleur
                    <input
                      className="min-h-12 w-full rounded-xl border border-stone-300 bg-white p-2"
                      onChange={(event) =>
                        setCategoryDraft({ ...categoryDraft, color: event.target.value })
                      }
                      type="color"
                      value={categoryDraft.color}
                    />
                  </label>
                  <div className="flex gap-3 sm:col-span-2">
                    <Button className="min-h-12" type="submit">
                      Enregistrer
                    </Button>
                    <Button
                      className="min-h-12"
                      onClick={() => setCategoryDraft(null)}
                      type="button"
                      variant="outline"
                    >
                      Annuler
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          )}
        </div>
      )}

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
            Catégorie
            <select
              className="min-h-12 rounded-xl border border-stone-300 bg-white px-3 font-normal"
              onChange={(event) =>
                setDraftAdvancedFilters({ ...draftAdvancedFilters, categoryId: event.target.value })
              }
              value={draftAdvancedFilters.categoryId}
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
                  setDraftAdvancedFilters({ ...draftAdvancedFilters, memberId: event.target.value })
                }
                value={draftAdvancedFilters.memberId}
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
              onClick={() => setDraftAdvancedFilters({ categoryId: '', memberId: '' })}
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

          {transactionDraft.kind !== 'adjustment' && (
            <label className="grid gap-2 text-sm font-medium">
              Catégorie
              <select
                className="min-h-12 rounded-xl border border-stone-300 bg-white px-3"
                onChange={(event) =>
                  setTransactionDraft({ ...transactionDraft, categoryId: event.target.value })
                }
                required={transactionDraft.kind === 'income'}
                value={selectedCategoryId}
              >
                {transactionDraft.kind === 'income' ? (
                  <option value="">Choisir une catégorie de revenus</option>
                ) : (
                  <option value="">Sans catégorie</option>
                )}
                {availableCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
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
