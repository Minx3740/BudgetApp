import { describe, expect, it } from 'vitest'
import type { Budget, CashflowTransaction, Category } from './models'
import { calculateThresholdStatuses } from './thresholds'

const workspaceId = '00000000-0000-4000-8000-000000000001'
const categoryId = '00000000-0000-4000-8000-000000000002'
const userId = '00000000-0000-4000-8000-000000000003'
const timestamp = '2026-10-01T10:00:00.000Z'

function budget(
  id: string,
  period: Budget['period'],
  amount: number,
  category_id: string | null = null,
  month: string | null = period === 'month' ? '2026-10-01' : null,
  enabled = true,
): Budget {
  return {
    id,
    workspace_id: workspaceId,
    category_id,
    month,
    period,
    enabled,
    limit_amount: amount,
    created_at: timestamp,
    updated_at: timestamp,
    deleted_at: null,
  }
}

function transaction(
  id: string,
  kind: CashflowTransaction['kind'],
  amount: number,
  occurred_on: string,
  category_id: string | null,
  recurring_id: string | null = null,
  deleted_at: string | null = null,
): CashflowTransaction {
  return {
    id,
    workspace_id: workspaceId,
    category_id,
    kind,
    amount,
    occurred_on,
    note: null,
    created_by: userId,
    updated_by: userId,
    paid_by: userId,
    recurring_id,
    recurring_month: null,
    created_at: timestamp,
    updated_at: timestamp,
    deleted_at,
  }
}

const category: Category = {
  id: categoryId,
  workspace_id: workspaceId,
  name: 'Logement',
  kind: 'expense',
  icon: null,
  color: null,
  archived_at: null,
  created_at: timestamp,
  updated_at: timestamp,
  deleted_at: null,
}

describe('calcul des états de seuil', () => {
  it('exclut forfaits, ajustements et suppressions de tous les seuils', () => {
    const statuses = calculateThresholdStatuses(
      '2026-10-01',
      [
        budget('10000000-0000-4000-8000-000000000001', 'day', 1_000),
        budget('10000000-0000-4000-8000-000000000002', 'week', 2_000),
        budget('10000000-0000-4000-8000-000000000003', 'month', 1_000, categoryId),
      ],
      [category],
      [
        transaction(
          '20000000-0000-4000-8000-000000000001',
          'expense',
          600,
          '2026-10-01',
          categoryId,
        ),
        transaction(
          '20000000-0000-4000-8000-000000000002',
          'refund',
          100,
          '2026-10-01',
          categoryId,
        ),
        transaction(
          '20000000-0000-4000-8000-000000000003',
          'expense',
          800,
          '2026-10-01',
          categoryId,
          '30000000-0000-4000-8000-000000000001',
        ),
        transaction('20000000-0000-4000-8000-000000000004', 'adjustment', -500, '2026-10-01', null),
        transaction(
          '20000000-0000-4000-8000-000000000005',
          'expense',
          500,
          '2026-10-01',
          categoryId,
          null,
          timestamp,
        ),
      ],
      new Date(2026, 9, 1, 12),
    )

    expect(statuses.map(({ period, spentAmount }) => [period, spentAmount])).toEqual([
      ['day', 500],
      ['week', 500],
      ['month', 500],
    ])
  })

  it('calcule la semaine lundi-dimanche complète même lorsqu’elle déborde sur un autre mois', () => {
    const statuses = calculateThresholdStatuses(
      '2026-10-01',
      [budget('10000000-0000-4000-8000-000000000011', 'week', 1_000)],
      [],
      [
        transaction('20000000-0000-4000-8000-000000000011', 'expense', 300, '2026-09-30', null),
        transaction('20000000-0000-4000-8000-000000000012', 'expense', 400, '2026-10-01', null),
        transaction('20000000-0000-4000-8000-000000000013', 'expense', 900, '2026-10-05', null),
      ],
      new Date(2026, 9, 1, 12),
    )

    expect(statuses[0]).toMatchObject({
      start: '2026-09-28',
      end: '2026-10-04',
      spentAmount: 700,
      remainingAmount: 300,
    })
  })

  it('garde les seuils désactivés sans signaler de dépassement', () => {
    const statuses = calculateThresholdStatuses(
      '2026-10-01',
      [budget('10000000-0000-4000-8000-000000000021', 'day', 0, null, null, false)],
      [],
      [transaction('20000000-0000-4000-8000-000000000021', 'expense', 10, '2026-10-01', null)],
      new Date(2026, 9, 1, 12),
    )

    expect(statuses[0]).toMatchObject({
      enabled: false,
      isOverThreshold: false,
      isNearThreshold: false,
      spentAmount: 10,
    })
  })
})
