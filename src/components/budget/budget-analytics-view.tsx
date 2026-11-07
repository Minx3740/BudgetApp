import { ChevronDown } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  isMobileAnalyticsViewport,
  loadAnalyticsChartVisibility,
  saveAnalyticsChartVisibility,
  type AnalyticsChartId,
  type AnalyticsChartVisibility,
} from '@/data/analytics-preferences'
import {
  calculateAnalyticsIndicators,
  calculateCategoryMonthComparison,
  calculateCategorySpending,
  calculateDailyExpenseCumulative,
  calculateSixMonthCashflow,
  type AnalyticsIndicators,
} from '@/data/analytics'
import type { Budget, CashflowTransaction, Category, Profile } from '@/data/models'
import { calculateThresholdStatuses, type ThresholdStatus } from '@/data/thresholds'

interface BudgetAnalyticsViewProps {
  month: string
  categories: Category[]
  budgets: Budget[]
  monthlyResources: number | null
  transactions: CashflowTransaction[]
  isSharedWorkspace: boolean
  profiles: Pick<Profile, 'id' | 'display_name'>[]
}

const chartWidth = 360
const chartColors = {
  current: 'var(--chart-4)',
  previous: 'var(--chart-2)',
  income: 'var(--chart-3)',
  expense: 'var(--chart-5)',
  grid: 'var(--border)',
  text: 'var(--muted-foreground)',
}

interface AnalyticsChartCardProps {
  chartId: AnalyticsChartId
  title: string
  summary: string
  expanded: boolean
  onToggle: () => void
  children: ReactNode
}

function AnalyticsChartCard({
  chartId,
  title,
  summary,
  expanded,
  onToggle,
  children,
}: AnalyticsChartCardProps) {
  return (
    <Card className="rounded-2xl border-0 shadow-sm ring-stone-200">
      <CardHeader className="pb-3">
        <button
          aria-controls={`analytics-chart-${chartId}`}
          aria-expanded={expanded}
          className="flex min-h-11 w-full items-center justify-between gap-3 text-left"
          onClick={onToggle}
          type="button"
        >
          <span className="min-w-0">
            <span className="block font-semibold">{title}</span>
            <span className="mt-1 block text-sm font-normal text-muted-foreground">{summary}</span>
          </span>
          <ChevronDown
            aria-hidden="true"
            className={`size-5 shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`}
          />
        </button>
      </CardHeader>
      <div hidden={!expanded} id={`analytics-chart-${chartId}`}>
        {expanded ? children : null}
      </div>
    </Card>
  )
}

function ExpenseCompositionChart({
  indicators,
  expanded,
  onToggle,
}: {
  indicators: AnalyticsIndicators
  expanded: boolean
  onToggle: () => void
}) {
  return (
    <AnalyticsChartCard
      chartId="expenseComposition"
      expanded={expanded}
      onToggle={onToggle}
      summary={`${formatMoney(indicators.netExpenses)} dépensés`}
      title="Répartition des dépenses"
    >
      <CardContent>
        <p className="mb-3 text-sm text-muted-foreground">
          Les forfaits sont fixes ; les autres dépenses et remboursements sont variables.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-emerald-50 p-4">
            <p className="text-sm text-emerald-900">Dépenses fixes</p>
            <p className="mt-1 text-lg font-bold">{formatMoney(indicators.fixedExpenses)}</p>
            <p className="mt-1 text-xs text-emerald-900">
              {indicators.fixedSharePercent === null
                ? 'Part non disponible'
                : `${indicators.fixedSharePercent} %`}
            </p>
          </div>
          <div className="rounded-xl bg-stone-50 p-4">
            <p className="text-sm text-stone-700">Dépenses variables nettes</p>
            <p className="mt-1 text-lg font-bold">{formatMoney(indicators.variableExpenses)}</p>
            <p className="mt-1 text-xs text-stone-600">
              {indicators.variableSharePercent === null
                ? 'Part non disponible'
                : `${indicators.variableSharePercent} %`}
            </p>
          </div>
          <div className="rounded-xl bg-amber-50 p-4">
            <p className="text-sm text-amber-950">Non classé · net</p>
            <p className="mt-1 text-lg font-bold">
              {formatMoney(indicators.uncategorizedExpenses)}
            </p>
            <p className="mt-1 text-xs text-amber-950">
              {indicators.uncategorizedSharePercent === null
                ? 'Part non disponible'
                : `${indicators.uncategorizedSharePercent} %`}
            </p>
          </div>
        </div>
      </CardContent>
    </AnalyticsChartCard>
  )
}

