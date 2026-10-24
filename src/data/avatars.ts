const avatarFileTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])
const maxAvatarFileSize = 10 * 1024 * 1024
const maxStoredAvatarSize = 1024 * 1024
const avatarDimension = 256

export function profileAvatarPath(userId: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
    throw new Error('Identifiant de compte invalide pour la photo de profil.')
  }
  return `${userId}/avatar.webp`
}

export function validateAvatarFile(file: File): void {
  if (!avatarFileTypes.has(file.type)) {
    throw new Error('Choisis une image JPG, PNG ou WebP.')
  }
  if (file.size <= 0 || file.size > maxAvatarFileSize) {
    throw new Error('La photo doit peser entre 1 octet et 10 Mo.')
  }
}

export async function resizeAvatar(file: File): Promise<Blob> {
  validateAvatarFile(file)
  if (typeof createImageBitmap !== 'function') {
    throw new Error(
      'Ce navigateur ne permet pas de préparer la photo. Essaie un navigateur récent.',
    )
  }

  const image = await createImageBitmap(file)
  try {
    if (image.width === 0 || image.height === 0) {
      throw new Error('Le fichier image ne contient pas de dimensions valides.')
    }

    const canvas = document.createElement('canvas')
    canvas.width = avatarDimension
    canvas.height = avatarDimension
    const context = canvas.getContext('2d')
    if (!context) {
      throw new Error('Impossible de préparer la photo dans ce navigateur.')
    }

    const cropSize = Math.min(image.width, image.height)
    const cropX = (image.width - cropSize) / 2
    const cropY = (image.height - cropSize) / 2
    context.drawImage(
      image,
      cropX,
      cropY,
      cropSize,
      cropSize,
      0,
      0,
      avatarDimension,
      avatarDimension,
    )

    const resized = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob)
          } else {
            reject(new Error('Impossible d’encoder la photo au format WebP.'))
          }
        },
        'image/webp',
        0.82,
      )
    })
    if (resized.type !== 'image/webp') {
      throw new Error('Ce navigateur n’a pas pu encoder la photo au format WebP.')
    }
    if (resized.size > maxStoredAvatarSize) {
      throw new Error('La photo reste trop volumineuse après compression (maximum 1 Mo).')
    }
    return resized
  } finally {
    image.close()
  }
}
