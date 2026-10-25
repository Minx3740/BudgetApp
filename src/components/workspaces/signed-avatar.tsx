import { useEffect, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'

interface SignedAvatarProps {
  client: SupabaseClient
  avatarPath: string | null
  displayName: string
  initials: string
  className: string
  showError?: boolean
}

export function SignedAvatar({
  client,
  avatarPath,
  displayName,
  initials,
  className,
  showError = false,
}: SignedAvatarProps) {
  if (!avatarPath) {
    return <AvatarInitials className={className} initials={initials} />
  }

  return (
    <SignedAvatarImage
      avatarPath={avatarPath}
      className={className}
      client={client}
      displayName={displayName}
      initials={initials}
      showError={showError}
    />
  )
}

function AvatarInitials({
  className,
  initials,
}: Pick<SignedAvatarProps, 'className' | 'initials'>) {
  return (
    <span
      aria-hidden="true"
      className={`${className} flex items-center justify-center rounded-full bg-emerald-100 font-semibold text-emerald-950`}
    >
      {initials}
    </span>
  )
}

function SignedAvatarImage({
  client,
  avatarPath,
  displayName,
  initials,
  className,
  showError,
}: Omit<SignedAvatarProps, 'avatarPath'> & { avatarPath: string }) {
  const [signedUrl, setSignedUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let isActive = true
    let refreshTimer: number | undefined
    async function refreshSignedUrl() {
      const { data, error: signedUrlError } = await client.storage
        .from('avatars')
        .createSignedUrl(avatarPath, 600)
      if (!isActive) return
      if (signedUrlError) {
        setSignedUrl(null)
        setError(`Impossible d’afficher la photo. ${signedUrlError.message}`)
        return
      }

      setSignedUrl(data.signedUrl)
      setError(null)
      refreshTimer = window.setTimeout(() => void refreshSignedUrl(), 8 * 60 * 1000)
    }

    void refreshSignedUrl().catch((failure: unknown) => {
      if (isActive) {
        const message =
          failure instanceof Error ? failure.message : 'Erreur inconnue de chargement.'
        setSignedUrl(null)
        setError(`Impossible d’afficher la photo. ${message}`)
      }
    })

    return () => {
      isActive = false
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer)
    }
  }, [avatarPath, client])

  return (
    <span className="inline-flex flex-col items-center">
      {signedUrl ? (
        <img
          alt={`Photo de ${displayName}`}
          className={`${className} object-cover`}
          onError={() => {
            setSignedUrl(null)
            setError('Le lien temporaire de la photo a expiré ou est indisponible.')
          }}
          src={signedUrl}
        />
      ) : (
        <AvatarInitials className={className} initials={initials} />
      )}
      {showError && error && (
        <span className="mt-2 text-sm text-amber-800" role="status">
          {error}
        </span>
      )}
    </span>
  )
}
