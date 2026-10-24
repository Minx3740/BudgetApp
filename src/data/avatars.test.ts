import { describe, expect, it } from 'vitest'
import { profileAvatarPath, validateAvatarFile } from './avatars'

describe('photos de profil', () => {
  it('construit uniquement un chemin stable sous le dossier du compte', () => {
    expect(profileAvatarPath('10000000-0000-4000-8000-000000000001')).toBe(
      '10000000-0000-4000-8000-000000000001/avatar.webp',
    )
    expect(() => profileAvatarPath('../other-user')).toThrow(
      'Identifiant de compte invalide pour la photo de profil.',
    )
  })

  it('accepte uniquement des images prises en charge sous la limite', () => {
    const image = new File(['photo'], 'avatar.png', { type: 'image/png' })
    expect(() => validateAvatarFile(image)).not.toThrow()
    expect(() =>
      validateAvatarFile(new File(['script'], 'avatar.svg', { type: 'image/svg+xml' })),
    ).toThrow('Choisis une image JPG, PNG ou WebP.')
    expect(() =>
      validateAvatarFile(
        new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'large.webp', {
          type: 'image/webp',
        }),
      ),
    ).toThrow('La photo doit peser entre 1 octet et 10 Mo.')
  })
})
