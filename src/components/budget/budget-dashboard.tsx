import { Suspense, lazy, useMemo, useState, type FormEvent } from 'react'
import { Pencil, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  useBudgets,
  useCategories,
  useMonthCarryDecisions,
  useMonthlyBudgets,
  useTransactions,
} from '@/data/hooks'
import { calculateMonthlyBudgetSummary, shiftMonth } from '@/data/calculations'
import {
  calculateExpenseComposition,
  calculateMonthLedger,
  resourceUsagePercentage,
} from '@/data/reform-calculations'
import {
  budgetsRepository,
  monthCarryDecisionsRepository,
  monthlyBudgetsRepository,
} from '@/data/repositories'
import type { Budget, Profile } from '@/data/models'

const LazyBudgetAnalyticsView = lazy(() =>
  import('./budget-analytics-view').then((module) => ({ default: module.BudgetAnalyticsView })),
)

type BudgetDashboardMode = 'home' | 'manage'
type BudgetTab = 'month' | 'analytics'

interface BudgetDashboardProps {
  workspaceId: string | undefined
  month: string
  canManageBudget: boolean
  mode: BudgetDashboardMode
  onOpenBudgets?: () => void
  onOpenAnalyses?: () => void
  isSharedWorkspace?: boolean
  profiles?: Pick<Profile, 'id' | 'display_name'>[]
  initialTab?: BudgetTab
  onTabChange?: (tab: BudgetTab) => void
}

function BudgetViewToggle({
  activeTab,
  onTabChange,
}: {
  activeTab: BudgetTab
  onTabChange: (tab: BudgetTab) => void
}) {
  return (
    <div aria-label="Volets des budgets" className="mb-5 flex gap-2" role="group">
      <Button
        aria-pressed={activeTab === 'month'}
        className="min-h-11"
        onClick={() => onTabChange('month')}
        variant={activeTab === 'month' ? 'default' : 'outline'}
      >
        Mois
      </Button>
      <Button
        aria-pressed={activeTab === 'analytics'}
        className="min-h-11"
        onClick={() => onTabChange('analytics')}
        variant={activeTab === 'analytics' ? 'default' : 'outline'}
      >
        Analyses
      </Button>
    </div>
  )
}

function formatMoney(amount: number): string {
  return `${new Intl.NumberFormat('fr-FR', {
    maximumFractionDigits: 0,
  }).format(amount)} Ar`
}

