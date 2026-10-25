import { useEffect, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Invitation, Membership, Profile, Workspace } from '@/data/models'
import {
  acceptWorkspaceInvitation,
  createSharedWorkspace,
  createWorkspaceInvitation,
  removeWorkspaceMember,
  revokeWorkspaceInvitation,
  updateWorkspaceMemberRole,
  type InvitationRole,
} from '@/data/workspaces'
import { SignedAvatar } from './signed-avatar'

interface WorkspaceManagementProps {
  client: SupabaseClient
  userId: string
  workspace: Workspace | undefined
  memberships: Membership[]
  profiles: Profile[]
  invitations: Invitation[]
  isOnline: boolean
  onRefresh: (workspaceId?: string) => void
}

function displayError(failure: unknown): string {
  return failure instanceof Error ? failure.message : 'Une erreur inconnue est survenue.'
}

function displayName(userId: string, profiles: Profile[]): string {
  const profile = profiles.find((candidate) => candidate.id === userId)
  return profile?.display_name.trim() || userId
}

function roleName(role: Membership['role']): string {
  if (role === 'owner') return 'Propriétaire'
  if (role === 'member') return 'Membre'
  return 'Lecture seule'
}

export function InvitationAcceptance({
  client,
  token,
  isOnline,
  onAccepted,
  onCancel,
}: {
  client: SupabaseClient
  token: string
  isOnline: boolean
  onAccepted: (workspaceId: string) => void
  onCancel: () => void
}) {
  const [error, setError] = useState<string | null>(null)
  const [isAccepting, setIsAccepting] = useState(false)

  async function acceptInvitation() {
    setError(null)
    setIsAccepting(true)
    try {
      const workspaceId = await acceptWorkspaceInvitation(client, token)
      onAccepted(workspaceId)
    } catch (failure) {
      setError(displayError(failure))
    } finally {
      setIsAccepting(false)
    }
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-stone-50 px-5 py-10">
      <Card className="w-full max-w-lg rounded-3xl border-0 shadow-sm ring-stone-200">
        <CardHeader>
          <CardTitle>Invitation à un espace partagé</CardTitle>
          <CardDescription>
            En acceptant, tu auras accès aux données de l’espace partagé.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
              {error}
            </p>
          )}
          {!isOnline && (
            <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Connecte-toi à Internet pour accepter cette invitation.
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            <Button
              className="min-h-12"
              disabled={!isOnline || isAccepting}
              onClick={() => void acceptInvitation()}
              type="button"
            >
              {isAccepting ? 'Acceptation…' : 'Accepter l’invitation'}
            </Button>
            <Button className="min-h-12" onClick={onCancel} type="button" variant="outline">
              Plus tard
            </Button>
          </div>
        </CardContent>
      </Card>
    </main>
  )
}

