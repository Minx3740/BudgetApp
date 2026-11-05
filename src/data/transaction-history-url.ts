import {
  getDayPeriod,
  getMonthPeriod,
  getWeekPeriod,
  isDatePeriod,
  isLocalDate,
  type DatePeriod,
} from './periods'
import {
  createEmptyTransactionHistoryFilters,
  type TransactionHistoryFilters,
} from './transaction-history'
import type { TransactionGroupBy } from './transaction-grouping'

export type HistoryPeriodSelection =
  | { type: 'day'; date: string }
  | { type: 'week'; date: string }
  | { type: 'month' }
  | { type: 'custom'; start: string; end: string }

export interface TransactionHistoryUrlState {
  period: HistoryPeriodSelection
  groupBy: TransactionGroupBy
  filters: TransactionHistoryFilters
  page: number
}

const historyParameters = [
  'histPeriod',
  'histDate',
  'histStart',
  'histEnd',
  'histGroup',
  'histType',
  'histSearch',
  'histCategory',
  'histMember',
  'histPage',
]

export function createDefaultTransactionHistoryUrlState(month: string): TransactionHistoryUrlState {
  getMonthPeriod(month)
  return {
    period: { type: 'month' },
    groupBy: 'none',
    filters: createEmptyTransactionHistoryFilters(),
    page: 1,
  }
}

export function getHistoryPeriodBounds(
  selection: HistoryPeriodSelection,
  month: string,
): DatePeriod {
  switch (selection.type) {
    case 'day':
      return getDayPeriod(selection.date)
    case 'week':
      return getWeekPeriod(selection.date)
    case 'month':
      return getMonthPeriod(month)
    case 'custom': {
      const range = { start: selection.start, end: selection.end }
      if (!isDatePeriod(range)) throw new Error('Invalid custom history period')
      return range
    }
  }
}

export function parseTransactionHistoryUrlState(
  search: string,
  month: string,
): TransactionHistoryUrlState {
  const fallback = createDefaultTransactionHistoryUrlState(month)
  const params = new URLSearchParams(search)
  const periodType = params.get('histPeriod')
  let period: HistoryPeriodSelection = fallback.period

  const date = params.get('histDate')
  if ((periodType === 'day' || periodType === 'week') && date && isLocalDate(date)) {
    period = { type: periodType, date }
  } else if (periodType === 'custom') {
    const custom = { start: params.get('histStart') ?? '', end: params.get('histEnd') ?? '' }
    if (isDatePeriod(custom)) period = { type: 'custom', ...custom }
  } else if (periodType === 'month') {
    period = { type: 'month' }
  }

  const group = params.get('histGroup')
  const groupBy: TransactionGroupBy =
    group === 'day' || group === 'week' || group === 'month' ? group : 'none'
  const transactionType = params.get('histType')
  const filters = createEmptyTransactionHistoryFilters()
  filters.transactionType =
    transactionType === 'expenses' || transactionType === 'income' ? transactionType : 'all'
  filters.search = params.get('histSearch') ?? ''
  filters.categoryId = params.get('histCategory') ?? ''
  filters.memberId = params.get('histMember') ?? ''
  const requestedPage = Number(params.get('histPage'))

  return {
    period,
    groupBy,
    filters,
    page: Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1,
  }
}

export function serializeTransactionHistoryUrlState(
  search: string,
  state: TransactionHistoryUrlState,
): string {
  const params = new URLSearchParams(search)
  for (const parameter of historyParameters) params.delete(parameter)

  params.set('histPeriod', state.period.type)
  params.set('histGroup', state.groupBy)
  params.set('histType', state.filters.transactionType)
  params.set('histPage', String(state.page))
  if (state.period.type === 'day' || state.period.type === 'week') {
    params.set('histDate', state.period.date)
  } else if (state.period.type === 'custom') {
    params.set('histStart', state.period.start)
    params.set('histEnd', state.period.end)
  }
  if (state.filters.search) params.set('histSearch', state.filters.search)
  if (state.filters.categoryId) params.set('histCategory', state.filters.categoryId)
  if (state.filters.memberId) params.set('histMember', state.filters.memberId)

  return params.toString()
}