function formatMoney(amount: number): string {
  return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(amount)} Ar`
}

function formatMonthShort(month: string): string {
  return new Intl.DateTimeFormat('fr-FR', { month: 'short', timeZone: 'UTC' })
    .format(new Date(`${month}T00:00:00.000Z`))
    .replace('.', '')
    .concat(
      ` ${new Intl.DateTimeFormat('fr-FR', { year: '2-digit', timeZone: 'UTC' }).format(
        new Date(`${month}T00:00:00.000Z`),
      )}`,
    )
}

function formatMonthLabel(month: string): string {
  const label = new Intl.DateTimeFormat('fr-FR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${month}T00:00:00.000Z`))
  return `${label.charAt(0).toLocaleUpperCase('fr-FR')}${label.slice(1)}`
}

function clampLabel(value: string, length = 18): string {
  return value.length > length ? `${value.slice(0, length - 1)}…` : value
}

function accessibleList(items: string[]) {
  return (
    <details className="mt-3 text-sm">
      <summary className="min-h-11 cursor-pointer py-2 font-medium text-primary">
        Voir les valeurs en texte
      </summary>
      <ul className="space-y-1 pb-2 pl-5 text-muted-foreground">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </details>
  )
}

function scalePosition(value: number, min: number, max: number, width: number): number {
  if (max === min) return width / 2
  return ((value - min) / (max - min)) * width
}

function CategorySpendingChart({
  month,
  categories,
  budgets,
  transactions,
  expanded,
  onToggle,
}: Pick<BudgetAnalyticsViewProps, 'month' | 'categories' | 'budgets' | 'transactions'> & {
  expanded: boolean
  onToggle: () => void
}) {
  const values = calculateCategorySpending(month, categories, budgets, transactions)
  const chartHeight = Math.max(84, values.length * 34 + 24)
  const plotLeft = 120
  const plotWidth = chartWidth - plotLeft - 16
  const maximum = Math.max(0, ...values.flatMap((item) => [item.amount, item.threshold ?? 0]))
  const minimum = Math.min(0, ...values.map((item) => item.amount))
  const zeroX = plotLeft + scalePosition(0, minimum, maximum, plotWidth)

  return (
    <AnalyticsChartCard
      chartId="categorySpending"
      expanded={expanded}
      onToggle={onToggle}
      summary={`${formatMoney(values.reduce((total, item) => total + item.amount, 0))} dépensés`}
      title="Où va l’argent ?"
    >
      <CardContent>
        {values.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune dépense enregistrée ce mois-ci.</p>
        ) : (
          <>
            <svg
              aria-hidden="true"
              className="h-auto w-full"
              preserveAspectRatio="xMidYMin meet"
              viewBox={`0 0 ${chartWidth} ${chartHeight}`}
            >
              <line
                stroke={chartColors.grid}
                strokeWidth="1"
                x1={zeroX}
                x2={zeroX}
                y1="8"
                y2={chartHeight - 8}
              />
              {values.map((item, index) => {
                const y = 14 + index * 34
                const amountX = plotLeft + scalePosition(item.amount, minimum, maximum, plotWidth)
                const left = Math.min(zeroX, amountX)
                const width = Math.max(1, Math.abs(amountX - zeroX))
                const thresholdX =
                  item.threshold === null
                    ? null
                    : plotLeft + scalePosition(item.threshold, minimum, maximum, plotWidth)
                return (
                  <g key={item.categoryId ?? 'uncategorized'}>
                    <text
                      fill={chartColors.text}
                      fontSize="12"
                      textAnchor="end"
                      x={plotLeft - 10}
                      y={y + 13}
                    >
                      {clampLabel(item.name)}
                    </text>
                    <rect
                      fill={item.color ?? 'var(--category-uncategorized)'}
                      height="16"
                      rx="5"
                      width={width}
                      x={left}
                      y={y}
                    />
                    {thresholdX !== null && (
                      <line
                        stroke={chartColors.expense}
                        strokeDasharray="3 3"
                        strokeWidth="2"
                        x1={thresholdX}
                        x2={thresholdX}
                        y1={y - 2}
                        y2={y + 18}
                      />
                    )}
                  </g>
                )
              })}
            </svg>
            <p className="mt-2 text-xs text-muted-foreground">
              <span
                aria-hidden="true"
                className="mr-1 inline-block h-2 w-2 rounded-sm bg-chart-4"
              />
              Dépenses nettes
              <span
                aria-hidden="true"
                className="ml-4 mr-1 inline-block h-3 border-l-2 border-dashed border-chart-5 align-middle"
              />
              Seuil
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Les dépenses réelles incluent les forfaits ; forfaits et ajustements sont exclus des
              seuils.
            </p>
            {accessibleList(
              values.map(
                (item) =>
                  `${item.name} : dépenses réelles ${formatMoney(item.amount)}, pris en compte au seuil ${formatMoney(item.thresholdSpentAmount)}${
                    item.threshold === null ? '' : ` sur un seuil de ${formatMoney(item.threshold)}`
                  }`,
              ),
            )}
          </>
        )}
      </CardContent>
    </AnalyticsChartCard>
  )
}

