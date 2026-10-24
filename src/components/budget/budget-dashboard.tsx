import { useMemo, useState, type FormEvent } from 'react'
import { ArrowLeft, ArrowRight, Pencil, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useBudgets, useCategories, useTransactions } from '@/data/hooks'
import { calculateMonthlyBudgetSummary, monthKeyForDate, shiftMonth } from '@/data/calculations'
import { budgetsRepository } from '@/data/repositories'
import type { Budget } from '@/data/models'

type BudgetDashboardMode = 'home' | 'manage'

interface BudgetDashboardProps {
  workspaceId: string | undefined
  currency: string
  canEdit: boolean
  mode: BudgetDashboardMode
  onOpenBudgets?: () => void
}

function formatMoney(amount: number, currency: string): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount)
}

function formatMonth(month: string): string {
  const label = new Intl.DateTimeFormat('fr-FR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${month}T00:00:00.000Z`))
  return `${label.charAt(0).toLocaleUpperCase('fr-FR')}${label.slice(1)}`
}

function budgetErrorMessage(failure: unknown): string {
  if (failure instanceof Error) {
    if (failure.name === 'ConstraintError') {
      return 'Un plafond existe déjà pour cette catégorie et ce mois. Modifie-le depuis sa carte.'
    }
    return failure.message
  }
  return 'Erreur inconnue.'
}

function defaultCategoryId(categoryIds: string[], budgets: Budget[], month: string): string {
  return (
    categoryIds.find(
      (categoryId) =>
        !budgets.some(
          (budget) =>
            budget.category_id === categoryId &&
            budget.month === month &&
            budget.deleted_at === null,
        ),
    ) ??
    categoryIds[0] ??
    ''
  )
}

export function BudgetDashboard({
  workspaceId,
  currency,
  canEdit,
  mode,
  onOpenBudgets,
}: BudgetDashboardProps) {
  const [month, setMonth] = useState(() => monthKeyForDate(new Date()))
  const [isEditing, setIsEditing] = useState(false)
  const [editingBudgetId, setEditingBudgetId] = useState<string | null>(null)
  const [categoryId, setCategoryId] = useState('')
  const [limitAmount, setLimitAmount] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const budgets = useBudgets(workspaceId)
  const categories = useCategories(workspaceId)
  const transactions = useTransactions(workspaceId)
  const expenseCategories = categories.filter(
    (category) => category.kind === 'expense' && category.archived_at === null,
  )
  const availableCategoryIds = expenseCategories
    .map((category) => category.id)
    .filter(
      (categoryId) =>
        !budgets.some(
          (budget) =>
            budget.category_id === categoryId &&
            budget.month === month &&
            budget.deleted_at === null,
        ),
    )
  const summary = useMemo(
    () => calculateMonthlyBudgetSummary(month, budgets, categories, transactions),
    [budgets, categories, month, transactions],
  )
  const monthBudgets = budgets.filter((budget) => budget.month === month)
  const activeBudgetCategories = summary.categories.filter((item) => item.budgetAmount !== null)
  const editingCategory = categories.find(
    (category) => category.id === categoryId && category.kind === 'expense',
  )
  const formCategories =
    editingCategory && !expenseCategories.some((category) => category.id === editingCategory.id)
      ? [...expenseCategories, editingCategory]
      : expenseCategories
  const consumedCategories = summary.categories
    .filter((item) => item.spentAmount > 0)
    .slice(0, mode === 'home' ? 3 : 10)
  const currentDate = new Date()
  const currentMonth = monthKeyForDate(currentDate)
  const isCurrentMonth = month === currentMonth

  function startNewBudget() {
    setEditingBudgetId(null)
    setCategoryId(defaultCategoryId(availableCategoryIds, budgets, month))
    setLimitAmount('')
    setFormError(null)
    setNotice(null)
    setIsEditing(true)
  }

  function startEditingBudget(budget: Budget) {
    setEditingBudgetId(budget.id)
    setCategoryId(budget.category_id)
    setLimitAmount(String(budget.limit_amount))
    setFormError(null)
    setNotice(null)
    setIsEditing(true)
  }

  async function saveBudget(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)
    setNotice(null)

    if (!canEdit) {
      setFormError('Tu as un accès en lecture seule à cet espace.')
      return
    }
    if (!workspaceId) {
      setFormError('Aucun espace local n’est disponible.')
      return
    }
    const amount = Number(limitAmount)
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      setFormError('Le plafond doit être un montant entier supérieur à zéro.')
      return
    }
    const selectedCategory = formCategories.find((category) => category.id === categoryId)
    if (!selectedCategory) {
      setFormError('Choisis une catégorie de dépense active.')
      return
    }

    try {
      const existingBudget = budgets.find(
        (budget) =>
          budget.id === editingBudgetId ||
          (budget.category_id === selectedCategory.id && budget.month === month),
      )
      if (existingBudget) {
        await budgetsRepository.update(existingBudget.id, workspaceId, {
          category_id: selectedCategory.id,
          month,
          limit_amount: amount,
        })
      } else {
        await budgetsRepository.create({
          workspace_id: workspaceId,
          category_id: selectedCategory.id,
          month,
          limit_amount: amount,
        })
      }
      setIsEditing(false)
      setEditingBudgetId(null)
      setNotice('Plafond enregistré sur cet appareil.')
    } catch (failure) {
      setFormError(`Impossible d’enregistrer ce plafond. ${budgetErrorMessage(failure)}`)
    }
  }

  function renderMonthControls() {
    return (
      <div className="flex items-center justify-between gap-3">
        <Button
          aria-label="Mois précédent"
          className="min-h-12 min-w-12"
          disabled={isEditing}
          onClick={() => setMonth((value) => shiftMonth(value, -1))}
          size="icon"
          variant="outline"
        >
          <ArrowLeft aria-hidden="true" size={18} />
        </Button>
        <p aria-live="polite" className="text-center font-semibold">
          {formatMonth(month)}
        </p>
        <Button
          aria-label="Mois suivant"
          className="min-h-12 min-w-12"
          disabled={isEditing || month >= currentMonth}
          onClick={() => setMonth((value) => shiftMonth(value, 1))}
          size="icon"
          variant="outline"
        >
          <ArrowRight aria-hidden="true" size={18} />
        </Button>
      </div>
    )
  }

  function renderBudgetCard(item: (typeof summary.categories)[number]) {
    const isOverBudget = item.isOverBudget
    return (
      <article className="rounded-2xl border border-stone-200 bg-white p-4" key={item.categoryId}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold">{item.categoryName}</h3>
            <p className="mt-1 text-sm text-stone-600">
              Dépensé : {formatMoney(item.spentAmount, currency)}
              {item.budgetAmount !== null && ` sur ${formatMoney(item.budgetAmount, currency)}`}
            </p>
          </div>
          {canEdit && item.budgetAmount !== null && (
            <Button
              aria-label={`Modifier le plafond ${item.categoryName}`}
              className="min-h-11"
              onClick={() => {
                const budget = monthBudgets.find(
                  (candidate) => candidate.category_id === item.categoryId,
                )
                if (budget) startEditingBudget(budget)
              }}
              size="sm"
              variant="outline"
            >
              <Pencil aria-hidden="true" size={15} />
              Modifier
            </Button>
          )}
        </div>
        {item.budgetAmount === null ? (
          <p className="mt-3 text-sm text-stone-500">Aucun plafond défini</p>
        ) : (
          <>
            <div
              aria-label={`Progression du budget ${item.categoryName}`}
              aria-valuemax={100}
              aria-valuemin={0}
              aria-valuenow={Math.round(item.progressPercentage)}
              className="mt-4 h-2.5 overflow-hidden rounded-full bg-stone-100"
              role="progressbar"
            >
              <div
                className={`h-full rounded-full ${isOverBudget ? 'bg-red-600' : 'bg-emerald-700'}`}
                style={{ width: `${item.progressPercentage}%` }}
              />
            </div>
            <div className="mt-2 flex flex-wrap justify-between gap-2 text-sm">
              <span className={isOverBudget ? 'font-semibold text-red-700' : 'text-stone-600'}>
                {isOverBudget ? 'Plafond dépassé' : 'Reste'}
                {': '}
                {formatMoney(Math.abs(item.remainingAmount ?? 0), currency)}
              </span>
              <span className={isOverBudget ? 'font-semibold text-red-700' : 'text-stone-600'}>
                {Math.round((item.spentAmount / item.budgetAmount) * 100)} %
              </span>
            </div>
          </>
        )}
      </article>
    )
  }

  if (mode === 'home') {
    return (
      <section aria-label="Budget du mois" className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card className="rounded-2xl border-0 shadow-sm ring-stone-200">
          <CardHeader>
            <CardTitle>Reste à dépenser · {formatMonth(month)}</CardTitle>
            <CardDescription>
              {summary.totalBudgeted === 0
                ? 'Définis des plafonds mensuels pour suivre ton budget.'
                : `Dépensé ${formatMoney(summary.totalSpent, currency)} sur ${formatMoney(summary.totalBudgeted, currency)}.`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p
              className={`text-3xl font-bold tracking-tight ${
                summary.remaining < 0 ? 'text-red-700' : 'text-emerald-900'
              }`}
            >
              {formatMoney(summary.remaining, currency)}
            </p>
            {isCurrentMonth && summary.totalBudgeted > 0 && (
              <p className="mt-2 text-sm text-stone-600">
                Environ {formatMoney(Math.round(summary.remainingPerDay), currency)} par jour ·{' '}
                {summary.daysRemaining} jours restants
              </p>
            )}
            <Button className="mt-4 min-h-11" onClick={onOpenBudgets} variant="outline">
              Gérer les budgets
            </Button>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-0 shadow-sm ring-stone-200">
          <CardHeader>
            <CardTitle>Catégories les plus consommées</CardTitle>
            <CardDescription>Les dépenses du mois, calculées sur cet appareil.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {consumedCategories.length === 0 ? (
              <p className="text-sm text-stone-500">Aucune dépense enregistrée ce mois-ci.</p>
            ) : (
              consumedCategories.map((item) => (
                <div
                  className="flex items-center justify-between gap-3 text-sm"
                  key={item.categoryId}
                >
                  <span className="truncate text-stone-600">{item.categoryName}</span>
                  <span className="shrink-0 font-semibold">
                    {formatMoney(item.spentAmount, currency)}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </section>
    )
  }

  return (
    <section aria-label="Budgets mensuels" className="max-w-4xl">
      <div className="mb-6">
        <p className="mb-2 text-sm font-medium text-emerald-800">Espace personnel</p>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Budgets mensuels</h1>
        <p className="mt-3 max-w-2xl leading-7 text-stone-600">
          Les plafonds et les dépenses sont enregistrés localement et restent disponibles
          hors-ligne.
        </p>
      </div>

      <Card className="rounded-2xl border-0 shadow-sm ring-stone-200">
        <CardHeader className="gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>{formatMonth(month)}</CardTitle>
            <CardDescription>Vue d’ensemble des plafonds et dépenses.</CardDescription>
          </div>
          {renderMonthControls()}
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl bg-stone-50 p-4">
            <p className="text-sm text-stone-600">Budget total</p>
            <p className="mt-1 text-xl font-bold">{formatMoney(summary.totalBudgeted, currency)}</p>
          </div>
          <div className="rounded-xl bg-stone-50 p-4">
            <p className="text-sm text-stone-600">Dépensé</p>
            <p className="mt-1 text-xl font-bold">{formatMoney(summary.totalSpent, currency)}</p>
          </div>
          <div
            className={`rounded-xl p-4 ${
              summary.remaining < 0 ? 'bg-red-50 text-red-900' : 'bg-emerald-50 text-emerald-950'
            }`}
          >
            <p className="text-sm">Reste à dépenser</p>
            <p className="mt-1 text-xl font-bold">{formatMoney(summary.remaining, currency)}</p>
          </div>
        </CardContent>
      </Card>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">Plafonds par catégorie</h2>
        {canEdit && (
          <Button
            className="min-h-12"
            disabled={availableCategoryIds.length === 0}
            onClick={startNewBudget}
          >
            <Plus aria-hidden="true" size={18} />
            Ajouter un plafond
          </Button>
        )}
      </div>

      {notice && (
        <p
          className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
          role="status"
        >
          {notice}
        </p>
      )}

      {isEditing && canEdit && (
        <Card className="mt-4 rounded-2xl border-0 shadow-sm ring-stone-200">
          <CardHeader>
            <CardTitle>{editingBudgetId ? 'Modifier un plafond' : 'Nouveau plafond'}</CardTitle>
            <CardDescription>{formatMonth(month)} · sauvegarde hors-ligne</CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="grid gap-4 sm:grid-cols-2"
              onSubmit={(event) => void saveBudget(event)}
            >
              <div>
                <label className="mb-1.5 block text-sm font-medium" htmlFor="budget-category">
                  Catégorie de dépense
                </label>
                <select
                  className="min-h-12 w-full rounded-xl border border-stone-300 bg-white px-3"
                  id="budget-category"
                  onChange={(event) => setCategoryId(event.target.value)}
                  required
                  value={categoryId}
                >
                  {formCategories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                      {category.archived_at !== null ? ' (archivée)' : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium" htmlFor="budget-amount">
                  Plafond mensuel ({currency})
                </label>
                <input
                  className="min-h-12 w-full rounded-xl border border-stone-300 px-3"
                  id="budget-amount"
                  inputMode="numeric"
                  min="1"
                  onChange={(event) => setLimitAmount(event.target.value)}
                  required
                  step="1"
                  type="number"
                  value={limitAmount}
                />
              </div>
              {formError && (
                <p className="text-sm text-red-700 sm:col-span-2" role="alert">
                  {formError}
                </p>
              )}
              <div className="flex flex-wrap gap-2 sm:col-span-2">
                <Button className="min-h-12" type="submit">
                  Enregistrer le plafond
                </Button>
                <Button
                  className="min-h-12"
                  onClick={() => setIsEditing(false)}
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

      {expenseCategories.length === 0 ? (
        <p className="mt-4 rounded-xl bg-stone-100 px-4 py-3 text-sm text-stone-600">
          Ajoute d’abord une catégorie de dépense pour définir un plafond.
        </p>
      ) : null}

      <div className="mt-4 grid gap-3">
        {activeBudgetCategories.map(renderBudgetCard)}
        {activeBudgetCategories.length === 0 && !isEditing && (
          <p className="rounded-xl bg-stone-100 px-4 py-3 text-sm text-stone-600">
            Aucun plafond pour ce mois. Ajoute un plafond par catégorie pour commencer.
          </p>
        )}
      </div>

      {consumedCategories.some((item) => item.budgetAmount === null) && (
        <Card className="mt-6 rounded-2xl border-0 shadow-sm ring-stone-200">
          <CardHeader>
            <CardTitle>Dépenses sans plafond</CardTitle>
            <CardDescription>
              Elles sont incluses dans le reste global, mais ne disposent pas encore d’une limite.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {consumedCategories.filter((item) => item.budgetAmount === null).map(renderBudgetCard)}
          </CardContent>
        </Card>
      )}
    </section>
  )
}
