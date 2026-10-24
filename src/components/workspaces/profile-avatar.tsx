import { useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { profileAvatarPath, resizeAvatar, validateAvatarFile } from '@/data/avatars'
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
  const [actionError, setActionError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function uploadSelectedPhoto() {
    if (!selectedFile || !isOnline || busy) return
    setActionError(null)
    setNotice(null)
    setBusy(true)
    try {
      validateAvatarFile(selectedFile)
      const resizedAvatar = await resizeAvatar(selectedFile)
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

      setSelectedFile(null)
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
            Connecte-toi à Internet pour modifier la photo. Tes initiales restent visibles hors
            ligne.
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
                setSelectedFile(null)
                if (file) {
                  try {
                    validateAvatarFile(file)
                    setSelectedFile(file)
                  } catch (failure) {
                    const message =
                      failure instanceof Error ? failure.message : 'Fichier image invalide.'
                    setActionError(message)
                  }
                }
              }}
              type="file"
            />
          </label>
          {selectedFile && <p className="truncate text-sm text-stone-600">{selectedFile.name}</p>}
          <div className="flex flex-wrap gap-2">
            <Button
              className="min-h-11"
              disabled={!selectedFile || !isOnline || busy}
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