function CategoryComparisonChart({
  month,
  categories,
  transactions,
  expanded,
  onToggle,
}: Pick<BudgetAnalyticsViewProps, 'month' | 'categories' | 'transactions'> & {
  expanded: boolean
  onToggle: () => void
}) {
  const values = calculateCategoryMonthComparison(month, categories, transactions)
  const chartHeight = Math.max(84, values.length * 40 + 24)
  const plotLeft = 120
  const plotWidth = chartWidth - plotLeft - 16
  const maximum = Math.max(
    0,
    ...values.flatMap((item) => [item.currentAmount, item.previousAmount]),
  )
  const minimum = Math.min(
    0,
    ...values.flatMap((item) => [item.currentAmount, item.previousAmount]),
  )
  const zeroX = plotLeft + scalePosition(0, minimum, maximum, plotWidth)

  return (
    <AnalyticsChartCard
      chartId="categoryComparison"
      expanded={expanded}
      onToggle={onToggle}
      summary={`${formatMoney(values.reduce((total, item) => total + item.currentAmount, 0))} ce mois`}
      title="Mieux ou pire que le mois dernier ?"
    >
      <CardContent>
        {values.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune dépense à comparer.</p>
        ) : (
          <>
            <svg
              aria-hidden="true"
              className="h-auto w-full"
              preserveAspectRatio="xMidYMin meet"
              viewBox={`0 0 ${chartWidth} ${chartHeight}`}
            >
              <line
                stroke={chartColors.grid}
                strokeWidth="1"
                x1={zeroX}
                x2={zeroX}
                y1="8"
                y2={chartHeight - 8}
              />
              {values.map((item, index) => {
                const y = 10 + index * 40
                const previousX =
                  plotLeft + scalePosition(item.previousAmount, minimum, maximum, plotWidth)
                const currentX =
                  plotLeft + scalePosition(item.currentAmount, minimum, maximum, plotWidth)
                return (
                  <g key={item.categoryId ?? 'uncategorized'}>
                    <text
                      fill={chartColors.text}
                      fontSize="12"
                      textAnchor="end"
                      x={plotLeft - 10}
                      y={y + 13}
                    >
                      {clampLabel(item.name)}
                    </text>
                    <rect
                      fill={chartColors.previous}
                      height="9"
                      rx="3"
                      width={Math.max(1, Math.abs(previousX - zeroX))}
                      x={Math.min(previousX, zeroX)}
                      y={y}
                    />
                    <rect
                      fill={chartColors.current}
                      height="9"
                      rx="3"
                      width={Math.max(1, Math.abs(currentX - zeroX))}
                      x={Math.min(currentX, zeroX)}
                      y={y + 13}
                    />
                  </g>
                )
              })}
            </svg>
            <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>
                <span
                  aria-hidden="true"
                  className="mr-1 inline-block h-2 w-2 rounded-sm bg-chart-2"
                />
                Mois précédent
              </span>
              <span>
                <span
                  aria-hidden="true"
                  className="mr-1 inline-block h-2 w-2 rounded-sm bg-chart-4"
                />
                Mois sélectionné
              </span>
            </p>
            {accessibleList(
              values.map(
                (item) =>
                  `${item.name} : ${formatMoney(item.currentAmount)} ce mois, ${formatMoney(
                    item.previousAmount,
                  )} le mois précédent`,
              ),
            )}
          </>
        )}
      </CardContent>
    </AnalyticsChartCard>
  )
}

