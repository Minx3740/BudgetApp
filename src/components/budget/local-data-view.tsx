import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Archive, CirclePlus, Pencil, RotateCcw, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  accountsRepository,
  categoriesRepository,
  transactionsRepository,
} from '@/data/repositories'
import type { Category, Transaction } from '@/data/models'
import type { Profile } from '@/data/models'
import { db } from '@/data/database'
import { useAccounts, useCategories, useTransactions } from '@/data/hooks'
import { calculateAccountBalance } from '@/data/calculations'

type DataTab = 'transactions' | 'accounts' | 'categories'
type TransactionKind = Transaction['kind']

interface LocalDataViewProps {
  workspaceId: string | undefined
  userId: string
  currency: string
  canEdit: boolean
  isSharedWorkspace: boolean
  profiles: Profile[]
  isQuickEntryOpen: boolean
  onQuickEntryOpenChange: (isOpen: boolean) => void
}

interface AccountDraft {
  id: string | null
  name: string
  type: string
  initialBalance: string
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
  accountId: string
  toAccountId: string
  categoryId: string
  occurredOn: string
  note: string
}

const dataTabs: { id: DataTab; label: string }[] = [
  { id: 'transactions', label: 'Transactions' },
  { id: 'accounts', label: 'Comptes' },
  { id: 'categories', label: 'Catégories' },
]

function localDate(): string {
  const today = new Date()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')
  return `${today.getFullYear()}-${month}-${day}`
}

function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount)
}

function errorMessage(failure: unknown): string {
  return failure instanceof Error ? failure.message : 'Erreur inconnue.'
}

function newTransactionDraft(): TransactionDraft {
  return {
    kind: 'expense',
    amount: '',
    accountId: '',
    toAccountId: '',
    categoryId: '',
    occurredOn: localDate(),
    note: '',
  }
}

function transactionLabel(kind: TransactionKind): string {
  if (kind === 'expense') return 'Dépense'
  if (kind === 'income') return 'Revenu'
  return 'Transfert'
}