function formatMonth(month: string): string {
  const label = new Intl.DateTimeFormat('fr-FR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${month}T00:00:00.000Z`))
  return `${label.charAt(0).toLocaleUpperCase('fr-FR')}${label.slice(1)}`
}

function expenseShare(amount: number, total: number): string {
  return total > 0 ? `${Math.round((amount / total) * 100)} %` : 'Part non disponible'
}

function budgetErrorMessage(failure: unknown, item = 'seuil'): string {
  if (failure instanceof Error) {
    if (failure.name === 'ConstraintError') {
      return item === 'enveloppe'
        ? 'Une enveloppe existe déjà pour ce mois. Recharge les données puis modifie-la.'
        : 'Un seuil existe déjà pour cette catégorie et ce mois. Modifie-le depuis sa carte.'
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
  month,
  canManageBudget,
  mode,
  onOpenBudgets,
  onOpenAnalyses,
  isSharedWorkspace = false,
  profiles = [],
  initialTab = 'month',
  onTabChange,
}: BudgetDashboardProps) {
  const [activeBudgetTab, setActiveBudgetTab] = useState<BudgetTab>(initialTab)
  const [isEditing, setIsEditing] = useState(false)
  const [editingBudgetId, setEditingBudgetId] = useState<string | null>(null)
  const [categoryId, setCategoryId] = useState('')
  const [limitAmount, setLimitAmount] = useState('')
  const [isEditingMonthlyBudget, setIsEditingMonthlyBudget] = useState(false)
  const [monthlyBudgetAmount, setMonthlyBudgetAmount] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const budgets = useBudgets(workspaceId)
  const monthlyBudgets = useMonthlyBudgets(workspaceId)
  const carryDecisions = useMonthCarryDecisions(workspaceId)
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
  const ledger = useMemo(() => {
    try {
      return {
        current: calculateMonthLedger(month, monthlyBudgets, transactions, carryDecisions),
        previous: calculateMonthLedger(
          shiftMonth(month, -1),
          monthlyBudgets,
          transactions,
          carryDecisions,
        ),
        composition: calculateExpenseComposition(month, transactions),
        error: null,
      }
    } catch (failure) {
      return {
        current: null,
        previous: null,
        composition: null,
        error: failure instanceof Error ? failure.message : 'Erreur inconnue de calcul.',
      }
    }
  }, [carryDecisions, month, monthlyBudgets, transactions])
  const currentLedger = ledger.current
  const previousLedger = ledger.previous
  const expenseComposition = ledger.composition
  const monthBudgets = budgets.filter(
    (budget) => budget.month === month && budget.deleted_at === null,
  )
  const activeBudgetCategories = summary.categories.filter((item) => item.budgetAmount !== null)
  const monthlyBudget = monthlyBudgets.find(
    (budget) => budget.month === month && budget.deleted_at === null,
  )
  const previousMonth = shiftMonth(month, -1)
  const previousMonthlyBudget = monthlyBudgets.find(
    (budget) => budget.month === previousMonth && budget.deleted_at === null,
  )
  const currentCarryDecision = carryDecisions.find(
    (decision) => decision.month === month && decision.deleted_at === null,
  )
  const previousMonthHasTransactions = transactions.some(
    (transaction) =>
      transaction.deleted_at === null &&
      transaction.occurred_on.startsWith(`${previousMonth.slice(0, 7)}-`),
  )
  const shouldOfferCarry =
    currentCarryDecision === undefined &&
    previousMonthHasTransactions &&
    (previousLedger?.available ?? 0) > 0
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
  const resourceUsage = currentLedger
    ? resourceUsagePercentage(currentLedger.netExpenses, currentLedger.resources)
    : null

  function changeBudgetTab(tab: BudgetTab) {
    setActiveBudgetTab(tab)
    onTabChange?.(tab)
  }
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

    if (!canManageBudget) {
      setFormError('Tu as un accès en lecture seule à cet espace.')
      return
    }
    if (!workspaceId) {
      setFormError('Aucun espace local n’est disponible.')
      return
    }
    const amount = Number(limitAmount)
    if (!Number.isSafeInteger(amount) || amount < 0) {
      setFormError('Le seuil doit être un montant entier positif ou égal à zéro.')
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
      setNotice('Seuil enregistré sur cet appareil.')
    } catch (failure) {
      setFormError(`Impossible d’enregistrer ce seuil. ${budgetErrorMessage(failure)}`)
    }
  }

  function startEditingMonthlyBudget(amount = monthlyBudget?.budget_amount) {
    setMonthlyBudgetAmount(amount === undefined ? '' : String(amount))
    setFormError(null)
    setNotice(null)
    setIsEditingMonthlyBudget(true)
  }

  async function saveMonthlyBudget(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)
    setNotice(null)
    if (!canManageBudget) {
      setFormError('Seul le propriétaire peut modifier l’enveloppe de cet espace.')
      return
    }
    if (!workspaceId) {
      setFormError('Aucun espace local n’est disponible.')
      return
    }
    const amount = Number(monthlyBudgetAmount)
    if (monthlyBudgetAmount.trim() === '' || !Number.isSafeInteger(amount) || amount < 0) {
      setFormError('L’enveloppe doit être un montant entier positif ou égal à zéro.')
      return
    }
    try {
      if (monthlyBudget) {
        await monthlyBudgetsRepository.update(monthlyBudget.id, workspaceId, {
          month,
          budget_amount: amount,
        })
      } else {
        await monthlyBudgetsRepository.create({
          workspace_id: workspaceId,
          month,
          budget_amount: amount,
        })
      }
      setIsEditingMonthlyBudget(false)
      setNotice('Enveloppe mensuelle enregistrée sur cet appareil.')
    } catch (failure) {
      setFormError(
        `Impossible d’enregistrer l’enveloppe. ${budgetErrorMessage(failure, 'enveloppe')}`,
      )
    }
  }

  async function saveCarryDecision(accepted: boolean) {
    setFormError(null)
    setNotice(null)
    if (!canManageBudget) {
      setFormError('Seul le propriétaire peut décider du report.')
      return
    }
    if (!workspaceId) {
      setFormError('Aucun espace local n’est disponible.')
      return
    }
    try {
      await monthCarryDecisionsRepository.create({
        workspace_id: workspaceId,
        month,
        accepted,
      })
      setNotice(
        accepted
          ? 'Le disponible précédent sera reporté.'
          : 'Le disponible précédent ne sera pas reporté.',
      )
    } catch (failure) {
      setFormError(`Impossible d’enregistrer la décision de report. ${budgetErrorMessage(failure)}`)
    }
  }

  function renderBudgetCard(item: (typeof summary.categories)[number]) {
    const isOverBudget = item.isOverBudget
    const isNearThreshold = !isOverBudget && item.progressPercentage >= 80
    const categoryColor =
      categories.find((category) => category.id === item.categoryId)?.color ??
      'var(--category-uncategorized)'
    const statusColor = isOverBudget
      ? 'text-red-700'
      : isNearThreshold
        ? 'text-amber-800'
        : 'text-stone-600'
    return (
      <article className="rounded-2xl border border-stone-200 bg-white p-4" key={item.categoryId}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold">{item.categoryName}</h3>
            <p className="mt-1 text-sm text-stone-600">
              Dépensé : {formatMoney(item.spentAmount)}
              {item.budgetAmount !== null && ` sur ${formatMoney(item.budgetAmount)}`}
            </p>
          </div>
          {canManageBudget && item.budgetAmount !== null && (
            <Button
              aria-label={`Modifier le seuil ${item.categoryName}`}
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
          <p className="mt-3 text-sm text-stone-500">Aucun seuil défini</p>
        ) : (
          <>
            <div
              aria-label={`Progression du seuil ${item.categoryName}`}
              aria-valuemax={100}
              aria-valuemin={0}
              aria-valuenow={Math.round(item.progressPercentage)}
              className="mt-4 h-2.5 overflow-hidden rounded-full bg-stone-100"
              role="progressbar"
            >
              <div
                className="h-full rounded-full"
                style={{
                  backgroundColor: categoryColor,
                  width: `${item.progressPercentage}%`,
                }}
              />
            </div>
            <div className="mt-2 flex flex-wrap justify-between gap-2 text-sm">
              <span className={statusColor}>
                {isOverBudget
                  ? 'Seuil dépassé'
                  : isNearThreshold
                    ? 'Seuil presque atteint'
                    : 'Reste'}
                {': '}
                {formatMoney(Math.abs(item.remainingAmount ?? 0))}
              </span>
              <span className={statusColor}>{Math.round(item.progressPercentage)} %</span>
            </div>
          </>
        )}
      </article>
    )
  }

  if (mode === 'home') {
    return (
      <section aria-label={`Budget de ${formatMonth(month)}`} className="mt-4 space-y-4">
        {ledger.error && (
          <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
            Impossible de calculer le disponible du mois. {ledger.error}
          </p>
        )}
        {currentLedger && (
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="rounded-2xl border-0 shadow-sm ring-stone-200">
              <CardHeader>
                <CardTitle>Disponible · {formatMonth(month)}</CardTitle>
              </CardHeader>
              <CardContent>
                <p
                  className={`text-3xl font-bold tracking-tight ${
                    currentLedger.available < 0 ? 'text-red-700' : 'text-emerald-950'
                  }`}
                >
                  {formatMoney(currentLedger.available)}
                </p>
                {currentLedger.available < 0 && (
                  <p className="mt-1 text-sm font-semibold text-red-700">Déficit</p>
                )}
                {currentCarryDecision?.accepted && (
                  <p className="mt-2 text-sm text-stone-600">
                    Report compris : {formatMoney(currentLedger.carryIn)}
                  </p>
                )}
                {currentCarryDecision && !currentCarryDecision.accepted && (
                  <p className="mt-2 text-sm text-stone-600">Aucun montant reporté ce mois.</p>
                )}

                <p className="mt-4 text-sm text-stone-600">
                  Budget {formatMoney(currentLedger.budgetAmount ?? 0)} · dépensé{' '}
                  {formatMoney(currentLedger.netExpenses)}
                </p>
                {resourceUsage !== null && (
                  <div
                    aria-label={`Dépenses nettes sur ressources : ${Math.round(resourceUsage)} %`}
                    aria-valuemax={100}
                    aria-valuemin={0}
                    aria-valuenow={Math.round(resourceUsage)}
                    className="mt-3 h-3 overflow-hidden rounded-full bg-stone-100"
                    role="progressbar"
                  >
                    <div
                      className={`h-full ${
                        currentLedger.available < 0
                          ? 'bg-red-600'
                          : resourceUsage >= 80
                            ? 'bg-amber-500'
                            : 'bg-emerald-700'
                      }`}
                      style={{ width: `${resourceUsage}%` }}
                    />
                  </div>
                )}
                {currentLedger.budgetAmount === null && (
                  <p className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-950">
                    Aucun budget n’est défini pour ce mois.
                  </p>
                )}
                <Button className="mt-4 min-h-11" onClick={onOpenBudgets} variant="outline">
                  {currentLedger.budgetAmount === null
                    ? 'Définir mon budget'
                    : 'Gérer le budget et les seuils'}
                </Button>
              </CardContent>
            </Card>

            <div className="space-y-4">
              {shouldOfferCarry && previousLedger && (
                <Card className="rounded-2xl border-0 bg-amber-50 shadow-sm ring-amber-200">
                  <CardHeader>
                    <CardTitle>Reporter le disponible précédent ?</CardTitle>
                    <CardDescription className="text-stone-700">
                      Le mois précédent se termine avec un disponible positif de{' '}
                      {formatMoney(previousLedger.available)}. Ce choix ne change pas le budget du
                      mois.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-wrap gap-2">
                    {canManageBudget ? (
                      <>
                        <Button className="min-h-11" onClick={() => void saveCarryDecision(true)}>
                          Reporter ce montant
                        </Button>
                        <Button
                          className="min-h-11"
                          onClick={() => void saveCarryDecision(false)}
                          variant="outline"
                        >
                          Ne pas reporter
                        </Button>
                      </>
                    ) : (
                      <p className="text-sm text-stone-700">
                        Seul le propriétaire peut décider du report.
                      </p>
                    )}
                  </CardContent>
                </Card>
              )}

              <Card className="rounded-2xl border-0 shadow-sm ring-stone-200">
                <CardHeader>
                  <CardTitle>Ce mois</CardTitle>
                  <CardDescription>{formatMonth(month)}</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
                  <div className="rounded-xl bg-stone-50 p-3">
                    <p className="text-sm text-stone-600">Dépenses nettes</p>
                    <p className="mt-1 font-semibold">{formatMoney(currentLedger.netExpenses)}</p>
                  </div>
                  <div className="rounded-xl bg-stone-50 p-3">
                    <p className="text-sm text-stone-600">Revenus</p>
                    <p className="mt-1 font-semibold">{formatMoney(currentLedger.income)}</p>
                  </div>
                  <div className="rounded-xl bg-stone-50 p-3">
                    <p className="text-sm text-stone-600">Ajustements</p>
                    <p className="mt-1 font-semibold">{formatMoney(currentLedger.adjustments)}</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-2xl border-0 shadow-sm ring-stone-200">
                <CardHeader>
                  <CardTitle>Catégories les plus consommées</CardTitle>
                  <CardDescription>
                    Les seuils n’influencent pas l’enveloppe globale.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {consumedCategories.length === 0 ? (
                    <p className="text-sm text-stone-500">
                      Aucune dépense par catégorie enregistrée ce mois-ci.
                    </p>
                  ) : (
                    consumedCategories.map((item) => (
                      <div
                        className="flex items-center justify-between gap-3 text-sm"
                        key={item.categoryId}
                      >
                        <span className="truncate text-stone-600">{item.categoryName}</span>
                        <span className="shrink-0 font-semibold">
                          {formatMoney(item.spentAmount)}
                        </span>
                      </div>
                    ))
                  )}
                  <Button className="min-h-11 w-full" onClick={onOpenAnalyses} variant="outline">
                    Voir les analyses
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
        {formError && (
          <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
            {formError}
          </p>
        )}
        {notice && (
          <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900" role="status">
            {notice}
          </p>
        )}
      </section>
    )
  }

  if (activeBudgetTab === 'analytics') {
    return (
      <section aria-label="Budgets mensuels" className="max-w-4xl">
        <div className="mb-6">
          <p className="mb-2 text-sm font-medium text-emerald-800">Budget de l’espace</p>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Budgets mensuels</h1>
          <p className="mt-3 max-w-2xl leading-7 text-stone-600">
            L’enveloppe globale est distincte des seuils par catégorie. Les données restent
            disponibles hors ligne et se synchronisent lorsque la connexion revient.
          </p>
        </div>
        <BudgetViewToggle activeTab={activeBudgetTab} onTabChange={changeBudgetTab} />
        <Suspense
          fallback={
            <p aria-live="polite" className="py-6 text-sm text-muted-foreground">
              Chargement des analyses…
            </p>
          }
        >
          <LazyBudgetAnalyticsView
            budgets={budgets}
            categories={categories}
            isSharedWorkspace={isSharedWorkspace}
            month={month}
            monthlyResources={currentLedger?.resources ?? null}
            profiles={profiles}
            transactions={transactions}
          />
        </Suspense>
      </section>
    )
  }

  return (
    <section aria-label="Budgets mensuels" className="max-w-4xl">
      <div className="mb-6">
        <p className="mb-2 text-sm font-medium text-emerald-800">Budget de l’espace</p>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Budgets mensuels</h1>
        <p className="mt-3 max-w-2xl leading-7 text-stone-600">
          L’enveloppe globale est distincte des seuils par catégorie. Les données restent
          disponibles hors ligne et se synchronisent lorsque la connexion revient.
        </p>
      </div>

      <BudgetViewToggle activeTab={activeBudgetTab} onTabChange={changeBudgetTab} />

      {ledger.error && (
        <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          Impossible de calculer le solde du mois. {ledger.error}
        </p>
      )}
      <Card className="rounded-2xl border-0 shadow-sm ring-stone-200">
        <CardHeader>
          <div>
            <CardTitle>Budget global · {formatMonth(month)}</CardTitle>
            <CardDescription>
              Montant dont tu disposes pour l’espace et le mois, indépendant des seuils par
              catégorie.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl bg-stone-50 p-4">
            <p className="text-sm text-stone-600">Budget défini</p>
            <p className="mt-1 text-xl font-bold">
              {!currentLedger
                ? 'Indisponible'
                : currentLedger.budgetAmount === null
                  ? 'À définir'
                  : formatMoney(currentLedger.budgetAmount)}
            </p>
          </div>
          <div className="rounded-xl bg-stone-50 p-4">
            <p className="text-sm text-stone-600">Dépenses nettes</p>
            <p className="mt-1 text-xl font-bold">
              {currentLedger ? formatMoney(currentLedger.netExpenses) : 'Indisponible'}
            </p>
          </div>
          <div
            className={`rounded-xl p-4 ${
              currentLedger?.available !== undefined && currentLedger.available < 0
                ? 'bg-red-50 text-red-900'
                : currentLedger
                  ? 'bg-emerald-50 text-emerald-950'
                  : 'bg-stone-50 text-stone-700'
            }`}
          >
            <p className="text-sm">Disponible</p>
            <p className="mt-1 text-xl font-bold">
              {!currentLedger ? 'Indisponible' : formatMoney(currentLedger.available)}
            </p>
          </div>
        </CardContent>
        {canManageBudget && (
          <CardContent className="flex flex-wrap gap-2 pt-0">
            <Button
              className="min-h-11"
              onClick={() => startEditingMonthlyBudget()}
              variant="outline"
            >
              {monthlyBudget ? 'Modifier le budget' : 'Définir le budget'}
            </Button>
            {previousMonthlyBudget && (
              <Button
                className="min-h-11"
                onClick={() => startEditingMonthlyBudget(previousMonthlyBudget.budget_amount)}
                variant="outline"
              >
                Reprendre le budget du mois précédent
              </Button>
            )}
          </CardContent>
        )}
        {isEditingMonthlyBudget && canManageBudget && (
          <CardContent className="border-t border-stone-200 pt-5">
            <form
              className="grid gap-4 sm:grid-cols-[1fr_auto_auto]"
              onSubmit={(event) => void saveMonthlyBudget(event)}
            >
              <div>
                <label className="mb-1.5 block text-sm font-medium" htmlFor="monthly-budget-amount">
                  Budget de {formatMonth(month)} (Ar)
                </label>
                <input
                  className="min-h-12 w-full rounded-xl border border-stone-300 px-3"
                  id="monthly-budget-amount"
                  inputMode="numeric"
                  min="0"
                  onChange={(event) => setMonthlyBudgetAmount(event.target.value)}
                  required
                  step="1"
                  type="number"
                  value={monthlyBudgetAmount}
                />
                <p className="mt-1 text-xs leading-5 text-stone-500">
                  Montant dont tu disposes ce mois, en plus du report.
                </p>
              </div>
              <Button className="min-h-12 self-end" type="submit">
                Enregistrer
              </Button>
              <Button
                className="min-h-12 self-end"
                onClick={() => setIsEditingMonthlyBudget(false)}
                type="button"
                variant="outline"
              >
                Annuler
              </Button>
            </form>
          </CardContent>
        )}
      </Card>

      <Card className="mt-6 rounded-2xl border-0 shadow-sm ring-stone-200">
        <CardHeader>
          <CardTitle>Répartition des dépenses · {formatMonth(month)}</CardTitle>
          <CardDescription>
            Les forfaits sont fixes ; les autres dépenses et remboursements sont variables.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-emerald-50 p-4">
            <p className="text-sm text-emerald-900">Dépenses fixes</p>
            <p className="mt-1 text-lg font-bold">
              {expenseComposition ? formatMoney(expenseComposition.fixedExpenses) : 'Indisponible'}
            </p>
            {expenseComposition ? (
              <p className="mt-1 text-xs text-emerald-900">
                {expenseShare(expenseComposition.fixedExpenses, expenseComposition.netExpenses)}
              </p>
            ) : null}
          </div>
          <div className="rounded-xl bg-stone-50 p-4">
            <p className="text-sm text-stone-700">Dépenses variables nettes</p>
            <p className="mt-1 text-lg font-bold">
              {expenseComposition
                ? formatMoney(expenseComposition.variableExpenses)
                : 'Indisponible'}
            </p>
            {expenseComposition ? (
              <p className="mt-1 text-xs text-stone-600">
                {expenseShare(expenseComposition.variableExpenses, expenseComposition.netExpenses)}
              </p>
            ) : null}
          </div>
          <div className="rounded-xl bg-amber-50 p-4">
            <p className="text-sm text-amber-950">Non classé · net</p>
            <p className="mt-1 text-lg font-bold">
              {expenseComposition
                ? formatMoney(expenseComposition.uncategorizedExpenses)
                : 'Indisponible'}
            </p>
            {expenseComposition ? (
              <p className="mt-1 text-xs text-amber-950">
                {expenseShare(
                  expenseComposition.uncategorizedExpenses,
                  expenseComposition.netExpenses,
                )}
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">Seuils par catégorie</h2>
        {canManageBudget && (activeBudgetCategories.length > 0 || isEditing) && (
          <Button
            className="min-h-12"
            disabled={availableCategoryIds.length === 0}
            onClick={startNewBudget}
          >
            <Plus aria-hidden="true" size={18} />
            Ajouter un seuil
          </Button>
        )}
      </div>

      {activeBudgetCategories.length === 0 && !isEditing && (
        <Card className="mt-4 rounded-2xl border-0 bg-emerald-50 shadow-sm ring-emerald-100">
          <CardHeader>
            <CardTitle>Bien démarrer ce mois</CardTitle>
            <CardDescription className="text-stone-700">
              L’enveloppe globale est définie manuellement. Les seuils sont facultatifs et ne
              modifient pas son montant.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="grid gap-3 text-sm text-stone-700 sm:grid-cols-3">
              <li>
                <span className="mb-1 block font-semibold text-stone-950">1. Fixe l’enveloppe</span>
                Choisis le montant total que tu souhaites dépenser pendant ce mois.
              </li>
              <li>
                <span className="mb-1 block font-semibold text-stone-950">
                  2. Ajoute des seuils
                </span>
                Si tu le souhaites, suis séparément une catégorie comme alimentation.
              </li>
              <li>
                <span className="mb-1 block font-semibold text-stone-950">
                  3. Enregistre tes achats
                </span>
                Toutes les dépenses réduisent l’enveloppe, avec ou sans catégorie.
              </li>
            </ol>
            <p className="mt-4 text-sm leading-6 text-stone-700">
              La somme des seuils peut être différente de l’enveloppe. Il n’y a pas de double
              comptage.
            </p>
            {canManageBudget ? (
              <div className="mt-5 flex flex-wrap gap-2">
                {currentLedger?.budgetAmount === null && (
                  <Button
                    className="min-h-12"
                    onClick={() => startEditingMonthlyBudget()}
                    type="button"
                  >
                    Définir l’enveloppe du mois
                  </Button>
                )}
                {expenseCategories.length > 0 && (
                  <Button
                    className="min-h-12"
                    disabled={availableCategoryIds.length === 0}
                    onClick={startNewBudget}
                    type="button"
                    variant="outline"
                  >
                    <Plus aria-hidden="true" size={18} />
                    Ajouter un seuil
                  </Button>
                )}
              </div>
            ) : (
              <p className="mt-4 text-sm font-medium text-stone-700">
                Tu peux consulter cet espace ; seul son propriétaire peut modifier l’enveloppe et
                les seuils.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {formError && (
        <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          {formError}
        </p>
      )}
      {notice && (
        <p
          className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
          role="status"
        >
          {notice}
        </p>
      )}

      {isEditing && canManageBudget && (
        <Card className="mt-4 rounded-2xl border-0 shadow-sm ring-stone-200">
          <CardHeader>
            <CardTitle>
              {editingBudgetId ? 'Modifier un seuil' : 'Définir un seuil mensuel'}
            </CardTitle>
            <CardDescription>
              {formatMonth(month)} · ce montant sert de repère pour la catégorie et ne modifie pas
              l’enveloppe globale.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              className="grid gap-4 sm:grid-cols-2"
              onSubmit={(event) => void saveBudget(event)}
            >
              <div>
                <label className="mb-1.5 block text-sm font-medium" htmlFor="budget-category">
                  1. Catégorie de dépense
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
                <p className="mt-1.5 text-xs leading-5 text-stone-500">
                  Choisis ce que tu veux suivre séparément, par exemple alimentation ou transport.
                </p>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium" htmlFor="budget-amount">
                  2. Seuil pour le mois (Ar)
                </label>
                <input
                  className="min-h-12 w-full rounded-xl border border-stone-300 px-3"
                  id="budget-amount"
                  inputMode="numeric"
                  min="0"
                  onChange={(event) => setLimitAmount(event.target.value)}
                  required
                  step="1"
                  type="number"
                  value={limitAmount}
                />
                <p className="mt-1.5 text-xs leading-5 text-stone-500">
                  Le seuil peut être égal à zéro. Il n’est jamais ajouté à l’enveloppe globale.
                </p>
              </div>
              {formError && (
                <p className="text-sm text-red-700 sm:col-span-2" role="alert">
                  {formError}
                </p>
              )}
              <div className="flex flex-wrap gap-2 sm:col-span-2">
                <Button className="min-h-12" type="submit">
                  Enregistrer ce seuil
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
          Ajoute d’abord une catégorie de dépense pour définir un seuil.
        </p>
      ) : null}

      <div className="mt-4 grid gap-3">{activeBudgetCategories.map(renderBudgetCard)}</div>

      {consumedCategories.some((item) => item.budgetAmount === null) && (
        <Card className="mt-6 rounded-2xl border-0 shadow-sm ring-stone-200">
          <CardHeader>
            <CardTitle>Dépenses sans seuil</CardTitle>
            <CardDescription>
              Elles sont incluses dans le calcul de l’enveloppe globale, mais n’ont pas de seuil
              individuel.
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