function DailyCumulativeChart({
  month,
  monthlyResources,
  budgets,
  transactions,
  expanded,
  onToggle,
}: Pick<BudgetAnalyticsViewProps, 'month' | 'monthlyResources' | 'budgets' | 'transactions'> & {
  expanded: boolean
  onToggle: () => void
}) {
  const values = calculateDailyExpenseCumulative(month, transactions)
  const dayThreshold = calculateThresholdStatuses(month, budgets, [], transactions).find(
    (item) => item.enabled && item.period === 'day' && item.amount > 0,
  )
  const plot = { left: 72, top: 14, width: chartWidth - 84, height: 178 }
  const minimum = Math.min(0, monthlyResources ?? 0, ...values.map((item) => item.cumulativeAmount))
  const maximum = Math.max(0, monthlyResources ?? 0, ...values.map((item) => item.cumulativeAmount))
  const range = maximum - minimum || 1
  const y = (amount: number) => plot.top + ((maximum - amount) / range) * plot.height
  const points = values
    .map(
      (item, index) =>
        `${plot.left + (index / Math.max(1, values.length - 1)) * plot.width},${y(item.cumulativeAmount)}`,
    )
    .join(' ')
  const thresholdY = dayThreshold ? y(dayThreshold.amount) : null
  const daysAboveThreshold =
    dayThreshold === undefined
      ? 0
      : values.reduce((count, item) => {
          return count + Number(item.cumulativeAmount > dayThreshold.amount)
        }, 0)

  return (
    <AnalyticsChartCard
      chartId="dailyCumulative"
      expanded={expanded}
      onToggle={onToggle}
      summary={`${formatMoney(values.at(-1)?.cumulativeAmount ?? 0)} dépensés`}
      title="Suis-je dans le budget ?"
    >
      <CardContent>
        <svg
          aria-hidden="true"
          className="h-auto w-full"
          preserveAspectRatio="xMidYMin meet"
          viewBox={`0 0 ${chartWidth} 232`}
        >
          {[0, 0.5, 1].map((ratio) => {
            const value = minimum + range * ratio
            const lineY = y(value)
            return (
              <g key={ratio}>
                <line
                  stroke={chartColors.grid}
                  strokeWidth="1"
                  x1={plot.left}
                  x2={plot.left + plot.width}
                  y1={lineY}
                  y2={lineY}
                />
                <text fill={chartColors.text} fontSize="11" x="2" y={lineY + 4}>
                  {formatMoney(Math.round(value))}
                </text>
              </g>
            )
          })}
          {monthlyResources !== null && (
            <line
              stroke={chartColors.expense}
              strokeDasharray="5 4"
              strokeWidth="2"
              x1={plot.left}
              x2={plot.left + plot.width}
              y1={y(monthlyResources)}
              y2={y(monthlyResources)}
            />
          )}
          {thresholdY !== null && (
            <line
              stroke="var(--chart-5)"
              strokeDasharray="4 4"
              strokeWidth="2"
              x1={plot.left}
              x2={plot.left + plot.width}
              y1={thresholdY}
              y2={thresholdY}
            />
          )}
          <polyline
            fill="none"
            points={points}
            stroke={chartColors.current}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="3"
          />
          <text fill={chartColors.text} fontSize="11" x={plot.left} y="218">
            1
          </text>
          <text
            fill={chartColors.text}
            fontSize="11"
            textAnchor="middle"
            x={plot.left + plot.width / 2}
            y="218"
          >
            {Math.ceil(values.length / 2)}
          </text>
          <text
            fill={chartColors.text}
            fontSize="11"
            textAnchor="end"
            x={plot.left + plot.width}
            y="218"
          >
            {values.length}
          </text>
        </svg>
        <p className="mt-2 text-xs text-muted-foreground">
          Ligne pleine : dépenses nettes cumulées.
          {monthlyResources !== null ? ' Ligne pointillée : ressources du mois.' : ''}
          {dayThreshold ? ` Ligne en pointillés de seuil : ${formatMoney(dayThreshold.amount)}.` : ''}
        </p>
        {dayThreshold && (
          <p className="mt-2 text-sm font-medium text-foreground">
            {daysAboveThreshold} jour{daysAboveThreshold > 1 ? 's' : ''} au-dessus du seuil ce mois
          </p>
        )}
        {accessibleList(
          values.map((item) => `Jour ${item.day} : ${formatMoney(item.cumulativeAmount)} cumulés`),
        )}
      </CardContent>
    </AnalyticsChartCard>
  )
}