export function WorkspaceManagement({
  client,
  userId,
  workspace,
  memberships,
  profiles,
  invitations,
  isOnline,
  onRefresh,
}: WorkspaceManagementProps) {
  const [workspaceName, setWorkspaceName] = useState('')
  const [invitationRole, setInvitationRole] = useState<InvitationRole>('member')
  const [newInvitationLink, setNewInvitationLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [currentTime, setCurrentTime] = useState(() => Date.now())

  useEffect(() => {
    const intervalId = window.setInterval(() => setCurrentTime(Date.now()), 60_000)
    return () => window.clearInterval(intervalId)
  }, [])

  const currentRole = memberships.find((membership) => membership.user_id === userId)?.role
  const isOwner = currentRole === 'owner'
  const activeInvitations = invitations
    .filter(
      (invitation) =>
        invitation.deleted_at === null &&
        invitation.revoked_at === null &&
        invitation.used_count < (invitation.max_uses ?? Number.POSITIVE_INFINITY) &&
        Date.parse(invitation.expires_at) > currentTime,
    )
    .sort((left, right) => left.expires_at.localeCompare(right.expires_at))

  async function createWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setNotice(null)
    setBusyKey('workspace')
    try {
      const created = await createSharedWorkspace(client, userId, workspaceName)
      setWorkspaceName('')
      setNotice(`L’espace « ${created.name} » est prêt.`)
      onRefresh(created.id)
    } catch (failure) {
      setError(displayError(failure))
    } finally {
      setBusyKey(null)
    }
  }

  async function createInvitation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!workspace || !isOwner) return
    setError(null)
    setNotice(null)
    setNewInvitationLink(null)
    setCopied(false)
    setBusyKey('invitation')
    try {
      const { token } = await createWorkspaceInvitation(
        client,
        workspace.id,
        userId,
        invitationRole,
      )
      const applicationUrl = new URL(import.meta.env.BASE_URL, window.location.origin)
      applicationUrl.hash = `invite=${encodeURIComponent(token)}`
      setNewInvitationLink(applicationUrl.toString())
      setNotice('Lien créé pour 7 jours et une seule utilisation. Copie-le maintenant.')
      onRefresh(workspace.id)
    } catch (failure) {
      setError(displayError(failure))
    } finally {
      setBusyKey(null)
    }
  }

  async function copyInvitationLink() {
    if (!newInvitationLink) return
    setError(null)
    try {
      await navigator.clipboard.writeText(newInvitationLink)
      setCopied(true)
    } catch (failure) {
      setError(`Impossible de copier le lien. ${displayError(failure)}`)
    }
  }

  async function revokeInvitation(invitationId: string) {
    if (!workspace) return
    if (
      !window.confirm(
        'Révoquer cette invitation ? Le lien ne permettra plus de rejoindre cet espace.',
      )
    ) {
      return
    }
    setError(null)
    setNotice(null)
    setBusyKey(invitationId)
    try {
      await revokeWorkspaceInvitation(client, workspace.id, invitationId)
      setNotice('Invitation révoquée.')
      onRefresh(workspace.id)
    } catch (failure) {
      setError(displayError(failure))
    } finally {
      setBusyKey(null)
    }
  }

  async function changeRole(member: Membership, role: InvitationRole) {
    if (!workspace) return
    setError(null)
    setNotice(null)
    setBusyKey(member.user_id)
    try {
      await updateWorkspaceMemberRole(client, workspace.id, member.user_id, role)
      setNotice(`Rôle de ${displayName(member.user_id, profiles)} mis à jour.`)
      onRefresh(workspace.id)
    } catch (failure) {
      setError(displayError(failure))
    } finally {
      setBusyKey(null)
    }
  }

  async function removeMember(member: Membership) {
    if (!workspace) return
    if (!window.confirm(`Retirer ${displayName(member.user_id, profiles)} de cet espace ?`)) {
      return
    }
    setError(null)
    setNotice(null)
    setBusyKey(member.user_id)
    try {
      await removeWorkspaceMember(client, workspace.id, member.user_id)
      setNotice(`${displayName(member.user_id, profiles)} n’a plus accès à cet espace.`)
      onRefresh(workspace.id)
    } catch (failure) {
      setError(displayError(failure))
    } finally {
      setBusyKey(null)
    }
  }

  return (
    <section aria-labelledby="spaces-title" className="max-w-4xl">
      <div className="mb-6">
        <p className="mb-2 text-sm font-medium text-emerald-800">Espaces</p>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl" id="spaces-title">
          Espaces partagés
        </h1>
        <p className="mt-3 max-w-2xl leading-7 text-stone-600">
          Les données restent disponibles hors-ligne et se synchronisent quand tu es en ligne.
          L’acceptation d’une invitation nécessite une connexion.
        </p>
      </div>

      {error && (
        <p className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p
          className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
          role="status"
        >
          {notice}
        </p>
      )}

      <Card className="rounded-2xl border-0 shadow-sm ring-stone-200">
        <CardHeader>
          <CardTitle>Créer un espace</CardTitle>
          <CardDescription>Un espace partagé comprend des catégories de départ.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-3 sm:flex-row"
            onSubmit={(event) => void createWorkspace(event)}
          >
            <label className="sr-only" htmlFor="shared-workspace-name">
              Nom de l’espace
            </label>
            <input
              autoComplete="off"
              className="min-h-12 min-w-0 flex-1 rounded-xl border border-stone-300 px-4"
              id="shared-workspace-name"
              maxLength={80}
              onChange={(event) => setWorkspaceName(event.target.value)}
              placeholder="Ex. Colocation"
              required
              value={workspaceName}
            />
            <Button className="min-h-12" disabled={!isOnline || busyKey !== null} type="submit">
              {busyKey === 'workspace' ? 'Création…' : 'Créer l’espace'}
            </Button>
          </form>
          {!isOnline && (
            <p className="mt-3 text-sm text-amber-800">
              La création d’un espace nécessite une connexion Internet.
            </p>
          )}
        </CardContent>
      </Card>

      {workspace?.type === 'shared' && (
        <>
          <Card className="mt-5 rounded-2xl border-0 shadow-sm ring-stone-200">
            <CardHeader>
              <CardTitle>{workspace.name}</CardTitle>
              <CardDescription>
                Ton rôle : {currentRole ? roleName(currentRole) : 'chargement…'}
              </CardDescription>
            </CardHeader>
            {isOwner && (
              <CardContent className="space-y-4">
                <form
                  className="grid gap-3 sm:grid-cols-[1fr_auto]"
                  onSubmit={(event) => void createInvitation(event)}
                >
                  <label className="sr-only" htmlFor="invitation-role">
                    Rôle du nouveau membre
                  </label>
                  <select
                    className="min-h-12 rounded-xl border border-stone-300 bg-white px-3"
                    disabled={!isOnline || busyKey !== null}
                    id="invitation-role"
                    onChange={(event) => setInvitationRole(event.target.value as InvitationRole)}
                    value={invitationRole}
                  >
                    <option value="member">Membre — peut modifier</option>
                    <option value="viewer">Lecture seule</option>
                  </select>
                  <Button
                    className="min-h-12"
                    disabled={!isOnline || busyKey !== null}
                    type="submit"
                  >
                    {busyKey === 'invitation' ? 'Création…' : 'Créer un lien d’invitation'}
                  </Button>
                </form>
                {newInvitationLink && (
                  <div className="space-y-2 rounded-xl bg-stone-50 p-4">
                    <label className="block text-sm font-medium" htmlFor="new-invitation-link">
                      Lien à transmettre (visible uniquement maintenant)
                    </label>
                    <textarea
                      className="min-h-20 w-full break-all rounded-lg border border-stone-300 bg-white p-3 text-sm"
                      id="new-invitation-link"
                      readOnly
                      value={newInvitationLink}
                    />
                    <Button
                      className="min-h-11"
                      onClick={() => void copyInvitationLink()}
                      type="button"
                    >
                      {copied ? 'Lien copié' : 'Copier le lien'}
                    </Button>
                  </div>
                )}
                <div className="space-y-2">
                  <h3 className="font-semibold">Invitations actives</h3>
                  {activeInvitations.length === 0 ? (
                    <p className="text-sm text-stone-600">Aucune invitation active.</p>
                  ) : (
                    activeInvitations.map((invitation) => (
                      <div
                        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-stone-200 p-3"
                        key={invitation.id}
                      >
                        <div className="text-sm">
                          <p className="font-medium">
                            {invitation.role === 'member' ? 'Membre' : 'Lecture seule'}
                          </p>
                          <p className="text-stone-600">
                            Expire le{' '}
                            {new Intl.DateTimeFormat('fr-FR').format(
                              new Date(invitation.expires_at),
                            )}
                          </p>
                        </div>
                        <Button
                          className="min-h-11"
                          disabled={!isOnline || busyKey !== null}
                          onClick={() => void revokeInvitation(invitation.id)}
                          type="button"
                          variant="outline"
                        >
                          Révoquer
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            )}
          </Card>

          <Card className="mt-5 rounded-2xl border-0 shadow-sm ring-stone-200">
            <CardHeader>
              <CardTitle>Membres</CardTitle>
              <CardDescription>
                Les propriétaires ne peuvent pas être retirés ni rétrogradés.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {memberships.map((member) => {
                const name = displayName(member.user_id, profiles)
                const profile = profiles.find((candidate) => candidate.id === member.user_id)
                const initials = name
                  .trim()
                  .split(/\s+/)
                  .slice(0, 2)
                  .map((part) => part.charAt(0).toLocaleUpperCase('fr-FR'))
                  .join('')
                return (
                  <div
                    className="flex flex-col gap-3 rounded-xl border border-stone-200 p-3 sm:flex-row sm:items-center sm:justify-between"
                    key={`${member.workspace_id}:${member.user_id}`}
                  >
                    <div className="flex items-center gap-3">
                      <SignedAvatar
                        avatarPath={profile?.avatar_path ?? null}
                        className="size-10 rounded-full text-sm"
                        client={client}
                        displayName={name}
                        initials={initials}
                        showError
                      />
                      <div>
                        <p className="font-medium">{name}</p>
                        <p className="text-sm text-stone-600">{roleName(member.role)}</p>
                      </div>
                    </div>
                    {isOwner && member.role !== 'owner' && (
                      <div className="flex flex-wrap gap-2">
                        <label className="sr-only" htmlFor={`role-${member.user_id}`}>
                          Rôle de {name}
                        </label>
                        <select
                          className="min-h-11 rounded-xl border border-stone-300 bg-white px-3 text-sm"
                          disabled={!isOnline || busyKey !== null}
                          id={`role-${member.user_id}`}
                          onChange={(event) =>
                            void changeRole(member, event.target.value as InvitationRole)
                          }
                          value={member.role}
                        >
                          <option value="member">Membre</option>
                          <option value="viewer">Lecture seule</option>
                        </select>
                        <Button
                          className="min-h-11"
                          disabled={!isOnline || busyKey !== null}
                          onClick={() => void removeMember(member)}
                          type="button"
                          variant="outline"
                        >
                          Retirer
                        </Button>
                      </div>
                    )}
                  </div>
                )
              })}
            </CardContent>
          </Card>
        </>
      )}
    </section>
  )
}
