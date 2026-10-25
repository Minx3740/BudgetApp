import { describe, expect, it } from 'vitest'
import { avatarCropRect, profileAvatarPath, validateAvatarFile } from './avatars'

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

  it('calcule un recadrage carré centré, zoomé et borné aux dimensions de la photo', () => {
    expect(avatarCropRect(800, 400, { centerX: 0.5, centerY: 0.5, zoom: 1 })).toEqual({
      x: 200,
      y: 0,
      size: 400,
    })
    expect(avatarCropRect(800, 400, { centerX: 0.75, centerY: 0.5, zoom: 2 })).toEqual({
      x: 500,
      y: 100,
      size: 200,
    })
    expect(avatarCropRect(800, 400, { centerX: 1, centerY: 1, zoom: 1 })).toEqual({
      x: 400,
      y: 0,
      size: 400,
    })
  })

  it('rejette les dimensions et niveaux de zoom de recadrage invalides', () => {
    expect(() => avatarCropRect(0, 400, { centerX: 0.5, centerY: 0.5, zoom: 1 })).toThrow(
      'Le fichier image ne contient pas de dimensions valides.',
    )
    expect(() => avatarCropRect(400, 400, { centerX: 0.5, centerY: 0.5, zoom: 4 })).toThrow(
      'Le zoom de recadrage est invalide.',
    )
  })
})