function SixMonthCashflowChart({
  month,
  transactions,
  expanded,
  onToggle,
}: Pick<BudgetAnalyticsViewProps, 'month' | 'transactions'> & {
  expanded: boolean
  onToggle: () => void
}) {
  const values = calculateSixMonthCashflow(month, transactions)
  const plot = { left: 72, top: 14, width: chartWidth - 84, height: 178 }
  const minimum = Math.min(0, ...values.flatMap((item) => [item.income, item.netExpenses]))
  const maximum = Math.max(0, ...values.flatMap((item) => [item.income, item.netExpenses]))
  const range = maximum - minimum || 1
  const x = (index: number) => plot.left + (index / Math.max(1, values.length - 1)) * plot.width
  const y = (amount: number) => plot.top + ((maximum - amount) / range) * plot.height
  const incomePoints = values.map((item, index) => `${x(index)},${y(item.income)}`).join(' ')
  const expensePoints = values.map((item, index) => `${x(index)},${y(item.netExpenses)}`).join(' ')

  return (
    <AnalyticsChartCard
      chartId="sixMonthCashflow"
      expanded={expanded}
      onToggle={onToggle}
      summary={formatMoney(
        values.reduce((total, item) => total + item.income - item.netExpenses, 0),
      )}
      title="Sur la durée"
    >
      <CardContent>
        <svg
          aria-hidden="true"
          className="h-auto w-full"
          preserveAspectRatio="xMidYMin meet"
          viewBox={`0 0 ${chartWidth} 232`}
        >
          {[0, 0.5, 1].map((ratio) => {
            const value = minimum + range * ratio
            const lineY = y(value)
            return (
              <g key={ratio}>
                <line
                  stroke={chartColors.grid}
                  strokeWidth="1"
                  x1={plot.left}
                  x2={plot.left + plot.width}
                  y1={lineY}
                  y2={lineY}
                />
                <text fill={chartColors.text} fontSize="11" x="2" y={lineY + 4}>
                  {formatMoney(Math.round(value))}
                </text>
              </g>
            )
          })}
          <polyline
            fill="none"
            points={incomePoints}
            stroke={chartColors.income}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="3"
          />
          <polyline
            fill="none"
            points={expensePoints}
            stroke={chartColors.expense}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="3"
          />
          {values.map((item, index) => (
            <text
              fill={chartColors.text}
              fontSize="11"
              key={item.month}
              textAnchor="middle"
              x={x(index)}
              y="218"
            >
              {formatMonthShort(item.month)}
            </text>
          ))}
        </svg>
        <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>
            <span
              aria-hidden="true"
              className="mr-1 inline-block h-0.5 w-3 bg-chart-3 align-middle"
            />
            Revenus
          </span>
          <span>
            <span
              aria-hidden="true"
              className="mr-1 inline-block h-0.5 w-3 bg-chart-5 align-middle"
            />
            Dépenses nettes
          </span>
        </p>
        {accessibleList(
          values.map(
            (item) =>
              `${formatMonthLabel(item.month)} : revenus ${formatMoney(item.income)}, dépenses nettes ${formatMoney(item.netExpenses)}`,
          ),
        )}
      </CardContent>
    </AnalyticsChartCard>
  )
}

