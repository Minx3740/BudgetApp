import { useMemo, useState, type FormEvent } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { db } from '@/data/database'
import { useCategories, useRecurringExpenses } from '@/data/hooks'
import type { RecurringExpense } from '@/data/models'
import {
  countRecurringMonths,
  createRecurringExpense,
  generateRecurringForMonth,
  replaceRecurringExpenseFromMonth,
  stopRecurringExpense,
} from '@/data/recurring-expenses'
import { monthKeyForDate } from '@/data/calculations'
import { transactionsRepository } from '@/data/repositories'

interface RecurringExpensesViewProps {
  client: SupabaseClient
  workspaceId: string | undefined
  month: string
  canManage: boolean
  isOnline: boolean
  onRefresh: () => void
}

interface RecurringExpenseDraft {
  label: string
  amount: string
  categoryId: string
  dayOfMonth: string
  startMonth: string
}

type EditScope = 'occurrence' | 'series'

function emptyDraft(month: string): RecurringExpenseDraft {
  return {
    label: '',
    amount: '',
    categoryId: '',
    dayOfMonth: '1',
    startMonth: month.slice(0, 7),
  }
}

function draftFromExpense(expense: RecurringExpense): RecurringExpenseDraft {
  return {
    label: expense.label,
    amount: String(expense.amount),
    categoryId: expense.category_id ?? '',
    dayOfMonth: String(expense.day_of_month),
    startMonth: expense.start_month.slice(0, 7),
  }
}

function formatMoney(amount: number): string {
  return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(amount)} Ar`
}

function monthLabel(month: string): string {
  return new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${month}T00:00:00.000Z`))
    .replace(/^\p{L}/u, (firstLetter) => firstLetter.toLocaleUpperCase('fr-FR'))
}

function parseDraft(draft: RecurringExpenseDraft): {
  label: string
  amount: number
  category_id: string | null
  day_of_month: number
} {
  const label = draft.label.trim()
  const amount = Number(draft.amount)
  const dayOfMonth = Number(draft.dayOfMonth)
  if (!label || label.length > 120) {
    throw new Error('Saisis un libellé de 1 à 120 caractères.')
  }
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new Error('Le montant doit être un entier positif.')
  }
  if (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 28) {
    throw new Error('Choisis un jour compris entre 1 et 28.')
  }
  return {
    label,
    amount,
    category_id: draft.categoryId || null,
    day_of_month: dayOfMonth,
  }
}

function isInPeriod(expense: RecurringExpense, month: string): boolean {
  return month >= expense.start_month && (expense.end_month === null || month <= expense.end_month)
}

