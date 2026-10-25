import { useState, type FormEvent } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { db } from '@/data/database'
import type { Profile } from '@/data/models'

interface ProfileDisplayNameProps {
  client: SupabaseClient
  profile: Profile | undefined
  userId: string
  displayName: string
  isOnline: boolean
}

export function ProfileDisplayName({
  client,
  profile,
  userId,
  displayName,
  isOnline,
}: ProfileDisplayNameProps) {
  const [name, setName] = useState(displayName)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function saveDisplayName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const normalizedName = name.trim()
    if (!profile || !isOnline || busy) return
    if (!normalizedName || normalizedName.length > 80) {
      setError('Saisis un nom de 1 à 80 caractères.')
      return
    }

    setError(null)
    setNotice(null)
    setBusy(true)
    try {
      const { data, error: updateError } = await client
        .from('profiles')
        .update({ display_name: normalizedName })
        .eq('id', userId)
        .select('id, display_name, updated_at')
        .maybeSingle()
      if (updateError) {
        throw new Error(`Impossible d’enregistrer le nom. ${updateError.message}`)
      }
      if (!data) {
        throw new Error('Le profil ne peut pas être modifié ou n’existe plus.')
      }

      await db.profiles.put({
        ...profile,
        display_name: data.display_name,
        updated_at: data.updated_at,
      })
      setName(data.display_name)
      setNotice('Nom affiché mis à jour.')
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Erreur inconnue.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="rounded-2xl border-0 shadow-sm ring-stone-200">
      <CardHeader>
        <CardTitle>Nom affiché</CardTitle>
        <CardDescription>Ce nom apparaît dans les espaces et les transactions.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!isOnline && (
          <p className="text-sm text-amber-800">Connecte-toi à Internet pour changer ton nom.</p>
        )}
        {error && (
          <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-900" role="status">
            {notice}
          </p>
        )}
        <form
          className="flex flex-col gap-3 sm:flex-row"
          onSubmit={(event) => void saveDisplayName(event)}
        >
          <label
            className="min-w-0 flex-1 space-y-1.5 text-sm font-medium"
            htmlFor="profile-display-name"
          >
            <span>Ton nom</span>
            <input
              autoComplete="name"
              className="min-h-12 w-full rounded-xl border border-stone-300 bg-white px-3"
              disabled={!isOnline || !profile || busy}
              id="profile-display-name"
              maxLength={80}
              onChange={(event) => setName(event.target.value)}
              required
              value={name}
            />
          </label>
          <Button
            className="min-h-12 self-end"
            disabled={!isOnline || !profile || busy}
            type="submit"
          >
            {busy ? 'Enregistrement…' : 'Enregistrer le nom'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
