import { describe, expect, it } from 'vitest'
import {
  createDefaultTransactionHistoryUrlState,
  getHistoryPeriodBounds,
  parseTransactionHistoryUrlState,
  serializeTransactionHistoryUrlState,
} from './transaction-history-url'

describe('transaction history URL state', () => {
  it('uses the selected month by default and preserves other application parameters', () => {
    const state = createDefaultTransactionHistoryUrlState('2026-11-01')
    const search = serializeTransactionHistoryUrlState('?mois=2026-11&invite=token', state)

    expect(new URLSearchParams(search).get('mois')).toBe('2026-11')
    expect(new URLSearchParams(search).get('invite')).toBe('token')
    expect(state.groupBy).toBe('week')
    expect(getHistoryPeriodBounds(state.period, '2026-11-01')).toEqual({
      start: '2026-11-01',
      end: '2026-11-30',
    })
  })

  it('defaults legacy URLs to weeks while preserving an explicit flat grouping', () => {
    expect(parseTransactionHistoryUrlState('?histPeriod=month', '2026-11-01').groupBy).toBe('week')
    expect(
      parseTransactionHistoryUrlState('?histPeriod=month&histGroup=none', '2026-11-01').groupBy,
    ).toBe('none')
  })

  it('round-trips period, grouping, filters, and page', () => {
    const state = parseTransactionHistoryUrlState(
      '?histPeriod=custom&histStart=2026-12-28&histEnd=2027-01-03&histGroup=week&histType=expenses&histSearch=taxi&histCategory=cat&histMember=member&histPage=2',
      '2026-11-01',
    )

    expect(
      parseTransactionHistoryUrlState(serializeTransactionHistoryUrlState('', state), '2026-11-01'),
    ).toEqual(state)
    expect(getHistoryPeriodBounds(state.period, '2026-11-01')).toEqual({
      start: '2026-12-28',
      end: '2027-01-03',
    })
  })

  it('falls back safely when URL values are invalid', () => {
    const state = parseTransactionHistoryUrlState(
      '?histPeriod=custom&histStart=2026-02-31&histEnd=2026-03-01&histGroup=pie&histPage=-2',
      '2026-02-01',
    )

    expect(state).toEqual(createDefaultTransactionHistoryUrlState('2026-02-01'))
  })
})
