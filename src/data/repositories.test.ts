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
const categoryId = '00000000-0000-4000-8000-000000000002'
const transactionId = '00000000-0000-4000-8000-000000000003'
const userId = '00000000-0000-4000-8000-000000000004'

const categoryInput = {
  workspace_id: workspaceId,
  name: 'Repas',
  kind: 'expense' as const,
  icon: null,
  color: null,
  archived_at: null,
}

const transactionInput = {
  workspace_id: workspaceId,
  category_id: categoryId,
  kind: 'expense' as const,
  amount: 1_200,
  occurred_on: '2026-10-24',
  note: 'Déjeuner',
  created_by: userId,
  paid_by: userId,
}

describe('repositories locaux', () => {
  beforeEach(async () => {
    await clearLocalData()
  })

  it('crée une catégorie avec un UUID client et une entrée outbox atomique', async () => {
    const category = await categoriesRepository.create(categoryInput)

    expect(category.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
    expect(category.deleted_at).toBeNull()
    expect(await db.categories.get(category.id)).toEqual(category)
    expect(await db.outbox.toArray()).toMatchObject([
      { table: 'categories', action: 'upsert', payload: category, status: 'pending', attempts: 0 },
    ])
  })

  it('annule la catégorie si la création de son entrée outbox échoue', async () => {
    const failOutboxCreate = () => {
      throw new Error('Outbox indisponible')
    }
    db.outbox.hook.creating.subscribe(failOutboxCreate)

    try {
      await expect(
        categoriesRepository.create({ ...categoryInput, id: categoryId }),
      ).rejects.toThrow('Outbox indisponible')
    } finally {
      db.outbox.hook.creating.unsubscribe(failOutboxCreate)
    }

    expect(await db.categories.get(categoryId)).toBeUndefined()
    expect(await db.outbox.count()).toBe(0)
  })

  it('archive et restaure une catégorie sans modifier son historique', async () => {
    const category = await categoriesRepository.create({ ...categoryInput, id: categoryId })
    const transaction = await transactionsRepository.create({
      ...transactionInput,
      id: transactionId,
    })
    const archivedAt = '2026-10-25T12:00:00.000Z'

    const archived = await categoriesRepository.update(category.id, workspaceId, {
      archived_at: archivedAt,
    })

    expect(archived.archived_at).toBe(archivedAt)
    expect(await categoriesRepository.list(workspaceId)).toContainEqual(archived)
    expect(await db.transactions.get(transaction.id)).toMatchObject({
      category_id: category.id,
      deleted_at: null,
    })

    const restored = await categoriesRepository.update(category.id, workspaceId, {
      archived_at: null,
    })

    expect(restored.archived_at).toBeNull()
    expect(await db.transactions.get(transaction.id)).toMatchObject({
      category_id: category.id,
      deleted_at: null,
    })
  })

  it('met à jour et supprime logiquement une ligne', async () => {
    const category = await categoriesRepository.create({ ...categoryInput, id: categoryId })

    const updated = await categoriesRepository.update(category.id, workspaceId, {
      name: 'Alimentation',
    })
    expect(updated.name).toBe('Alimentation')
    expect(updated.id).toBe(category.id)
    expect(updated.updated_at).not.toBe(category.created_at)

    const deleted = await categoriesRepository.softDelete(category.id, workspaceId)
    expect(deleted.deleted_at).not.toBeNull()
    expect(await categoriesRepository.list(workspaceId)).toEqual([])
    expect(await categoriesRepository.list(workspaceId, true)).toEqual([deleted])
    expect(await db.outbox.orderBy('created_at').toArray()).toMatchObject([
      { action: 'upsert' },
      { action: 'upsert' },
      { action: 'delete' },
    ])
  })

  it('refuse une transaction invalide sans créer de ligne ni entrée outbox', async () => {
    await expect(
      transactionsRepository.create({
        ...transactionInput,
        amount: 0,
        occurred_on: '2026-02-30',
      }),
    ).rejects.toThrow()

    expect(await db.transactions.count()).toBe(0)
    expect(await db.outbox.count()).toBe(0)
  })

  it('ajoute les budgets mensuels et décisions de report à la file de synchronisation', async () => {
    const monthlyBudget = await monthlyBudgetsRepository.create({
      workspace_id: workspaceId,
      month: '2026-10-01',
      budget_amount: 0,
    })
    const carryDecision = await monthCarryDecisionsRepository.create({
      workspace_id: workspaceId,
      month: '2026-10-01',
      accepted: false,
    })

    expect(await db.monthlyBudgets.get(monthlyBudget.id)).toEqual(monthlyBudget)
    expect(await db.monthCarryDecisions.get(carryDecision.id)).toEqual(carryDecision)
    expect(await db.outbox.orderBy('created_at').toArray()).toMatchObject([
      { table: 'monthlyBudgets', action: 'upsert', payload: monthlyBudget },
      { table: 'monthCarryDecisions', action: 'upsert', payload: carryDecision },
    ])
  })

  it('enregistre une transaction et synchronise ses modifications et suppression', async () => {
    await categoriesRepository.create({ ...categoryInput, id: categoryId })
    const transaction = await transactionsRepository.create({
      ...transactionInput,
      id: transactionId,
    })

    expect(transaction.amount).toBe(1_200)
    expect(transaction.paid_by).toBe(userId)

    const updated = await transactionsRepository.update(transaction.id, workspaceId, {
      amount: 2_000,
    })
    expect(updated.amount).toBe(2_000)

    await transactionsRepository.softDelete(updated.id, workspaceId)
    expect(await transactionsRepository.list(workspaceId)).toEqual([])
    expect(await db.outbox.filter((operation) => operation.table === 'transactions').count()).toBe(
      3,
    )
  })

  it('refuse une modification depuis un autre espace', async () => {
    await categoriesRepository.create({ ...categoryInput, id: categoryId })

    await expect(
      categoriesRepository.update(categoryId, '00000000-0000-4000-8000-000000000005', {
        name: 'Intrusion',
      }),
    ).rejects.toThrow('is not available')
    expect((await db.categories.get(categoryId))?.name).toBe('Repas')
    expect(await db.outbox.count()).toBe(1)
  })

  it('efface toutes les données locales', async () => {
    await categoriesRepository.create(categoryInput)
    await monthlyBudgetsRepository.create({
      workspace_id: workspaceId,
      month: '2026-10-01',
      budget_amount: 100_000,
    })
    await monthCarryDecisionsRepository.create({
      workspace_id: workspaceId,
      month: '2026-10-01',
      accepted: true,
    })
    await clearLocalData()

    expect(await db.categories.count()).toBe(0)
    expect(await db.monthlyBudgets.count()).toBe(0)
    expect(await db.monthCarryDecisions.count()).toBe(0)
    expect(await db.outbox.count()).toBe(0)
  })
})
