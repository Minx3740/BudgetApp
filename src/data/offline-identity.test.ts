import { describe, expect, it } from 'vitest'
import {
  clearOfflineIdentity,
  isNetworkUnavailableError,
  offlineIdentityForNetworkFailure,
  readOfflineIdentity,
  saveOfflineIdentity,
  type KeyValueStorage,
  type OfflineIdentity,
} from './offline-identity'

const identity: OfflineIdentity = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  email: 'lara@example.test',
  user_metadata: { display_name: 'Lara' },
}

function createStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial))
  const storage: KeyValueStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => {
      values.delete(key)
    },
  }
  return { storage, values }
}

describe('offline identity', () => {
  it('stores only the identity needed to reopen local data', () => {
    const { storage, values } = createStorage()

    saveOfflineIdentity(identity, storage)

    const stored = values.get('cashFlow.offlineIdentity')
    expect(stored).toBeDefined()
    expect(JSON.parse(stored ?? '{}')).toEqual(identity)
    expect(stored).not.toContain('token')
  })

  it('restores a valid cached identity', () => {
    const { storage } = createStorage({
      'cashFlow.offlineIdentity': JSON.stringify(identity),
    })

    expect(readOfflineIdentity(storage)).toEqual(identity)
  })

  it('removes malformed cached identity data', () => {
    const { storage, values } = createStorage({
      'cashFlow.offlineIdentity': '{invalid',
    })

    expect(readOfflineIdentity(storage)).toBeNull()
    expect(values.has('cashFlow.offlineIdentity')).toBe(false)
  })

  it('removes cached values that do not match the identity schema', () => {
    const { storage, values } = createStorage({
      'cashFlow.offlineIdentity': JSON.stringify({ id: 'not-a-uuid' }),
    })

    expect(readOfflineIdentity(storage)).toBeNull()
    expect(values.has('cashFlow.offlineIdentity')).toBe(false)
  })

  it('clears the cached identity on explicit local sign-out', () => {
    const { storage, values } = createStorage({
      'cashFlow.offlineIdentity': JSON.stringify(identity),
    })

    clearOfflineIdentity(storage)

    expect(values.has('cashFlow.offlineIdentity')).toBe(false)
  })

  it('recognizes fetch failures but not authentication errors as network outages', () => {
    expect(isNetworkUnavailableError(new TypeError('Failed to fetch'))).toBe(true)
    expect(isNetworkUnavailableError(new Error('Invalid refresh token'))).toBe(false)
    expect(isNetworkUnavailableError('Failed to fetch')).toBe(false)
  })

  it('uses the cached identity only when session loading fails for network reasons', () => {
    expect(offlineIdentityForNetworkFailure(new Error('Failed to fetch'), identity)).toEqual(
      identity,
    )
    expect(
      offlineIdentityForNetworkFailure(new Error('Invalid refresh token'), identity),
    ).toBeNull()
    expect(offlineIdentityForNetworkFailure(new Error('Failed to fetch'), null)).toBeNull()
  })
})
