import { OnRampClient } from '@onramp-sdk/core'
import { getOrCreateAnonymousId, loadSession, saveSession } from './storage.js'
import { AppState } from 'react-native'
import type { AppStateStatus } from 'react-native'
import { Platform } from 'react-native'

// Simple UUID v4 that works without crypto.randomUUID in older RN
function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

const DEFAULT_SESSION_TIMEOUT_MS = 30 * 60 * 1000           // 30 min
const DEFAULT_ANON_MAX_AGE_MS    = 365 * 24 * 60 * 60 * 1000 // 365 days

interface InitConfig {
  apiKey: string
  /** Your app's version string, e.g. "2.4.1". Shown in the dashboard breakdown. */
  appVersion?: string
  host?: string
  /** Quit-and-return within this window continues the same session. Default 30 min. */
  sessionTimeoutMs?: number
  /** Anonymous ID is rotated after this many milliseconds. Default 365 days. */
  anonymousIdMaxAgeMs?: number
}

let client: OnRampClient | null = null
let currentSessionId: string | null = null
let anonymousId: string | null = null
let stepCounter = 0
let sessionTimeoutMs = DEFAULT_SESSION_TIMEOUT_MS
let lastActive = 0

// The OS the app actually runs on. This is the user's *device*, distinct from
// the SDK framework (React Native) which we report separately as `_framework`.
function getPlatform(): 'ios' | 'android' | 'web' | 'other' {
  if (Platform.OS === 'ios') return 'ios'
  if (Platform.OS === 'android') return 'android'
  if (Platform.OS === 'web') return 'web'
  return 'other'
}

// Just the OS version, e.g. "17.2" (iOS) or "34" (Android API level) - the OS
// name lives in `platform`, so we no longer prefix it here.
function getOsVersion(): string {
  return String(Platform.Version)
}

function getDeviceType(): 'phone' | 'tablet' | 'desktop' {
  if (Platform.isTV) return 'desktop'
  if (Platform.OS === 'ios' && Platform.isPad) return 'tablet'
  return 'phone'
}

function persistSession(): void {
  if (!currentSessionId) return
  saveSession({ id: currentSessionId, lastActive, stepCounter })
}

function rotateSession(): void {
  currentSessionId = uuid()
  stepCounter = 0
  lastActive = Date.now()
  persistSession()
}

/** Rotate if the user has been away longer than the session timeout. */
function ensureSessionFresh(): void {
  if (!currentSessionId || Date.now() - lastActive > sessionTimeoutMs) {
    rotateSession()
  }
}

export const OnRamp = {
  async init(config: InitConfig): Promise<void> {
    sessionTimeoutMs = config.sessionTimeoutMs ?? DEFAULT_SESSION_TIMEOUT_MS
    anonymousId = await getOrCreateAnonymousId(uuid, config.anonymousIdMaxAgeMs ?? DEFAULT_ANON_MAX_AGE_MS)

    // Resume the previous session if the user came back within the timeout
    const stored = await loadSession()
    if (stored && Date.now() - stored.lastActive < sessionTimeoutMs) {
      currentSessionId = stored.id
      stepCounter = stored.stepCounter
      lastActive = stored.lastActive
    } else {
      rotateSession()
    }

    client = new OnRampClient({
      apiKey: config.apiKey,
      host: config.host,
      platform: getPlatform(),
      framework: 'react_native',
      appVersion: config.appVersion ?? null,
      uuidFn: uuid,
    })

    AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'background' || state === 'inactive') {
        lastActive = Date.now()
        persistSession()
        client?.flush()
      } else if (state === 'active') {
        ensureSessionFresh()
      }
    })
  },

  step(
    stepName: string,
    options?: {
      /** Custom event properties (e.g. { club_count: 5, user_type: 'free' }) */
      properties?: Record<string, string | number | boolean>
      /** @internal Used by NavigationTracker - not part of the public API */
      _eventType?: 'nav_entered'
    }
  ): void {
    if (!client || !currentSessionId || !anonymousId) {
      if (__DEV__) console.warn('[OnRamp] call OnRamp.init() before tracking steps')
      return
    }

    ensureSessionFresh()
    const index = stepCounter++
    lastActive = Date.now()
    persistSession()

    client.track({
      sessionId: currentSessionId,
      anonymousId,
      eventType: options?._eventType,
      stepName,
      stepIndex: index,
      osVersion: getOsVersion(),
      deviceType: getDeviceType(),
      properties: options?.properties ?? null,
    })
  },

  /**
   * Associate the current user with known traits (email, user ID, etc.).
   * Call once after sign-in so connected integrations (Stripe, RevenueCat)
   * can match this user to their records.
   *
   * ```ts
   * OnRamp.identify({ email: user.email, userId: user.id })
   * ```
   */
  identify(traits: Record<string, string | number | boolean>): void {
    if (!client || !currentSessionId || !anonymousId) {
      if (__DEV__) console.warn('[OnRamp] call OnRamp.init() before calling identify()')
      return
    }
    client.identify({ sessionId: currentSessionId, anonymousId, traits })
  },

  newSession(): void {
    rotateSession()
  },

  flush(): Promise<void> {
    return client?.flush() ?? Promise.resolve()
  },

  /**
   * Return the current anonymous and session IDs so your server can associate
   * backend events (purchases, trial starts, etc.) with this user's journey.
   * Pass both in the request body at the moment of the action — session IDs rotate.
   */
  getIds(): { anonymousId: string | null; sessionId: string | null } {
    return { anonymousId, sessionId: currentSessionId }
  },

  get isInitialized(): boolean {
    return client !== null
  },
}
