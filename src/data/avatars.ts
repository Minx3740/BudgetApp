const avatarFileTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])
const maxAvatarFileSize = 10 * 1024 * 1024
const maxStoredAvatarSize = 1024 * 1024
const avatarDimension = 256

export interface AvatarCrop {
  centerX: number
  centerY: number
  zoom: number
}

export interface AvatarCropRect {
  x: number
  y: number
  size: number
}

export function avatarCropRect(width: number, height: number, crop: AvatarCrop): AvatarCropRect {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error('Le fichier image ne contient pas de dimensions valides.')
  }
  if (!Number.isFinite(crop.zoom) || crop.zoom < 1 || crop.zoom > 3) {
    throw new Error('Le zoom de recadrage est invalide.')
  }
  if (!Number.isFinite(crop.centerX) || !Number.isFinite(crop.centerY)) {
    throw new Error('Le centre du recadrage est invalide.')
  }

  const size = Math.min(width, height) / crop.zoom
  const centerX = Math.min(width - size / 2, Math.max(size / 2, crop.centerX * width))
  const centerY = Math.min(height - size / 2, Math.max(size / 2, crop.centerY * height))
  return { x: centerX - size / 2, y: centerY - size / 2, size }
}

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

export async function resizeAvatar(
  file: File,
  crop: AvatarCrop = {
    centerX: 0.5,
    centerY: 0.5,
    zoom: 1,
  },
): Promise<Blob> {
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

    const cropRect = avatarCropRect(image.width, image.height, crop)
    context.drawImage(
      image,
      cropRect.x,
      cropRect.y,
      cropRect.size,
      cropRect.size,
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
