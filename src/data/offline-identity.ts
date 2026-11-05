import { z } from 'zod'

const offlineIdentityKey = 'cashFlow.offlineIdentity'

const offlineIdentitySchema = z.object({
  id: z.string().uuid(),
  email: z.string().nullable(),
  user_metadata: z.object({ display_name: z.unknown().optional() }),
})

export type OfflineIdentity = z.infer<typeof offlineIdentitySchema>

export interface KeyValueStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export function readOfflineIdentity(storage: KeyValueStorage): OfflineIdentity | null {
  let serialized: string | null
  try {
    serialized = storage.getItem(offlineIdentityKey)
  } catch (failure) {
    console.error('Impossible de lire l’identité locale hors ligne.', failure)
    return null
  }
  if (serialized === null) return null

  let value: unknown
  try {
    value = JSON.parse(serialized)
  } catch {
    clearOfflineIdentity(storage)
    return null
  }

  const result = offlineIdentitySchema.safeParse(value)
  if (!result.success) {
    clearOfflineIdentity(storage)
    return null
  }
  return result.data
}

export function saveOfflineIdentity(identity: OfflineIdentity, storage: KeyValueStorage): void {
  const result = offlineIdentitySchema.safeParse(identity)
  if (!result.success) {
    throw new Error('Impossible de conserver une identité utilisateur invalide.')
  }

  try {
    storage.setItem(offlineIdentityKey, JSON.stringify(result.data))
  } catch (failure) {
    console.error('Impossible de conserver l’identité locale hors ligne.', failure)
  }
}

export function clearOfflineIdentity(storage: KeyValueStorage): void {
  try {
    storage.removeItem(offlineIdentityKey)
  } catch (failure) {
    console.error('Impossible de supprimer l’identité locale hors ligne.', failure)
  }
}

export function isNetworkUnavailableError(failure: unknown): boolean {
  if (failure instanceof TypeError) return true
  if (!(failure instanceof Error)) return false

  const message = failure.message.toLowerCase()
  return (
    message.includes('failed to fetch') ||
    message.includes('networkerror') ||
    message.includes('network request failed') ||
    message.includes('load failed')
  )
}

export function offlineIdentityForNetworkFailure(
  failure: unknown,
  cachedIdentity: OfflineIdentity | null,
): OfflineIdentity | null {
  return cachedIdentity && isNetworkUnavailableError(failure) ? cachedIdentity : null
}
