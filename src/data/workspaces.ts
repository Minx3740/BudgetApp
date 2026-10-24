import type { SupabaseClient } from '@supabase/supabase-js'
import { invitationSchema, workspaceSchema, type Invitation, type Workspace } from './models'

export type InvitationRole = 'member' | 'viewer'

const sharedWorkspaceDefaults = {
  accounts: [
    { name: 'Espèces', type: 'cash' },
    { name: 'Mobile money', type: 'mobile_money' },
    { name: 'Banque', type: 'bank' },
  ],
  categories: [
    { name: 'Alimentation', kind: 'expense', icon: 'shopping-basket', color: '#e07a5f' },
    { name: 'Transport', kind: 'expense', icon: 'bus', color: '#3d8b8b' },
    { name: 'Logement', kind: 'expense', icon: 'house', color: '#6c63a8' },
    { name: 'Santé', kind: 'expense', icon: 'heart-pulse', color: '#d45d79' },
    { name: 'Loisirs', kind: 'expense', icon: 'sparkles', color: '#d29b35' },
    { name: 'Autres dépenses', kind: 'expense', icon: 'ellipsis', color: '#718096' },
    { name: 'Salaire', kind: 'income', icon: 'briefcase', color: '#3f8f67' },
    { name: 'Autres revenus', kind: 'income', icon: 'circle-plus', color: '#4b83b5' },
  ],
} as const

function parseWorkspace(value: unknown): Workspace {
  const result = workspaceSchema.safeParse(value)
  if (!result.success) {
    throw new Error(
      `Le serveur a renvoyé un espace invalide : ${result.error.issues[0]?.message ?? 'format incorrect'}`,
    )
  }
  return result.data
}

function parseInvitation(value: unknown): Invitation {
  const result = invitationSchema.safeParse(value)
  if (!result.success) {
    throw new Error(
      `Le serveur a renvoyé une invitation invalide : ${result.error.issues[0]?.message ?? 'format incorrect'}`,
    )
  }
  return result.data
}

export function createInvitationToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function hashInvitationToken(token: string): Promise<string> {
  const bytes = new TextEncoder().encode(token)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function createSharedWorkspace(
  client: SupabaseClient,
  userId: string,
  name: string,
): Promise<Workspace> {
  const normalizedName = name.trim()
  if (normalizedName.length < 1 || normalizedName.length > 80) {
    throw new Error('Le nom de l’espace doit contenir entre 1 et 80 caractères.')
  }

  const { data, error } = await client
    .from('workspaces')
    .insert({ name: normalizedName, type: 'shared', owner_id: userId })
    .select('*')
    .single()
  if (error) throw new Error(`Impossible de créer l’espace partagé. ${error.message}`)
  const workspace = parseWorkspace(data)

  const { error: accountError } = await client.from('accounts').insert(
    sharedWorkspaceDefaults.accounts.map((account) => ({
      id: crypto.randomUUID(),
      ...account,
      workspace_id: workspace.id,
    })),
  )
  if (accountError) {
    throw new Error(
      `L’espace « ${workspace.name} » a été créé, mais ses comptes par défaut n’ont pas pu être préparés. ${accountError.message}`,
    )
  }

  const { error: categoryError } = await client.from('categories').insert(
    sharedWorkspaceDefaults.categories.map((category) => ({
      id: crypto.randomUUID(),
      ...category,
      workspace_id: workspace.id,
    })),
  )
  if (categoryError) {
    throw new Error(
      `L’espace « ${workspace.name} » et ses comptes ont été créés, mais ses catégories par défaut n’ont pas pu être préparées. ${categoryError.message}`,
    )
  }

  return workspace
}

export async function createWorkspaceInvitation(
  client: SupabaseClient,
  workspaceId: string,
  userId: string,
  role: InvitationRole,
): Promise<{ invitation: Invitation; token: string }> {
  const token = createInvitationToken()
  const tokenHash = await hashInvitationToken(token)
  const { data, error } = await client
    .from('invitations')
    .insert({
      id: crypto.randomUUID(),
      workspace_id: workspaceId,
      token_hash: tokenHash,
      role,
      max_uses: 1,
      created_by: userId,
    })
    .select('*')
    .single()
  if (error) throw new Error(`Impossible de créer l’invitation. ${error.message}`)

  return { invitation: parseInvitation(data), token }
}

export async function acceptWorkspaceInvitation(
  client: SupabaseClient,
  token: string,
): Promise<string> {
  if (!/^[0-9a-f]{64}$/i.test(token)) {
    throw new Error('Ce lien d’invitation est invalide.')
  }
  const { data, error } = await client.rpc('accept_invitation', { p_token: token })
  if (error) {
    if (error.message.includes('invitation_unavailable')) {
      throw new Error('Cette invitation a expiré, a été révoquée ou a déjà été utilisée.')
    }
    if (error.message.includes('invalid_invitation')) {
      throw new Error('Ce lien d’invitation est invalide ou n’existe plus.')
    }
    throw new Error(`Impossible d’accepter l’invitation. ${error.message}`)
  }
  if (typeof data !== 'string' || !/^[0-9a-f-]{36}$/i.test(data)) {
    throw new Error('Le serveur n’a pas confirmé l’espace rejoint.')
  }
  return data
}

export async function revokeWorkspaceInvitation(
  client: SupabaseClient,
  workspaceId: string,
  invitationId: string,
): Promise<void> {
  const { data, error } = await client
    .from('invitations')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', invitationId)
    .eq('workspace_id', workspaceId)
    .is('revoked_at', null)
    .select('id')
    .maybeSingle()
  if (error) throw new Error(`Impossible de révoquer l’invitation. ${error.message}`)
  if (!data) throw new Error('Cette invitation est déjà révoquée ou n’est plus disponible.')
}

export async function updateWorkspaceMemberRole(
  client: SupabaseClient,
  workspaceId: string,
  userId: string,
  role: InvitationRole,
): Promise<void> {
  const { data, error } = await client
    .from('memberships')
    .update({ role })
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .neq('role', 'owner')
    .select('workspace_id')
    .maybeSingle()
  if (error) throw new Error(`Impossible de modifier le rôle du membre. ${error.message}`)
  if (!data) throw new Error('Le rôle du membre n’a pas été modifié.')
}

export async function removeWorkspaceMember(
  client: SupabaseClient,
  workspaceId: string,
  userId: string,
): Promise<void> {
  const { data, error } = await client
    .from('memberships')
    .delete()
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .neq('role', 'owner')
    .select('workspace_id')
    .maybeSingle()
  if (error) throw new Error(`Impossible de retirer le membre. ${error.message}`)
  if (!data) throw new Error('Le membre n’a pas été retiré.')
}