export function RecurringExpensesView({
  client,
  workspaceId,
  month,
  canManage,
  isOnline,
  onRefresh,
}: RecurringExpensesViewProps) {
  const expenses = useRecurringExpenses(workspaceId)
  const categories = useCategories(workspaceId)
  const currentMonth = monthKeyForDate(new Date())
  const [draft, setDraft] = useState(() => emptyDraft(month))
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editScope, setEditScope] = useState<EditScope>('series')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const sortedExpenses = useMemo(
    () => [...expenses].sort((left, right) => right.start_month.localeCompare(left.start_month)),
    [expenses],
  )
  const expenseCategories = categories
    .filter((category) => category.kind === 'expense' && category.archived_at === null)
    .sort((left, right) => left.name.localeCompare(right.name, 'fr'))
  const editingCategory = categories.find(
    (category) => category.id === draft.categoryId && category.kind === 'expense',
  )
  const editCategories =
    editingCategory && !expenseCategories.some((category) => category.id === editingCategory.id)
      ? [...expenseCategories, editingCategory]
      : expenseCategories

  function clearMessages() {
    setError(null)
    setNotice(null)
  }

  async function saveNewExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    clearMessages()
    if (!canManage || !isOnline || !workspaceId) return

    let parsedDraft: ReturnType<typeof parseDraft>
    try {
      parsedDraft = parseDraft(draft)
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : 'Les données du forfait sont invalides.',
      )
      return
    }

    const startMonth = `${draft.startMonth}-01`
    if (!/^\d{4}-\d{2}-01$/.test(startMonth)) {
      setError('Choisis le mois de début du forfait.')
      return
    }
    const retroactiveCount = countRecurringMonths(startMonth, currentMonth)
    if (startMonth < currentMonth) {
      const confirmed = window.confirm(
        `Ce forfait va créer ${retroactiveCount} ${retroactiveCount === 1 ? 'transaction' : 'transactions'} de ${monthLabel(startMonth)} à ${monthLabel(currentMonth)}. Continuer ?`,
      )
      if (!confirmed) return
    }

    setIsSaving(true)
    try {
      await createRecurringExpense(client, {
        workspace_id: workspaceId,
        ...parsedDraft,
        start_month: startMonth,
      })
      if (startMonth <= currentMonth) {
        try {
          await generateRecurringForMonth(client, workspaceId, currentMonth)
        } catch (failure) {
          onRefresh()
          const message = failure instanceof Error ? failure.message : 'Erreur inconnue.'
          setError(`Le forfait a été créé, mais ses dépenses n’ont pas été générées. ${message}`)
          return
        }
      }
      setDraft(emptyDraft(month))
      onRefresh()
      setNotice('Forfait enregistré. Les dépenses couvertes seront visibles après synchronisation.')
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : 'Erreur inconnue.'
      setError(`Impossible d’enregistrer ce forfait. ${message}`)
    } finally {
      setIsSaving(false)
    }
  }

  async function saveExpenseChanges(event: FormEvent<HTMLFormElement>, expense: RecurringExpense) {
    event.preventDefault()
    clearMessages()
    if (!canManage || !workspaceId) return

    let parsedDraft: ReturnType<typeof parseDraft>
    try {
      parsedDraft = parseDraft(draft)
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : 'Les données du forfait sont invalides.',
      )
      return
    }

    setIsSaving(true)
    try {
      if (editScope === 'series') {
        if (!isOnline) {
          throw new Error('Une connexion Internet est nécessaire pour modifier le forfait.')
        }
        await replaceRecurringExpenseFromMonth(client, expense.id, expense.version, month, {
          ...parsedDraft,
        })
        onRefresh()
        setNotice(
          `Le forfait et les mois suivants ont été mis à jour à partir de ${monthLabel(month)}.`,
        )
      } else {
        const occurrence = await db.transactions
          .where('recurring_id')
          .equals(expense.id)
          .and((transaction) => transaction.recurring_month === month)
          .first()
        if (!occurrence || occurrence.deleted_at !== null) {
          throw new Error(`Aucune dépense générée à modifier pour ${monthLabel(month)}.`)
        }
        const day = String(parsedDraft.day_of_month).padStart(2, '0')
        await transactionsRepository.update(occurrence.id, expense.workspace_id, {
          amount: parsedDraft.amount,
          category_id: parsedDraft.category_id,
          occurred_on: `${month.slice(0, 7)}-${day}`,
          note: parsedDraft.label,
        })
        setNotice(
          isOnline
            ? `La dépense de ${monthLabel(month)} a été modifiée.`
            : `La dépense de ${monthLabel(month)} est modifiée sur cet appareil et sera synchronisée en ligne.`,
        )
      }
      setEditingId(null)
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : 'Erreur inconnue.'
      setError(`Impossible d’enregistrer les modifications. ${message}`)
    } finally {
      setIsSaving(false)
    }
  }

  async function stopExpense(expense: RecurringExpense) {
    clearMessages()
    if (!canManage || !isOnline) return
    if (
      !window.confirm(
        `Arrêter « ${expense.label} » ? Les transactions déjà créées seront conservées.`,
      )
    ) {
      return
    }

    setIsSaving(true)
    try {
      await stopRecurringExpense(client, expense.id, expense.version)
      onRefresh()
      setNotice(
        `Le forfait « ${expense.label} » est arrêté. Les transactions déjà créées restent conservées.`,
      )
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : 'Erreur inconnue.'
      setError(`Impossible d’arrêter ce forfait. ${message}`)
    } finally {
      setIsSaving(false)
    }
  }

  function beginEditing(expense: RecurringExpense) {
    clearMessages()
    setEditingId(expense.id)
    setDraft(draftFromExpense(expense))
    setEditScope(isOnline ? 'series' : 'occurrence')
  }

  return (
    <section aria-labelledby="section-title" className="max-w-4xl space-y-5">
      <div>
        <p className="mb-2 text-sm font-medium text-emerald-800">Dépenses récurrentes</p>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl" id="section-title">
          Forfaits
        </h1>
        <p className="mt-2 max-w-2xl leading-7 text-stone-600">
          Un forfait crée automatiquement une dépense chaque mois, au jour choisi. Les mois manqués
          sont rattrapés à la prochaine synchronisation ; hors ligne, tu peux consulter les
          forfaits.
        </p>
      </div>

      {error ? (
        <p
          className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      {notice ? (
        <p
          className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950"
          role="status"
        >
          {notice}
        </p>
      ) : null}
      {!isOnline ? (
        <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-950">
          Hors ligne : les forfaits restent consultables. Leur création, modification ou arrêt
          nécessite une connexion.
        </p>
      ) : null}
      {!canManage ? (
        <p className="rounded-xl bg-stone-100 p-3 text-sm text-stone-700">
          Tu peux consulter les forfaits de cet espace. Seul son propriétaire peut les créer,
          modifier ou arrêter.
        </p>
      ) : null}

      {canManage ? (
        <Card className="rounded-2xl border-0 shadow-sm ring-1 ring-stone-200">
          <CardHeader>
            <CardTitle>Nouveau forfait</CardTitle>
            <CardDescription>
              Définis la dépense, sa catégorie facultative et son premier mois.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="grid gap-4 sm:grid-cols-2" onSubmit={saveNewExpense}>
              <label className="grid gap-1.5 text-sm font-medium sm:col-span-2">
                Libellé
                <input
                  autoComplete="off"
                  className="min-h-11 rounded-xl border border-stone-300 px-3"
                  maxLength={120}
                  onChange={(event) => setDraft({ ...draft, label: event.target.value })}
                  required
                  value={draft.label}
                />
              </label>
              <label className="grid gap-1.5 text-sm font-medium">
                Montant mensuel (Ar)
                <input
                  className="min-h-11 rounded-xl border border-stone-300 px-3"
                  min={1}
                  onChange={(event) => setDraft({ ...draft, amount: event.target.value })}
                  required
                  step={1}
                  type="number"
                  value={draft.amount}
                />
              </label>
              <label className="grid gap-1.5 text-sm font-medium">
                Catégorie (facultative)
                <select
                  className="min-h-11 rounded-xl border border-stone-300 bg-white px-3"
                  onChange={(event) => setDraft({ ...draft, categoryId: event.target.value })}
                  value={draft.categoryId}
                >
                  <option value="">Non classé</option>
                  {expenseCategories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1.5 text-sm font-medium">
                Jour du mois (1 à 28)
                <input
                  className="min-h-11 rounded-xl border border-stone-300 px-3"
                  max={28}
                  min={1}
                  onChange={(event) => setDraft({ ...draft, dayOfMonth: event.target.value })}
                  required
                  step={1}
                  type="number"
                  value={draft.dayOfMonth}
                />
              </label>
              <label className="grid gap-1.5 text-sm font-medium">
                Premier mois
                <input
                  className="min-h-11 rounded-xl border border-stone-300 px-3"
                  onChange={(event) => setDraft({ ...draft, startMonth: event.target.value })}
                  required
                  type="month"
                  value={draft.startMonth}
                />
              </label>
              <div className="sm:col-span-2">
                <Button
                  className="min-h-11 w-full sm:w-auto"
                  disabled={!isOnline || !workspaceId || isSaving}
                >
                  Enregistrer le forfait
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <div className="space-y-3">
        <h2 className="text-xl font-semibold">Forfaits de l’espace</h2>
        {sortedExpenses.length === 0 ? (
          <Card className="rounded-2xl border-0 shadow-sm ring-1 ring-stone-200">
            <CardContent className="py-8 text-center text-sm text-stone-600">
              Aucun forfait pour le moment. Un forfait permet d’enregistrer automatiquement les
              dépenses qui reviennent chaque mois.
            </CardContent>
          </Card>
        ) : (
          sortedExpenses.map((expense) => {
            const editing = editingId === expense.id
            const covered = isInPeriod(expense, month)
            const categoryName = categories.find(
              (category) => category.id === expense.category_id,
            )?.name
            return (
              <Card
                className="rounded-2xl border-0 shadow-sm ring-1 ring-stone-200"
                key={expense.id}
              >
                <CardContent className="space-y-4 p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="break-words text-lg font-semibold">{expense.label}</h3>
                      <p className="mt-1 text-sm text-stone-600">
                        {formatMoney(expense.amount)} · jour {expense.day_of_month}
                        {categoryName ? ` · ${categoryName}` : ' · Non classé'}
                      </p>
                      <p className="mt-1 text-sm text-stone-500">
                        Du {monthLabel(expense.start_month)}
                        {expense.end_month
                          ? ` au ${monthLabel(expense.end_month)}`
                          : ' · Sans date de fin'}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        covered ? 'bg-emerald-100 text-emerald-900' : 'bg-stone-100 text-stone-600'
                      }`}
                    >
                      {covered ? `Prévu en ${monthLabel(month)}` : 'Non actif ce mois'}
                    </span>
                  </div>

                  {canManage && !editing ? (
                    <div className="flex flex-wrap gap-2 border-t border-stone-100 pt-3">
                      <Button
                        className="min-h-10"
                        disabled={isSaving || !covered}
                        onClick={() => beginEditing(expense)}
                        type="button"
                        variant="outline"
                      >
                        Modifier
                      </Button>
                      {expense.end_month === null || expense.end_month >= currentMonth ? (
                        <Button
                          className="min-h-10"
                          disabled={!isOnline || isSaving}
                          onClick={() => void stopExpense(expense)}
                          type="button"
                          variant="outline"
                        >
                          Arrêter
                        </Button>
                      ) : null}
                    </div>
                  ) : null}

                  {editing ? (
                    <form
                      className="grid gap-4 border-t border-stone-100 pt-4 sm:grid-cols-2"
                      onSubmit={(event) => void saveExpenseChanges(event, expense)}
                    >
                      <label className="grid gap-1.5 text-sm font-medium sm:col-span-2">
                        Libellé
                        <input
                          className="min-h-11 rounded-xl border border-stone-300 px-3"
                          maxLength={120}
                          onChange={(event) => setDraft({ ...draft, label: event.target.value })}
                          required
                          value={draft.label}
                        />
                      </label>
                      <label className="grid gap-1.5 text-sm font-medium">
                        Montant (Ar)
                        <input
                          className="min-h-11 rounded-xl border border-stone-300 px-3"
                          min={1}
                          onChange={(event) => setDraft({ ...draft, amount: event.target.value })}
                          required
                          step={1}
                          type="number"
                          value={draft.amount}
                        />
                      </label>
                      <label className="grid gap-1.5 text-sm font-medium">
                        Catégorie (facultative)
                        <select
                          className="min-h-11 rounded-xl border border-stone-300 bg-white px-3"
                          onChange={(event) =>
                            setDraft({ ...draft, categoryId: event.target.value })
                          }
                          value={draft.categoryId}
                        >
                          <option value="">Non classé</option>
                          {editCategories.map((category) => (
                            <option key={category.id} value={category.id}>
                              {category.name}
                              {category.archived_at !== null ? ' (archivée)' : ''}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="grid gap-1.5 text-sm font-medium">
                        Jour du mois (1 à 28)
                        <input
                          className="min-h-11 rounded-xl border border-stone-300 px-3"
                          max={28}
                          min={1}
                          onChange={(event) =>
                            setDraft({ ...draft, dayOfMonth: event.target.value })
                          }
                          required
                          step={1}
                          type="number"
                          value={draft.dayOfMonth}
                        />
                      </label>
                      <fieldset className="grid gap-2 text-sm sm:col-span-2">
                        <legend className="mb-1 font-medium">Appliquer les changements</legend>
                        <label className="flex min-h-10 items-center gap-2">
                          <input
                            checked={editScope === 'occurrence'}
                            name={`scope-${expense.id}`}
                            onChange={() => setEditScope('occurrence')}
                            type="radio"
                            value="occurrence"
                          />
                          Ce mois seulement — modifier la dépense générée
                        </label>
                        <label className="flex min-h-10 items-center gap-2">
                          <input
                            checked={editScope === 'series'}
                            disabled={!isOnline}
                            name={`scope-${expense.id}`}
                            onChange={() => setEditScope('series')}
                            type="radio"
                            value="series"
                          />
                          Ce mois et les suivants — garder les mois passés inchangés
                        </label>
                        <p className="text-xs text-stone-500">
                          Mois sélectionné : {monthLabel(month)}
                          {!isOnline ? ' · La série se modifie uniquement en ligne.' : ''}
                        </p>
                      </fieldset>
                      <div className="flex flex-wrap gap-2 sm:col-span-2">
                        <Button className="min-h-11" disabled={isSaving}>
                          Enregistrer
                        </Button>
                        <Button
                          className="min-h-11"
                          disabled={isSaving}
                          onClick={() => {
                            setEditingId(null)
                            clearMessages()
                          }}
                          type="button"
                          variant="outline"
                        >
                          Annuler
                        </Button>
                      </div>
                    </form>
                  ) : null}
                </CardContent>
              </Card>
            )
          })
        )}
      </div>
    </section>
  )
}
