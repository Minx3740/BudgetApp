import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { clearLocalData, db } from './database'
import {
  categoriesRepository,
  monthCarryDecisionsRepository,
  monthlyBudgetsRepository,
  transactionsRepository,
} from './repositories'

const workspaceId = '00000000-0000-4000-8000-000000000001'
const transactionId = '00000000-0000-4000-8000-000000000002'
const categoryId = '00000000-0000-4000-8000-000000000003'
const userId = '00000000-0000-4000-8000-000000000004'
const month = '2026-10-01'

describe('repositories locaux R1', () => {
  beforeEach(async () => {
    await clearLocalData()
  })

  it('crée une transaction de caisse avec une entrée outbox atomique', async () => {
    const transaction = await transactionsRepository.create({
      workspace_id: workspaceId,
      category_id: categoryId,
      kind: 'expense',
      amount: 250,
      occurred_on: '2026-10-24',
      note: 'Repas',
      created_by: userId,
      paid_by: userId,
    })

    expect(transaction.id).toMatch(/^[0-9a-f-]{36}$/i)
    expect(transaction.deleted_at).toBeNull()
    expect(await db.transactions.get(transaction.id)).toEqual(transaction)
    expect(await db.outbox.toArray()).toMatchObject([
      { table: 'transactions', action: 'upsert', payload: transaction, status: 'pending' },
    ])
  })

  it('annule la ligne si la création de son entrée outbox échoue', async () => {
    const failOutboxCreate = () => {
      throw new Error('Outbox indisponible')
    }
    db.outbox.hook.creating.subscribe(failOutboxCreate)

    try {
      await expect(
        transactionsRepository.create({
          id: transactionId,
          workspace_id: workspaceId,
          category_id: categoryId,
          kind: 'expense',
          amount: 250,
          occurred_on: '2026-10-24',
          note: null,
          created_by: userId,
          paid_by: userId,
        }),
      ).rejects.toThrow('Outbox indisponible')
    } finally {
      db.outbox.hook.creating.unsubscribe(failOutboxCreate)
    }

    expect(await db.transactions.get(transactionId)).toBeUndefined()
    expect(await db.outbox.count()).toBe(0)
  })

  it('met à jour et supprime logiquement une ligne sans exposer les lignes supprimées', async () => {
    const transaction = await transactionsRepository.create({
      id: transactionId,
      workspace_id: workspaceId,
      category_id: categoryId,
      kind: 'expense',
      amount: 250,
      occurred_on: '2026-10-24',
      note: null,
      created_by: userId,
      paid_by: userId,
    })

    const updated = await transactionsRepository.update(transaction.id, workspaceId, {
      amount: 300,
    })
    expect(updated.amount).toBe(300)
    expect(updated.id).toBe(transaction.id)
    expect(updated.updated_at).not.toBe(transaction.created_at)

    const deleted = await transactionsRepository.softDelete(transaction.id, workspaceId)
    expect(deleted.deleted_at).not.toBeNull()
    expect(await transactionsRepository.list(workspaceId)).toEqual([])
    expect(await transactionsRepository.list(workspaceId, true)).toEqual([deleted])
    expect(await db.outbox.orderBy('created_at').toArray()).toMatchObject([
      { action: 'upsert' },
      { action: 'upsert' },
      { action: 'delete' },
    ])
  })

  it('rejette les données invalides sans créer de ligne ni entrée outbox', async () => {
    await expect(
      transactionsRepository.create({
        workspace_id: workspaceId,
        category_id: null,
        kind: 'expense',
        amount: 0,
        occurred_on: '2026-02-30',
        note: null,
        created_by: userId,
        paid_by: userId,
      }),
    ).rejects.toThrow()

    expect(await db.transactions.count()).toBe(0)
    expect(await db.outbox.count()).toBe(0)
  })

  it('crée les budgets mensuels et décisions de report via leurs dépôts', async () => {
    const budget = await monthlyBudgetsRepository.create({
      workspace_id: workspaceId,
      month,
      budget_amount: 0,
    })
    const decision = await monthCarryDecisionsRepository.create({
      workspace_id: workspaceId,
      month,
      accepted: true,
    })

    expect(await db.monthlyBudgets.get(budget.id)).toEqual(budget)
    expect(await db.monthCarryDecisions.get(decision.id)).toEqual(decision)
    const operations = await db.outbox.toArray()
    expect(operations.map(({ table, action }) => ({ table, action }))).toEqual(
      expect.arrayContaining([
        { table: 'monthlyBudgets', action: 'upsert' },
        { table: 'monthCarryDecisions', action: 'upsert' },
      ]),
    )
  })

  it('refuse une modification depuis un autre espace', async () => {
    const transaction = await transactionsRepository.create({
      id: transactionId,
      workspace_id: workspaceId,
      category_id: categoryId,
      kind: 'expense',
      amount: 250,
      occurred_on: '2026-10-24',
      note: null,
      created_by: userId,
      paid_by: userId,
    })

    await expect(
      transactionsRepository.update(transaction.id, '00000000-0000-4000-8000-000000000005', {
        note: 'Intrusion',
      }),
    ).rejects.toThrow('is not available')
    expect((await db.transactions.get(transactionId))?.note).toBeNull()
    expect(await db.outbox.count()).toBe(1)
  })

  it('efface les données locales et la file au complet', async () => {
    await categoriesRepository.create({
      workspace_id: workspaceId,
      name: 'Alimentation',
      kind: 'expense',
      icon: null,
      color: null,
      archived_at: null,
    })
    await monthlyBudgetsRepository.create({
      workspace_id: workspaceId,
      month,
      budget_amount: 1000,
    })

    await clearLocalData()

    expect(await db.categories.count()).toBe(0)
    expect(await db.monthlyBudgets.count()).toBe(0)
    expect(await db.outbox.count()).toBe(0)
  })
})
