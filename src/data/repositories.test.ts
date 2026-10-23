import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { calculateAccountBalance } from './calculations'
import { clearLocalData, db } from './database'
import { accountsRepository, categoriesRepository, transactionsRepository } from './repositories'

const workspaceId = '00000000-0000-4000-8000-000000000001'
const accountId = '00000000-0000-4000-8000-000000000002'
const categoryId = '00000000-0000-4000-8000-000000000003'
const userId = '00000000-0000-4000-8000-000000000004'

describe('repositories locaux', () => {
  beforeEach(async () => {
    await clearLocalData()
  })

  it('crée une ligne avec un UUID client et une entrée outbox dans la même transaction', async () => {
    const account = await accountsRepository.create({
      workspace_id: workspaceId,
      name: 'Espèces',
      type: 'cash',
      initial_balance: 0,
      archived_at: null,
    })

    expect(account.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
    expect(account.deleted_at).toBeNull()
    expect(await db.accounts.get(account.id)).toEqual(account)
    expect(await db.outbox.toArray()).toMatchObject([
      { table: 'accounts', action: 'upsert', payload: account, status: 'pending', attempts: 0 },
    ])
  })

  it('annule la ligne si la création de son entrée outbox échoue', async () => {
    const failOutboxCreate = () => {
      throw new Error('Outbox indisponible')
    }
    db.outbox.hook.creating.subscribe(failOutboxCreate)

    try {
      await expect(
        accountsRepository.create({
          id: accountId,
          workspace_id: workspaceId,
          name: 'Espèces',
          type: 'cash',
          initial_balance: 0,
          archived_at: null,
        }),
      ).rejects.toThrow('Outbox indisponible')
    } finally {
      db.outbox.hook.creating.unsubscribe(failOutboxCreate)
    }

    expect(await db.accounts.get(accountId)).toBeUndefined()
    expect(await db.outbox.count()).toBe(0)
  })

  it('met à jour et supprime logiquement une ligne, tout en filtrant les éléments supprimés', async () => {
    const account = await accountsRepository.create({
      id: accountId,
      workspace_id: workspaceId,
      name: 'Espèces',
      type: 'cash',
      initial_balance: 0,
      archived_at: null,
    })

    const updated = await accountsRepository.update(account.id, workspaceId, {
      name: 'Portefeuille',
    })
    expect(updated.name).toBe('Portefeuille')
    expect(updated.id).toBe(account.id)
    expect(updated.updated_at).not.toBe(account.created_at)

    const deleted = await accountsRepository.softDelete(account.id, workspaceId)
    expect(deleted.deleted_at).not.toBeNull()
    expect(await accountsRepository.list(workspaceId)).toEqual([])
    expect(await accountsRepository.list(workspaceId, true)).toEqual([deleted])
    expect(await db.outbox.orderBy('created_at').toArray()).toMatchObject([
      { action: 'upsert' },
      { action: 'upsert' },
      { action: 'delete' },
    ])
  })

  it('rejette les transactions invalides sans créer de ligne ni entrée outbox', async () => {
    await expect(
      transactionsRepository.create({
        workspace_id: workspaceId,
        account_id: accountId,
        to_account_id: null,
        category_id: categoryId,
        kind: 'expense',
        amount: 0,
        occurred_on: '2026-02-30',
        note: null,
        created_by: userId,
      }),
    ).rejects.toThrow()

    expect(await db.transactions.count()).toBe(0)
    expect(await db.outbox.count()).toBe(0)
  })

  it('enregistre une dépense hors-ligne puis recalcule le solde après modification et suppression', async () => {
    const account = await accountsRepository.create({
      id: accountId,
      workspace_id: workspaceId,
      name: 'Espèces',
      type: 'cash',
      initial_balance: 10_000,
      archived_at: null,
    })
    const category = await categoriesRepository.create({
      id: categoryId,
      workspace_id: workspaceId,
      name: 'Repas',
      kind: 'expense',
      icon: null,
      color: null,
      archived_at: null,
    })
    const transaction = await transactionsRepository.create({
      workspace_id: workspaceId,
      account_id: account.id,
      to_account_id: null,
      category_id: category.id,
      kind: 'expense',
      amount: 1_200,
      occurred_on: '2026-10-24',
      note: 'Déjeuner',
      created_by: userId,
    })

    expect(calculateAccountBalance(account, await transactionsRepository.list(workspaceId))).toBe(
      8_800,
    )

    const updatedTransaction = await transactionsRepository.update(transaction.id, workspaceId, {
      amount: 2_000,
    })
    expect(calculateAccountBalance(account, await transactionsRepository.list(workspaceId))).toBe(
      8_000,
    )

    await transactionsRepository.softDelete(updatedTransaction.id, workspaceId)
    expect(calculateAccountBalance(account, await transactionsRepository.list(workspaceId))).toBe(
      10_000,
    )
    expect(await db.outbox.filter((operation) => operation.table === 'transactions').count()).toBe(
      3,
    )
  })

  it('refuse une modification depuis un autre espace', async () => {
    await accountsRepository.create({
      id: accountId,
      workspace_id: workspaceId,
      name: 'Espèces',
      type: 'cash',
      initial_balance: 0,
      archived_at: null,
    })

    await expect(
      accountsRepository.update(accountId, '00000000-0000-4000-8000-000000000005', {
        name: 'Intrusion',
      }),
    ).rejects.toThrow('is not available')
    expect((await db.accounts.get(accountId))?.name).toBe('Espèces')
    expect(await db.outbox.count()).toBe(1)
  })

  it('efface les données locales au complet', async () => {
    await accountsRepository.create({
      workspace_id: workspaceId,
      name: 'Espèces',
      type: 'cash',
      initial_balance: 0,
      archived_at: null,
    })

    await clearLocalData()

    expect(await db.accounts.count()).toBe(0)
    expect(await db.outbox.count()).toBe(0)
  })
})
