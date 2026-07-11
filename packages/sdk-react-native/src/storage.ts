import AsyncStorage from '@react-native-async-storage/async-storage'

const ANON_KEY = '@onramp/anonymous_id'
const SESSION_KEY = '@onramp/session'

interface StoredAnonId { id: string; createdAt: number }

export async function getOrCreateAnonymousId(uuidFn: () => string, maxAgeMs: number): Promise<string> {
  const raw = await AsyncStorage.getItem(ANON_KEY)
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as StoredAnonId
      if (Date.now() - parsed.createdAt < maxAgeMs) return parsed.id
      // expired — fall through to generate a new one
    } catch {
      // legacy plain-string ID — migrate to JSON format, age clock starts now
      const migrated: StoredAnonId = { id: raw, createdAt: Date.now() }
      await AsyncStorage.setItem(ANON_KEY, JSON.stringify(migrated))
      return migrated.id
    }
  }
  const newId: StoredAnonId = { id: uuidFn(), createdAt: Date.now() }
  await AsyncStorage.setItem(ANON_KEY, JSON.stringify(newId))
  return newId.id
}

export interface StoredSession {
  id: string
  lastActive: number
  stepCounter: number
}

export async function loadSession(): Promise<StoredSession | null> {
  try {
    const raw = await AsyncStorage.getItem(SESSION_KEY)
    return raw ? (JSON.parse(raw) as StoredSession) : null
  } catch {
    return null
  }
}

export function saveSession(session: StoredSession): void {
  // fire-and-forget - never block the event path on storage
  AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session)).catch(() => {})
}
