import { useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  calculateAnalyticsIndicators,
  calculateCategoryMonthComparison,
  calculateCategorySpending,
  calculateDailyExpenseCumulative,
  calculateSixMonthCashflow,
} from '@/data/analytics'
import type { Budget, CashflowTransaction, Category, Profile } from '@/data/models'

interface BudgetAnalyticsViewProps {
  month: string
  categories: Category[]
  budgets: Budget[]
  monthlyBudgetAmount: number | null
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
}: Pick<BudgetAnalyticsViewProps, 'month' | 'categories' | 'budgets' | 'transactions'>) {
  const values = calculateCategorySpending(month, categories, budgets, transactions)
  const chartHeight = Math.max(84, values.length * 34 + 24)
  const plotLeft = 120
  const plotWidth = chartWidth - plotLeft - 16
  const maximum = Math.max(0, ...values.flatMap((item) => [item.amount, item.threshold ?? 0]))
  const minimum = Math.min(0, ...values.map((item) => item.amount))
  const zeroX = plotLeft + scalePosition(0, minimum, maximum, plotWidth)

  return (
    <Card className="rounded-2xl border-0 shadow-sm ring-stone-200">
      <CardHeader>
        <CardTitle>Où va l’argent ?</CardTitle>
        <CardDescription>
          Dépenses nettes par catégorie en {formatMonthLabel(month)} ; le trait pointillé indique le
          seuil défini.
        </CardDescription>
      </CardHeader>
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
            {accessibleList(
              values.map(
                (item) =>
                  `${item.name} : ${formatMoney(item.amount)}${
                    item.threshold === null ? '' : `, seuil ${formatMoney(item.threshold)}`
                  }`,
              ),
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

function CategoryComparisonChart({
  month,
  categories,
  transactions,
}: Pick<BudgetAnalyticsViewProps, 'month' | 'categories' | 'transactions'>) {
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
    <Card className="rounded-2xl border-0 shadow-sm ring-stone-200">
      <CardHeader>
        <CardTitle>Mieux ou pire que le mois dernier ?</CardTitle>
        <CardDescription>
          Dépenses nettes par catégorie : {formatMonthLabel(month)} comparé au mois précédent.
        </CardDescription>
      </CardHeader>
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
    </Card>
  )
}

function DailyCumulativeChart({
  month,
  monthlyBudgetAmount,
  transactions,
}: Pick<BudgetAnalyticsViewProps, 'month' | 'monthlyBudgetAmount' | 'transactions'>) {
  const values = calculateDailyExpenseCumulative(month, transactions)
  const plot = { left: 72, top: 14, width: chartWidth - 84, height: 178 }
  const minimum = Math.min(
    0,
    monthlyBudgetAmount ?? 0,
    ...values.map((item) => item.cumulativeAmount),
  )
  const maximum = Math.max(
    0,
    monthlyBudgetAmount ?? 0,
    ...values.map((item) => item.cumulativeAmount),
  )
  const range = maximum - minimum || 1
  const y = (amount: number) => plot.top + ((maximum - amount) / range) * plot.height
  const points = values
    .map(
      (item, index) =>
        `${plot.left + (index / Math.max(1, values.length - 1)) * plot.width},${y(item.cumulativeAmount)}`,
    )
    .join(' ')

  return (
    <Card className="rounded-2xl border-0 shadow-sm ring-stone-200">
      <CardHeader>
        <CardTitle>Suis-je dans le budget ?</CardTitle>
        <CardDescription>
          Dépenses nettes cumulées par jour en {formatMonthLabel(month)}.
          {monthlyBudgetAmount === null
            ? ' Aucune enveloppe globale n’est définie.'
            : ` L’enveloppe est de ${formatMoney(monthlyBudgetAmount)}.`}
        </CardDescription>
      </CardHeader>
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
          {monthlyBudgetAmount !== null && (
            <line
              stroke={chartColors.expense}
              strokeDasharray="5 4"
              strokeWidth="2"
              x1={plot.left}
              x2={plot.left + plot.width}
              y1={y(monthlyBudgetAmount)}
              y2={y(monthlyBudgetAmount)}
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
          {monthlyBudgetAmount !== null ? ' Ligne pointillée : enveloppe mensuelle.' : ''}
        </p>
        {accessibleList(
          values.map((item) => `Jour ${item.day} : ${formatMoney(item.cumulativeAmount)} cumulés`),
        )}
      </CardContent>
    </Card>
  )
}

function SixMonthCashflowChart({
  month,
  transactions,
}: Pick<BudgetAnalyticsViewProps, 'month' | 'transactions'>) {
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
    <Card className="rounded-2xl border-0 shadow-sm ring-stone-200">
      <CardHeader>
        <CardTitle>Sur la durée</CardTitle>
        <CardDescription>Revenus et dépenses nettes des six derniers mois.</CardDescription>
      </CardHeader>
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
    </Card>
  )
}

export function BudgetAnalyticsView({
  month,
  categories,
  budgets,
  monthlyBudgetAmount,
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
            <CardTitle className="text-base">Fixes et variables</CardTitle>
            <CardDescription>Dépenses nettes du mois</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              Fixes : <strong>{formatMoney(indicators.fixedExpenses)}</strong>
              {indicators.fixedSharePercent === null ? '' : ` · ${indicators.fixedSharePercent} %`}
            </p>
            <p>
              Variables : <strong>{formatMoney(indicators.variableExpenses)}</strong>
              {indicators.variableSharePercent === null
                ? ''
                : ` · ${indicators.variableSharePercent} %`}
            </p>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-0 shadow-sm ring-stone-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Non classé</CardTitle>
            <CardDescription>Dépenses sans catégorie, nettes des remboursements</CardDescription>
          </CardHeader>
          <CardContent className="text-sm">
            <p className="font-semibold">{formatMoney(indicators.uncategorizedExpenses)}</p>
            <p className="mt-1 text-muted-foreground">
              {indicators.uncategorizedSharePercent === null
                ? 'Part non disponible'
                : `${indicators.uncategorizedSharePercent} % des dépenses nettes`}
            </p>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-0 shadow-sm ring-stone-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Seuils</CardTitle>
            <CardDescription>Alertes à partir de 80 %</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              En alerte : <strong>{indicators.alertThresholds.length}</strong>
            </p>
            <p>
              Dépassés : <strong>{indicators.exceededThresholds.length}</strong>
            </p>
            {indicators.alertThresholds.length + indicators.exceededThresholds.length > 0 && (
              <ul className="space-y-1 text-muted-foreground">
                {indicators.alertThresholds.map((item) => (
                  <li key={`alert-${item.categoryId}`}>
                    {item.categoryName} : seuil presque atteint
                  </li>
                ))}
                {indicators.exceededThresholds.map((item) => (
                  <li key={`over-${item.categoryId}`} className="text-destructive">
                    {item.categoryName} : seuil dépassé
                  </li>
                ))}
              </ul>
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
          month={month}
          transactions={transactions}
        />
        <CategoryComparisonChart
          categories={categories}
          month={month}
          transactions={transactions}
        />
        <DailyCumulativeChart
          month={month}
          monthlyBudgetAmount={monthlyBudgetAmount}
          transactions={transactions}
        />
        <SixMonthCashflowChart month={month} transactions={transactions} />
      </div>
    </section>
  )
}
