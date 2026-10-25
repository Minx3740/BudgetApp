import { describe, expect, it } from 'vitest'
import { countRecurringMonths } from './recurring-expenses'

describe('comptage des occurrences de forfait', () => {
  it('compte le mois de début et le mois courant', () => {
    expect(countRecurringMonths('2026-08-01', '2026-10-01')).toBe(3)
  })

  it('compte un mois unique', () => {
    expect(countRecurringMonths('2026-10-01', '2026-10-01')).toBe(1)
  })

  it('ne compte aucune occurrence pour un début futur', () => {
    expect(countRecurringMonths('2026-11-01', '2026-10-01')).toBe(0)
  })
})
