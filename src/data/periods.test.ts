import { describe, expect, it } from 'vitest'
import {
  getDayPeriod,
  getMonthPeriod,
  getMonthWeekPeriods,
  getWeekPeriod,
  isLocalDate,
} from './periods'

describe('periods', () => {
  it('uses the local date as the day period without timezone conversion', () => {
    expect(getDayPeriod('2026-03-01')).toEqual({ start: '2026-03-01', end: '2026-03-01' })
  })

  it('returns Monday-to-Sunday weeks across month and year boundaries', () => {
    expect(getWeekPeriod('2027-01-01')).toEqual({ start: '2026-12-28', end: '2027-01-03' })
    expect(getWeekPeriod('2026-11-01')).toEqual({ start: '2026-10-26', end: '2026-11-01' })
  })

  it('returns month bounds including leap days and year changes', () => {
    expect(getMonthPeriod('2028-02-13')).toEqual({ start: '2028-02-01', end: '2028-02-29' })
    expect(getMonthPeriod('2027-01')).toEqual({ start: '2027-01-01', end: '2027-01-31' })
  })

  it('truncates month weeks to month bounds so their intervals cover exactly the month', () => {
    const weeks = getMonthWeekPeriods('2027-01')
    expect(weeks).toEqual([
      { start: '2027-01-01', end: '2027-01-03' },
      { start: '2027-01-04', end: '2027-01-10' },
      { start: '2027-01-11', end: '2027-01-17' },
      { start: '2027-01-18', end: '2027-01-24' },
      { start: '2027-01-25', end: '2027-01-31' },
    ])
  })

  it('rejects invalid local dates and months', () => {
    expect(isLocalDate('2026-02-29')).toBe(false)
    expect(isLocalDate('2028-02-29')).toBe(true)
    expect(() => getMonthPeriod('2026-13')).toThrow('Invalid local date')
    expect(() => getMonthPeriod('2026-02-31')).toThrow('Invalid local date')
  })
})
