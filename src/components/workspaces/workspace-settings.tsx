import { useState, type FormEvent } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { Membership, Workspace } from '@/data/models'
import { archiveSharedWorkspace, updateWorkspaceName } from '@/data/workspaces'

interface WorkspaceSettingsProps {
  client: SupabaseClient
  userId: string
  workspace: Workspace | undefined
  memberships: Membership[]
  isOnline: boolean
  fallbackWorkspaceId: string | undefined
  onRefresh: (workspaceId?: string) => void
}

function failureMessage(failure: unknown): string {
  return failure instanceof Error ? failure.message : 'Une erreur inconnue est survenue.'
}

export function WorkspaceSettings({
  client,
  userId,
  workspace,
  memberships,
  isOnline,
  fallbackWorkspaceId,
  onRefresh,
}: WorkspaceSettingsProps) {
  const [name, setName] = useState(workspace?.name ?? '')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const role = memberships.find((membership) => membership.user_id === userId)?.role
  const canManage =
    workspace?.owner_id === userId && (workspace.type === 'personal' || role === 'owner')

  async function saveName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!workspace || !canManage || busy) return
    setError(null)
    setNotice(null)
    setBusy(true)
    try {
      const updated = await updateWorkspaceName(client, workspace.id, name)
      setName(updated.name)
      setNotice('Le nom de l’espace a été mis à jour.')
      onRefresh(updated.id)
    } catch (failure) {
      setError(failureMessage(failure))
    } finally {
      setBusy(false)
    }
  }

  async function archiveWorkspace() {
    if (!workspace || !canManage || !fallbackWorkspaceId || busy) return
    if (
      !window.confirm(
        `Archiver « ${workspace.name} » ? Il disparaîtra des espaces actifs, mais ses données ne seront pas supprimées.`,
      )
    ) {
      return
    }

    setError(null)
    setNotice(null)
    setBusy(true)
    try {
      await archiveSharedWorkspace(client, workspace.id)
      onRefresh(fallbackWorkspaceId)
    } catch (failure) {
      setError(failureMessage(failure))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby="workspace-settings-title" className="max-w-3xl space-y-5">
      <div>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl" id="workspace-settings-title">
          Réglages de l’espace
        </h1>
        <p className="mt-2 leading-7 text-stone-600">
          Le propriétaire peut modifier le nom ou archiver un espace partagé.
        </p>
      </div>

      {error && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900" role="status">
          {notice}
        </p>
      )}

      {!workspace ? (
        <p className="rounded-xl border border-stone-200 bg-white p-4 text-sm text-stone-600">
          Aucun espace actif à régler.
        </p>
      ) : (
        <>
          <Card className="rounded-2xl border-0 shadow-sm ring-stone-200">
            <CardHeader>
              <CardTitle>Nom de l’espace</CardTitle>
              <CardDescription>
                {workspace.type === 'shared' ? 'Espace partagé' : 'Espace personnel'} ·{' '}
                {canManage ? 'Tu es propriétaire.' : 'Seul le propriétaire peut modifier ce nom.'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {canManage ? (
                <form className="flex flex-col gap-3 sm:flex-row" onSubmit={saveName}>
                  <label className="sr-only" htmlFor="workspace-settings-name">
                    Nom de l’espace
                  </label>
                  <input
                    className="min-h-12 min-w-0 flex-1 rounded-xl border border-stone-300 bg-white px-4"
                    disabled={!isOnline || busy}
                    id="workspace-settings-name"
                    maxLength={80}
                    minLength={1}
                    onChange={(event) => setName(event.target.value)}
                    required
                    value={name}
                  />
                  <Button
                    className="min-h-12"
                    disabled={!isOnline || busy || name.trim() === workspace.name}
                    type="submit"
                  >
                    {busy ? 'Enregistrement…' : 'Enregistrer'}
                  </Button>
                </form>
              ) : (
                <p className="rounded-xl bg-stone-50 px-4 py-3 font-medium">{workspace.name}</p>
              )}
              {!isOnline && canManage && (
                <p className="mt-3 text-sm text-amber-800">
                  Connecte-toi à Internet pour modifier les réglages de l’espace.
                </p>
              )}
            </CardContent>
          </Card>

          {workspace.type === 'shared' && canManage && (
            <Card className="rounded-2xl border border-red-200 shadow-sm">
              <CardHeader>
                <CardTitle>Archiver cet espace</CardTitle>
                <CardDescription>
                  L’espace sera retiré des espaces actifs. Les données ne sont pas effacées.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  className="min-h-11 text-red-800"
                  disabled={!isOnline || busy || !fallbackWorkspaceId}
                  onClick={() => void archiveWorkspace()}
                  type="button"
                  variant="outline"
                >
                  Archiver l’espace
                </Button>
                {!fallbackWorkspaceId && (
                  <p className="mt-3 text-sm text-stone-600">
                    Un autre espace actif est requis avant l’archivage.
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </section>
  )
}
