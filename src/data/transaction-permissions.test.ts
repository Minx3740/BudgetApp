import { describe, expect, it } from 'vitest'
import { canCreateTransaction, canEditTransaction } from './transaction-permissions'

const ownerId = '00000000-0000-4000-8000-000000000001'
const memberId = '00000000-0000-4000-8000-000000000002'
const otherId = '00000000-0000-4000-8000-000000000003'

describe('droits locaux sur les transactions', () => {
  it('autorise la création pour un owner ou membre uniquement par son auteur', () => {
    expect(canCreateTransaction(ownerId, 'owner', ownerId)).toBe(true)
    expect(canCreateTransaction(memberId, 'member', memberId)).toBe(true)
    expect(canCreateTransaction(memberId, 'member', ownerId)).toBe(false)
    expect(canCreateTransaction(memberId, 'viewer', memberId)).toBe(false)
    expect(canCreateTransaction(memberId, undefined, memberId)).toBe(false)
  })

  it('autorise un membre à modifier seulement ses transactions et un owner toutes', () => {
    const ownerTransaction = { created_by: ownerId }
    const memberTransaction = { created_by: memberId }

    expect(canEditTransaction(ownerId, 'owner', memberTransaction)).toBe(true)
    expect(canEditTransaction(memberId, 'member', memberTransaction)).toBe(true)
    expect(canEditTransaction(memberId, 'member', ownerTransaction)).toBe(false)
    expect(canEditTransaction(otherId, 'viewer', memberTransaction)).toBe(false)
    expect(canEditTransaction(memberId, undefined, memberTransaction)).toBe(false)
  })
})
