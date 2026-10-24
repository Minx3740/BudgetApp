import { describe, expect, it } from 'vitest'
import { createInvitationToken, hashInvitationToken } from './workspaces'

describe('jetons d’invitation', () => {
  it('génère des jetons aléatoires de 32 octets encodés en hexadécimal', () => {
    const token = createInvitationToken()

    expect(token).toMatch(/^[0-9a-f]{64}$/)
    expect(createInvitationToken()).not.toBe(token)
  })

  it('ne conserve que le condensat SHA-256 destiné à la base', async () => {
    await expect(hashInvitationToken('abc')).resolves.toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
  })
})
