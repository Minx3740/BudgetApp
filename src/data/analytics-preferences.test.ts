import { beforeEach, describe, expect, it } from 'vitest'
import {
  defaultAnalyticsChartVisibility,
  loadAnalyticsChartVisibility,
  saveAnalyticsChartVisibility,
} from './analytics-preferences'

describe('préférences des graphiques', () => {
  const values = new Map<string, string>()
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  }

  beforeEach(() => values.clear())

  it('ouvre seulement le premier graphique par défaut sur téléphone', () => {
    expect(defaultAnalyticsChartVisibility(true)).toEqual({
      categorySpending: true,
      categoryComparison: false,
      dailyCumulative: false,
      sixMonthCashflow: false,
    })
    expect(defaultAnalyticsChartVisibility(false)).toEqual({
      categorySpending: true,
      categoryComparison: true,
      dailyCumulative: true,
      sixMonthCashflow: true,
    })
  })

  it('conserve un état valide dans le stockage local', () => {
    const visibility = {
      categorySpending: false,
      categoryComparison: true,
      dailyCumulative: false,
      sixMonthCashflow: true,
    }
    saveAnalyticsChartVisibility(visibility, storage)
    expect(loadAnalyticsChartVisibility(true, storage)).toEqual(visibility)
  })

  it('utilise les valeurs par défaut si le stockage ou son contenu est invalide', () => {
    storage.setItem('cashFlow.analyticsChartVisibility', '{')
    expect(loadAnalyticsChartVisibility(true, storage)).toEqual(
      defaultAnalyticsChartVisibility(true),
    )

    expect(
      loadAnalyticsChartVisibility(true, {
        ...storage,
        getItem: () => {
          throw new Error('storage unavailable')
        },
      }),
    ).toEqual(defaultAnalyticsChartVisibility(true))
  })

  it('reste utilisable si le navigateur refuse l’écriture locale', () => {
    expect(() =>
      saveAnalyticsChartVisibility(defaultAnalyticsChartVisibility(true), {
        ...storage,
        setItem: () => {
          throw new Error('storage unavailable')
        },
      }),
    ).not.toThrow()
  })
})
