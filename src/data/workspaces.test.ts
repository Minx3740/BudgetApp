import { describe, expect, it } from 'vitest'
import { createInvitationToken, hashInvitationToken, normalizeWorkspaceName } from './workspaces'

describe('nom d’espace', () => {
  it('supprime les espaces superflus et accepte une longueur valide', () => {
    expect(normalizeWorkspaceName('  Colocation  ')).toBe('Colocation')
    expect(normalizeWorkspaceName('a'.repeat(80))).toBe('a'.repeat(80))
  })

  it('rejette les noms vides ou trop longs', () => {
    expect(() => normalizeWorkspaceName('   ')).toThrow(
      'Le nom de l’espace doit contenir entre 1 et 80 caractères.',
    )
    expect(() => normalizeWorkspaceName('a'.repeat(81))).toThrow(
      'Le nom de l’espace doit contenir entre 1 et 80 caractères.',
    )
  })
})

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