export function LocalDataView({
  workspaceId,
  userId,
  currency,
  canEdit,
  isSharedWorkspace,
  profiles,
  isQuickEntryOpen,
  onQuickEntryOpenChange,
}: LocalDataViewProps) {
  const [activeTab, setActiveTab] = useState<DataTab>('transactions')
  const [error, setError] = useState<string | null>(null)
  const [transactionError, setTransactionError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [accountDraft, setAccountDraft] = useState<AccountDraft | null>(null)
  const [categoryDraft, setCategoryDraft] = useState<CategoryDraft | null>(null)
  const [editingTransactionId, setEditingTransactionId] = useState<string | null>(null)
  const [transactionDraft, setTransactionDraft] = useState<TransactionDraft>(newTransactionDraft)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const accounts = useAccounts(workspaceId)
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

  const activeAccounts = accounts.filter((account) => account.archived_at === null)
  const expenseCategories = categories.filter(
    (category) => category.kind === 'expense' && category.archived_at === null,
  )
  const incomeCategories = categories.filter(
    (category) => category.kind === 'income' && category.archived_at === null,
  )
  const currentCategory = categories.find((category) => category.id === transactionDraft.categoryId)
  const availableCategories =
    transactionDraft.kind === 'income' ? incomeCategories : expenseCategories
  const transactionAccount = accounts.find((account) => account.id === transactionDraft.accountId)
  const selectedAccountId = transactionAccount
    ? transactionAccount.id
    : (activeAccounts[0]?.id ?? '')
  const transactionAccountChoices = [...activeAccounts]
  if (
    editingTransactionId &&
    transactionAccount?.archived_at &&
    !transactionAccountChoices.some((account) => account.id === transactionAccount.id)
  ) {
    transactionAccountChoices.push(transactionAccount)
  }
  const transactionDestination = accounts.find(
    (account) => account.id === transactionDraft.toAccountId,
  )
  const destinationAccounts = activeAccounts.filter((account) => account.id !== selectedAccountId)
  if (
    editingTransactionId &&
    transactionDestination?.archived_at &&
    !destinationAccounts.some((account) => account.id === transactionDestination.id)
  ) {
    destinationAccounts.push(transactionDestination)
  }
  const selectedDestinationId =
    destinationAccounts.find((account) => account.id === transactionDraft.toAccountId)?.id ??
    destinationAccounts[0]?.id ??
    ''
  if (
    editingTransactionId &&
    currentCategory?.archived_at &&
    currentCategory.kind === transactionDraft.kind &&
    !availableCategories.some((category) => category.id === currentCategory.id)
  ) {
    availableCategories.push(currentCategory)
  }
  const selectedCategoryId =
    availableCategories.find((category) => category.id === transactionDraft.categoryId)?.id ??
    availableCategories[0]?.id ??
    ''
  const orderedTransactions = [...transactions].sort(
    (left, right) =>
      right.occurred_on.localeCompare(left.occurred_on) ||
      right.created_at.localeCompare(left.created_at),
  )

  function openNewTransaction() {
    if (!canEdit) return
    setError(null)
    setTransactionError(null)
    setNotice(null)
    setEditingTransactionId(null)
    setTransactionDraft(newTransactionDraft())
    onQuickEntryOpenChange(true)
  }

  function closeTransactionDialog() {
    setTransactionError(null)
    onQuickEntryOpenChange(false)
  }

  async function saveAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canEdit || !workspaceId || !accountDraft) return
    setError(null)
    setNotice(null)

    try {
      const initialBalance = accountDraft.initialBalance.trim()
        ? Number(accountDraft.initialBalance)
        : Number.NaN
      if (accountDraft.id) {
        await accountsRepository.update(accountDraft.id, workspaceId, {
          name: accountDraft.name,
          type: accountDraft.type,
          initial_balance: initialBalance,
        })
      } else {
        await accountsRepository.create({
          workspace_id: workspaceId,
          name: accountDraft.name,
          type: accountDraft.type,
          initial_balance: initialBalance,
          archived_at: null,
        })
      }
      setAccountDraft(null)
      setNotice('Compte enregistré sur cet appareil.')
    } catch (failure) {
      setError(`Impossible d’enregistrer ce compte. ${errorMessage(failure)}`)
    }
  }

  async function toggleAccountArchive(accountId: string, archivedAt: string | null) {
    if (!canEdit || !workspaceId) return
    setError(null)
    setNotice(null)
    try {
      await accountsRepository.update(accountId, workspaceId, {
        archived_at: archivedAt === null ? new Date().toISOString() : null,
      })
      setNotice(archivedAt === null ? 'Compte archivé.' : 'Compte restauré.')
    } catch (failure) {
      setError(`Impossible de modifier ce compte. ${errorMessage(failure)}`)
    }
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
      accountId: transaction.account_id,
      toAccountId: transaction.to_account_id ?? '',
      categoryId: transaction.category_id ?? '',
      occurredOn: transaction.occurred_on,
      note: transaction.note ?? '',
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
    if (!selectedAccountId) {
      setTransactionError('Crée un compte avant d’ajouter une transaction.')
      return
    }
    if (transactionDraft.kind === 'transfer' && !selectedDestinationId) {
      setTransactionError('Ajoute un deuxième compte avant de créer un transfert.')
      return
    }
    if (transactionDraft.kind !== 'transfer' && !selectedCategoryId) {
      setTransactionError('Ajoute une catégorie correspondante avant de créer cette transaction.')
      return
    }

    setError(null)
    setNotice(null)
    const input = {
      workspace_id: workspaceId,
      account_id: selectedAccountId,
      to_account_id: transactionDraft.kind === 'transfer' ? selectedDestinationId : null,
      category_id: transactionDraft.kind === 'transfer' ? null : selectedCategoryId,
      kind: transactionDraft.kind,
      amount: Number(transactionDraft.amount),
      occurred_on: transactionDraft.occurredOn,
      note: transactionDraft.note.trim() || null,
      created_by: userId,
    }

    try {
      if (editingTransactionId) {
        const changes = {
          account_id: input.account_id,
          to_account_id: input.to_account_id,
          category_id: input.category_id,
          kind: input.kind,
          amount: input.amount,
          occurred_on: input.occurred_on,
          note: input.note,
        }
        await transactionsRepository.update(editingTransactionId, workspaceId, changes)
        setNotice('Transaction mise à jour sur cet appareil.')
      } else {
        await transactionsRepository.create(input)
        setNotice('Transaction enregistrée sur cet appareil.')
      }
      setEditingTransactionId(null)
      setTransactionDraft(newTransactionDraft())
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
        Transactions, comptes et catégories
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
        className="mt-6 grid grid-cols-3 gap-2 rounded-2xl bg-stone-100 p-1"
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
            <CardContent className="space-y-3">
              {orderedTransactions.length === 0 ? (
                <p className="py-5 text-center text-sm text-stone-500">
                  Aucune transaction. Tu peux ajouter ta première dépense.
                </p>
              ) : (
                orderedTransactions.map((transaction) => {
                  const category = categories.find((item) => item.id === transaction.category_id)
                  const account = accounts.find((item) => item.id === transaction.account_id)
                  const amountPrefix =
                    transaction.kind === 'income' ? '+' : transaction.kind === 'expense' ? '−' : ''

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
                          {account ? ` · ${account.name}` : ''}
                          {transaction.note ? ` · ${transaction.note}` : ''}
                          {isSharedWorkspace &&
                            ` · par ${
                              profiles.find((profile) => profile.id === transaction.created_by)
                                ?.display_name || transaction.created_by
                            }`}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <span className="mr-2 text-right font-semibold">
                          {amountPrefix}
                          {formatMoney(transaction.amount, currency)}
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
            </CardContent>
          </Card>
        </div>
      )}

      {workspaceId && activeTab === 'accounts' && (
        <div className="mt-5 space-y-4">
          <Card className="rounded-2xl border-0 shadow-sm ring-stone-200">
            <CardHeader className="flex flex-row items-center justify-between gap-3">
              <div>
                <CardTitle>Comptes et portefeuilles</CardTitle>
                <CardDescription>
                  Le solde est calculé à partir du solde initial et des transactions.
                </CardDescription>
              </div>
              {canEdit && (
                <Button
                  className="min-h-12 shrink-0"
                  onClick={() =>
                    setAccountDraft({ id: null, name: '', type: 'cash', initialBalance: '0' })
                  }
                  variant="outline"
                >
                  <CirclePlus aria-hidden="true" size={18} />
                  Ajouter
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              {accounts.length === 0 && (
                <p className="py-4 text-center text-sm text-stone-500">
                  Aucun compte pour le moment.
                </p>
              )}
              {accounts.map((account) => (
                <article
                  className="flex items-center justify-between gap-3 rounded-xl bg-stone-50 p-3"
                  key={account.id}
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {account.name}
                      {account.archived_at && (
                        <span className="ml-2 text-xs font-normal text-stone-500">Archivé</span>
                      )}
                    </p>
                    <p className="text-sm text-stone-500">
                      {formatMoney(calculateAccountBalance(account, transactions), currency)}
                    </p>
                  </div>
                  {canEdit && (
                    <div className="flex shrink-0">
                      <Button
                        aria-label={`Modifier ${account.name}`}
                        className="min-h-12 min-w-12"
                        onClick={() =>
                          setAccountDraft({
                            id: account.id,
                            name: account.name,
                            type: account.type,
                            initialBalance: String(account.initial_balance),
                          })
                        }
                        size="icon"
                        variant="ghost"
                      >
                        <Pencil aria-hidden="true" size={17} />
                      </Button>
                      <Button
                        aria-label={`${account.archived_at ? 'Restaurer' : 'Archiver'} ${account.name}`}
                        className="min-h-12 min-w-12"
                        onClick={() => void toggleAccountArchive(account.id, account.archived_at)}
                        size="icon"
                        variant="ghost"
                      >
                        {account.archived_at ? (
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

          {canEdit && accountDraft && (
            <Card className="rounded-2xl border-0 shadow-sm ring-stone-200">
              <CardHeader>
                <CardTitle>{accountDraft.id ? 'Modifier le compte' : 'Nouveau compte'}</CardTitle>
              </CardHeader>
              <CardContent>
                <form
                  className="grid gap-4 sm:grid-cols-2"
                  onSubmit={(event) => void saveAccount(event)}
                >
                  <label className="grid gap-2 text-sm font-medium">
                    Nom
                    <input
                      autoComplete="off"
                      className="min-h-12 rounded-xl border border-stone-300 px-3"
                      maxLength={80}
                      onChange={(event) =>
                        setAccountDraft({ ...accountDraft, name: event.target.value })
                      }
                      required
                      value={accountDraft.name}
                    />
                  </label>
                  <label className="grid gap-2 text-sm font-medium">
                    Type
                    <input
                      className="min-h-12 rounded-xl border border-stone-300 px-3"
                      maxLength={40}
                      onChange={(event) =>
                        setAccountDraft({ ...accountDraft, type: event.target.value })
                      }
                      required
                      value={accountDraft.type}
                    />
                  </label>
                  <label className="grid gap-2 text-sm font-medium sm:col-span-2">
                    Solde initial (montant entier)
                    <input
                      className="min-h-12 rounded-xl border border-stone-300 px-3"
                      inputMode="numeric"
                      onChange={(event) =>
                        setAccountDraft({ ...accountDraft, initialBalance: event.target.value })
                      }
                      required
                      step="1"
                      type="number"
                      value={accountDraft.initialBalance}
                    />
                  </label>
                  <div className="flex gap-3 sm:col-span-2">
                    <Button className="min-h-12" type="submit">
                      Enregistrer
                    </Button>
                    <Button
                      className="min-h-12"
                      onClick={() => setAccountDraft(null)}
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

          <div aria-label="Type de transaction" className="grid grid-cols-3 gap-2" role="group">
            {(['expense', 'income', 'transfer'] as const).map((kind) => (
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
            Montant
            <input
              autoFocus
              className="min-h-14 rounded-xl border border-stone-300 px-4 text-2xl font-semibold"
              inputMode="numeric"
              min="1"
              onChange={(event) =>
                setTransactionDraft({ ...transactionDraft, amount: event.target.value })
              }
              placeholder="0"
              required
              step="1"
              type="number"
              value={transactionDraft.amount}
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium">
              {transactionDraft.kind === 'transfer' ? 'Compte source' : 'Compte'}
              <select
                className="min-h-12 rounded-xl border border-stone-300 bg-white px-3"
                onChange={(event) =>
                  setTransactionDraft({ ...transactionDraft, accountId: event.target.value })
                }
                required
                value={selectedAccountId}
              >
                {transactionAccountChoices.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                    {account.archived_at ? ' (archivé)' : ''}
                  </option>
                ))}
              </select>
            </label>

            {transactionDraft.kind === 'transfer' ? (
              <label className="grid gap-2 text-sm font-medium">
                Compte destinataire
                <select
                  className="min-h-12 rounded-xl border border-stone-300 bg-white px-3"
                  onChange={(event) =>
                    setTransactionDraft({ ...transactionDraft, toAccountId: event.target.value })
                  }
                  required
                  value={selectedDestinationId}
                >
                  {destinationAccounts.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <label className="grid gap-2 text-sm font-medium">
                Catégorie
                <select
                  className="min-h-12 rounded-xl border border-stone-300 bg-white px-3"
                  onChange={(event) =>
                    setTransactionDraft({ ...transactionDraft, categoryId: event.target.value })
                  }
                  required
                  value={selectedCategoryId}
                >
                  {availableCategories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>

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
