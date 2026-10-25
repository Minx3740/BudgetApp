import { useEffect, useMemo, useRef, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { avatarCropRect, profileAvatarPath, resizeAvatar, validateAvatarFile } from '@/data/avatars'
import { SignedAvatar } from './signed-avatar'

interface ProfileAvatarProps {
  client: SupabaseClient
  userId: string
  displayName: string
  initials: string
  avatarPath: string | null
  isOnline: boolean
  onUpdated: () => void
}

export function ProfileAvatar({
  client,
  userId,
  displayName,
  initials,
  avatarPath,
  isOnline,
  onUpdated,
}: ProfileAvatarProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(
    null,
  )
  const [crop, setCrop] = useState({ centerX: 0.5, centerY: 0.5, zoom: 1 })
  const [actionError, setActionError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const pointerStart = useRef<{
    pointerId: number
    x: number
    y: number
    centerX: number
    centerY: number
    scale: number
  } | null>(null)
  const previewUrlRef = useRef<string | null>(null)
  const cropRect = useMemo(
    () =>
      imageDimensions ? avatarCropRect(imageDimensions.width, imageDimensions.height, crop) : null,
    [crop, imageDimensions],
  )

  useEffect(() => {
    if (!previewUrl) return
    let cancelled = false
    const image = new Image()
    image.onload = () => {
      if (!cancelled) setImageDimensions({ width: image.naturalWidth, height: image.naturalHeight })
    }
    image.onerror = () => {
      if (!cancelled) setActionError('Impossible de lire cette image.')
    }
    image.src = previewUrl
    return () => {
      cancelled = true
    }
  }, [previewUrl])

  useEffect(
    () => () => {
      if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    },
    [],
  )

  function selectFile(file: File | null) {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    const url = file ? URL.createObjectURL(file) : null
    previewUrlRef.current = url
    setPreviewUrl(url)
    setSelectedFile(file)
    setImageDimensions(null)
    setCrop({ centerX: 0.5, centerY: 0.5, zoom: 1 })
  }

  const scale = imageDimensions && cropRect ? 256 / cropRect.size : 1

  function moveCrop(pointerX: number, pointerY: number) {
    const start = pointerStart.current
    if (!start || !imageDimensions) return
    setCrop((current) => ({
      ...current,
      centerX: start.centerX - (pointerX - start.x) / (start.scale * imageDimensions.width),
      centerY: start.centerY - (pointerY - start.y) / (start.scale * imageDimensions.height),
    }))
  }

  async function uploadSelectedPhoto() {
    if (!selectedFile || !isOnline || busy || !imageDimensions) return
    setActionError(null)
    setNotice(null)
    setBusy(true)
    try {
      validateAvatarFile(selectedFile)
      const resizedAvatar = await resizeAvatar(selectedFile, crop)
      const path = profileAvatarPath(userId)
      const { error: uploadError } = await client.storage
        .from('avatars')
        .upload(path, resizedAvatar, {
          cacheControl: '600',
          contentType: 'image/webp',
          upsert: true,
        })
      if (uploadError) {
        throw new Error(`Impossible d’envoyer la photo. ${uploadError.message}`)
      }

      const { data, error: profileError } = await client
        .from('profiles')
        .update({ avatar_path: path })
        .eq('id', userId)
        .select('id')
        .maybeSingle()
      if (profileError) {
        throw new Error(
          `La photo a été envoyée, mais son chemin n’a pas pu être enregistré dans le profil. ${profileError.message}`,
        )
      }
      if (!data) {
        throw new Error(
          'La photo a été envoyée, mais le profil n’existe plus ou ne peut pas être modifié.',
        )
      }

      selectFile(null)
      setNotice('Photo de profil mise à jour.')
      onUpdated()
    } catch (failure) {
      const message =
        failure instanceof Error ? failure.message : 'Erreur inconnue de téléversement.'
      setActionError(message)
    } finally {
      setBusy(false)
    }
  }

  async function removePhoto() {
    if (!avatarPath || !isOnline || busy) return
    if (!window.confirm('Retirer ta photo de profil ?')) return

    setActionError(null)
    setNotice(null)
    setBusy(true)
    try {
      const { data, error: profileError } = await client
        .from('profiles')
        .update({ avatar_path: null })
        .eq('id', userId)
        .eq('avatar_path', avatarPath)
        .select('id')
        .maybeSingle()
      if (profileError) {
        throw new Error(`Impossible de retirer la photo du profil. ${profileError.message}`)
      }
      if (!data) {
        throw new Error('La photo a déjà changé ou le profil ne peut pas être modifié.')
      }

      const { error: storageError } = await client.storage.from('avatars').remove([avatarPath])
      if (storageError) {
        onUpdated()
        throw new Error(
          `La photo est retirée du profil, mais le fichier privé n’a pas pu être supprimé. ${storageError.message}`,
        )
      }

      setNotice('Photo de profil retirée.')
      onUpdated()
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : 'Erreur inconnue de suppression.'
      setActionError(message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="rounded-2xl border-0 shadow-sm ring-stone-200">
      <CardHeader>
        <CardTitle>Photo de profil</CardTitle>
        <CardDescription>
          Image carrée recadrée et réduite à 256 × 256 pixels, envoyée en WebP.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-4">
          <SignedAvatar
            avatarPath={avatarPath}
            className="size-16 shrink-0 rounded-full text-lg"
            client={client}
            displayName={displayName}
            initials={initials}
            showError
          />
          <div className="min-w-0">
            <p className="truncate font-medium">{displayName}</p>
            <p className="text-sm text-stone-600">
              {avatarPath
                ? 'Photo privée visible aux membres de tes espaces.'
                : 'Aucune photo choisie.'}
            </p>
          </div>
        </div>

        {!isOnline && (
          <p className="text-sm text-amber-800">
            Connecte-toi à Internet pour modifier la photo. Tes initiales restent visibles sans
            connexion.
          </p>
        )}
        {actionError && (
          <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
            {actionError}
          </p>
        )}
        {notice && (
          <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-900" role="status">
            {notice}
          </p>
        )}

        <div className="space-y-3">
          <label className="block space-y-2 text-sm font-medium" htmlFor="profile-avatar-file">
            <span>Choisir une photo</span>
            <input
              accept="image/jpeg,image/png,image/webp"
              className="block min-h-11 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm"
              disabled={!isOnline || busy}
              id="profile-avatar-file"
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null
                event.currentTarget.value = ''
                setActionError(null)
                setNotice(null)
                if (file) {
                  try {
                    validateAvatarFile(file)
                    selectFile(file)
                  } catch (failure) {
                    selectFile(null)
                    const message =
                      failure instanceof Error ? failure.message : 'Fichier image invalide.'
                    setActionError(message)
                  }
                } else {
                  selectFile(null)
                }
              }}
              type="file"
            />
          </label>
          {selectedFile && (
            <div className="space-y-3">
              <p className="truncate text-sm text-stone-600">{selectedFile.name}</p>
              <div
                aria-label="Recadrage de la photo. Fais glisser l’image pour la déplacer."
                className="relative mx-auto size-64 touch-none overflow-hidden rounded-full border-2 border-emerald-600 bg-stone-100"
                onPointerDown={(event) => {
                  if (!imageDimensions || !cropRect) return
                  event.currentTarget.setPointerCapture(event.pointerId)
                  pointerStart.current = {
                    pointerId: event.pointerId,
                    x: event.clientX,
                    y: event.clientY,
                    centerX: (cropRect.x + cropRect.size / 2) / imageDimensions.width,
                    centerY: (cropRect.y + cropRect.size / 2) / imageDimensions.height,
                    scale,
                  }
                }}
                onPointerMove={(event) => {
                  if (pointerStart.current?.pointerId === event.pointerId) {
                    moveCrop(event.clientX, event.clientY)
                  }
                }}
                onPointerUp={(event) => {
                  if (pointerStart.current?.pointerId === event.pointerId) {
                    pointerStart.current = null
                    event.currentTarget.releasePointerCapture(event.pointerId)
                  }
                }}
                onKeyDown={(event) => {
                  const offsets: Record<string, [number, number]> = {
                    ArrowDown: [0, 0.02],
                    ArrowLeft: [-0.02, 0],
                    ArrowRight: [0.02, 0],
                    ArrowUp: [0, -0.02],
                  }
                  const offset = offsets[event.key]
                  if (!offset) return
                  event.preventDefault()
                  setCrop((current) => ({
                    ...current,
                    centerX: current.centerX + offset[0],
                    centerY: current.centerY + offset[1],
                  }))
                }}
                role="group"
                tabIndex={0}
              >
                {previewUrl && imageDimensions && cropRect && (
                  <img
                    alt=""
                    className="pointer-events-none absolute max-w-none select-none"
                    draggable={false}
                    src={previewUrl}
                    style={{
                      left: 128 - (cropRect.x + cropRect.size / 2) * scale,
                      top: 128 - (cropRect.y + cropRect.size / 2) * scale,
                      width: imageDimensions.width * scale,
                      height: imageDimensions.height * scale,
                    }}
                  />
                )}
              </div>
              <p className="text-center text-sm text-stone-600">
                Fais glisser l’image ou utilise les flèches du clavier, puis règle le zoom.
              </p>
              <label className="block space-y-1 text-sm" htmlFor="profile-avatar-zoom">
                <span className="font-medium">Zoom</span>
                <input
                  className="min-h-11 w-full accent-emerald-700"
                  id="profile-avatar-zoom"
                  max="3"
                  min="1"
                  onChange={(event) => {
                    setCrop((current) => ({ ...current, zoom: Number(event.target.value) }))
                  }}
                  step="0.01"
                  type="range"
                  value={crop.zoom}
                />
              </label>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              className="min-h-11"
              disabled={!selectedFile || !imageDimensions || !isOnline || busy}
              onClick={() => void uploadSelectedPhoto()}
              type="button"
            >
              {busy ? 'Traitement…' : 'Enregistrer la photo'}
            </Button>
            {avatarPath && (
              <Button
                className="min-h-11"
                disabled={!isOnline || busy}
                onClick={() => void removePhoto()}
                type="button"
                variant="outline"
              >
                Retirer la photo
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