export function BudgetAnalyticsView({
  month,
  categories,
  budgets,
  monthlyResources,
  transactions,
  isSharedWorkspace,
  profiles,
}: BudgetAnalyticsViewProps) {
  const indicators = useMemo(
    () =>
      calculateAnalyticsIndicators(
        month,
        budgets,
        categories,
        transactions,
        isSharedWorkspace,
        profiles,
      ),
    [budgets, categories, isSharedWorkspace, month, profiles, transactions],
  )
  const [chartVisibility, setChartVisibility] = useState<AnalyticsChartVisibility>(() =>
    loadAnalyticsChartVisibility(isMobileAnalyticsViewport()),
  )

  useEffect(() => {
    saveAnalyticsChartVisibility(chartVisibility)
  }, [chartVisibility])

  function toggleChart(chartId: AnalyticsChartId) {
    setChartVisibility((current) => ({ ...current, [chartId]: !current[chartId] }))
  }

  const thresholdStatuses = useMemo(
    () =>
      calculateThresholdStatuses(month, budgets, categories, transactions).filter(
        (item) => item.enabled && item.amount > 0,
      ),
    [budgets, categories, month, transactions],
  )

  const thresholdSections = useMemo(() => {
    const ordered = [...thresholdStatuses].sort((left, right) => {
      const severityDelta =
        Number(right.isOverThreshold) - Number(left.isOverThreshold) ||
        Number(right.isNearThreshold) - Number(left.isNearThreshold) ||
        right.progressPercentage - left.progressPercentage
      if (severityDelta !== 0) return severityDelta
      const periodOrder = ['day', 'week', 'month']
      return (
        periodOrder.indexOf(left.period) - periodOrder.indexOf(right.period) ||
        left.label.localeCompare(right.label, 'fr')
      )
    })

    return {
      day: ordered.filter((item) => item.period === 'day'),
      week: ordered.filter((item) => item.period === 'week'),
      month: ordered.filter((item) => item.period === 'month' && item.categoryId !== null),
      all: ordered,
    }
  }, [thresholdStatuses])

  const daysAboveDailyThreshold = useMemo(() => {
    const dayThreshold = thresholdSections.day[0]
    if (!dayThreshold) return 0

    const dailyTotals = new Map<number, number>()
    for (const transaction of transactions) {
      if (
        transaction.deleted_at !== null ||
        transaction.recurring_id !== null ||
        (transaction.kind !== 'expense' && transaction.kind !== 'refund') ||
        !transaction.occurred_on.startsWith(`${month.slice(0, 7)}-`)
      ) {
        continue
      }
      const day = Number(transaction.occurred_on.slice(8, 10))
      const amount = transaction.kind === 'expense' ? transaction.amount : -transaction.amount
      dailyTotals.set(day, (dailyTotals.get(day) ?? 0) + amount)
    }
    return [...dailyTotals.values()].filter((amount) => amount > dayThreshold.amount).length
  }, [month, thresholdSections.day, transactions])

  function renderThresholdItem(item: ThresholdStatus) {
    const statusLabel = item.isOverThreshold ? 'Dépassé' : item.isNearThreshold ? 'Alerte' : 'Sous le seuil'
    const remaining = Math.max(0, item.remainingAmount)
    return (
      <div key={item.budgetId} className="rounded-xl border border-border bg-muted/35 p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-foreground">
              {item.period === 'day'
                ? 'Aujourd’hui'
                : item.period === 'week'
                  ? 'Cette semaine'
                  : item.label}
            </p>
            <p className="text-xs text-muted-foreground">
              {item.period === 'month' ? `${item.label}` : `${formatMoney(item.spentAmount)} / ${formatMoney(item.amount)}`}
            </p>
          </div>
          <span
            className={`rounded-full px-2 py-1 text-[10px] font-semibold ${
              item.isOverThreshold
                ? 'bg-red-100 text-red-700'
                : item.isNearThreshold
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-emerald-100 text-emerald-700'
            }`}
          >
            {statusLabel}
          </span>
        </div>
        <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-stone-200">
          <div
            className={`h-full rounded-full ${
              item.isOverThreshold
                ? 'bg-red-500'
                : item.isNearThreshold
                  ? 'bg-amber-500'
                  : 'bg-emerald-500'
            }`}
            style={{ width: `${Math.min(100, Math.max(0, item.progressPercentage))}%` }}
          />
        </div>
        <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>
            {formatMoney(item.spentAmount)} / {formatMoney(item.amount)}
          </span>
          <span>
            {item.isOverThreshold ? 'Reste ' : 'Restant '} {formatMoney(remaining)}
          </span>
        </div>
      </div>
    )
  }

  return (
    <section aria-label={`Analyses du budget de ${formatMonthLabel(month)}`} className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Indicateurs · {formatMonthLabel(month)}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Les remboursements réduisent les dépenses nettes ; les ajustements de solde ne sont pas
          comptés comme des dépenses.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Card className="rounded-2xl border-0 shadow-sm ring-stone-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Seuils</CardTitle>
            <CardDescription>Liste de tous les seuils actifs</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {thresholdSections.all.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Aucun seuil actif pour ce mois. Ajoute un seuil dans{' '}
                <span className="font-medium text-foreground">Budgets &gt; Mois</span>.
              </p>
            ) : (
              <>
                {thresholdSections.day.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      Jour
                    </p>
                    {thresholdSections.day.map(renderThresholdItem)}
                  </div>
                )}
                {thresholdSections.week.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      Semaine
                    </p>
                    {thresholdSections.week.map(renderThresholdItem)}
                  </div>
                )}
                {thresholdSections.month.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      Catégories
                    </p>
                    {thresholdSections.month.map(renderThresholdItem)}
                  </div>
                )}
                {thresholdSections.day.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {daysAboveDailyThreshold} jour{daysAboveDailyThreshold > 1 ? 's' : ''} au-dessus du seuil ce mois.
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {isSharedWorkspace && (
        <Card className="rounded-2xl border-0 shadow-sm ring-stone-200">
          <CardHeader>
            <CardTitle>Dépenses par responsable</CardTitle>
            <CardDescription>
              Montants nets attribués au responsable de chaque transaction.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {indicators.expensesByResponsible.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucune dépense à afficher.</p>
            ) : (
              <ul className="space-y-2">
                {indicators.expensesByResponsible.map((item) => (
                  <li
                    className="flex items-center justify-between gap-3 border-b border-border pb-2 last:border-0"
                    key={item.userId}
                  >
                    <span>{item.name}</span>
                    <strong className="text-right">{formatMoney(item.netExpenses)}</strong>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <CategorySpendingChart
          budgets={budgets}
          categories={categories}
          expanded={chartVisibility.categorySpending}
          month={month}
          onToggle={() => toggleChart('categorySpending')}
          transactions={transactions}
        />
        <ExpenseCompositionChart
          expanded={chartVisibility.expenseComposition}
          indicators={indicators}
          onToggle={() => toggleChart('expenseComposition')}
        />
        <CategoryComparisonChart
          categories={categories}
          expanded={chartVisibility.categoryComparison}
          month={month}
          onToggle={() => toggleChart('categoryComparison')}
          transactions={transactions}
        />
        <DailyCumulativeChart
          budgets={budgets}
          expanded={chartVisibility.dailyCumulative}
          month={month}
          monthlyResources={monthlyResources}
          onToggle={() => toggleChart('dailyCumulative')}
          transactions={transactions}
        />
        <SixMonthCashflowChart
          expanded={chartVisibility.sixMonthCashflow}
          month={month}
          onToggle={() => toggleChart('sixMonthCashflow')}
          transactions={transactions}
        />
      </div>
    </section>
  )
}
