export const analyticsChartIds = [
  'categorySpending',
  'categoryComparison',
  'dailyCumulative',
  'sixMonthCashflow',
] as const

export type AnalyticsChartId = (typeof analyticsChartIds)[number]
export type AnalyticsChartVisibility = Record<AnalyticsChartId, boolean>
type AnalyticsStorage = Pick<Storage, 'getItem' | 'setItem'>

const visibilityStorageKey = 'cashFlow.analyticsChartVisibility'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function defaultAnalyticsChartVisibility(isMobile: boolean): AnalyticsChartVisibility {
  return {
    categorySpending: true,
    categoryComparison: !isMobile,
    dailyCumulative: !isMobile,
    sixMonthCashflow: !isMobile,
  }
}

export function loadAnalyticsChartVisibility(
  isMobile: boolean,
  storage?: AnalyticsStorage,
): AnalyticsChartVisibility {
  const defaults = defaultAnalyticsChartVisibility(isMobile)
  try {
    const browserStorage = storage ?? (typeof window === 'undefined' ? null : window.localStorage)
    if (!browserStorage) return defaults
    const stored = browserStorage.getItem(visibilityStorageKey)
    if (!stored) return defaults
    const parsed: unknown = JSON.parse(stored)
    if (!isRecord(parsed)) return defaults

    return {
      categorySpending:
        typeof parsed.categorySpending === 'boolean'
          ? parsed.categorySpending
          : defaults.categorySpending,
      categoryComparison:
        typeof parsed.categoryComparison === 'boolean'
          ? parsed.categoryComparison
          : defaults.categoryComparison,
      dailyCumulative:
        typeof parsed.dailyCumulative === 'boolean'
          ? parsed.dailyCumulative
          : defaults.dailyCumulative,
      sixMonthCashflow:
        typeof parsed.sixMonthCashflow === 'boolean'
          ? parsed.sixMonthCashflow
          : defaults.sixMonthCashflow,
    }
  } catch {
    return defaults
  }
}

export function saveAnalyticsChartVisibility(
  visibility: AnalyticsChartVisibility,
  storage?: AnalyticsStorage,
): void {
  try {
    const browserStorage = storage ?? (typeof window === 'undefined' ? null : window.localStorage)
    browserStorage?.setItem(visibilityStorageKey, JSON.stringify(visibility))
  } catch {
    // Charts remain usable when browser storage is unavailable.
  }
}

export function isMobileAnalyticsViewport(): boolean {
  try {
    return window.matchMedia('(max-width: 639px)').matches
  } catch {
    return false
  }
}
