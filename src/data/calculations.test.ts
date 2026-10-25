import { describe, expect, it } from 'vitest'
import { monthKeyForDate, shiftMonth } from './calculations'

describe('outils de mois', () => {
  it('retourne le mois courant au format de budget', () => {
    expect(monthKeyForDate(new Date(2026, 9, 24))).toBe('2026-10-01')
  })

  it('avance et recule entre les mois, y compris aux changements d’année', () => {
    expect(shiftMonth('2026-12-01', 1)).toBe('2027-01-01')
    expect(shiftMonth('2027-01-01', -1)).toBe('2026-12-01')
  })

  it('refuse un mois de départ invalide', () => {
    expect(() => shiftMonth('2026-02-30', 1)).toThrow('Invalid budget month')
  })
})
