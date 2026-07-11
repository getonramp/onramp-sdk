import { OnRampClient } from '@onramp-sdk/core'

const ANON_KEY = '@onramp/anonymous_id'
const SESSION_KEY = '@onramp/session'
const DEFAULT_SESSION_TIMEOUT_MS = 30 * 60 * 1000           // 30 min
const DEFAULT_ANON_MAX_AGE_MS    = 365 * 24 * 60 * 60 * 1000 // 365 days

function uuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

const hasWindow = (): boolean => typeof window !== 'undefined'

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // localStorage unavailable (private mode, quota) - degrade silently
  }
}

interface StoredSession {
  id: string
  lastActive: number
  stepCounter: number
}

export interface OnRampReactConfig {
  /** Your app's API key from the OnRamp dashboard. */
  apiKey: string
  /** Ingestion API base URL. */
  host?: string
  /** App version string, e.g. "2.4.1" - enables the version breakdown in the dashboard. */
  appVersion?: string
  /**
   * SDK/runtime label reported on each event. Defaults to `'react'`; set
   * `'nextjs'` (or your own) to distinguish surfaces in the dashboard.
   */
  framework?: string
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
let started = false
let pendingReferrer: string | null = null
let pendingUtm: Record<string, string> | null = null
let lastHeartbeatTs = 0
let heartbeatTimer: ReturnType<typeof setInterval> | null = null

const IDENTIFY_KEY = '@onramp/last_identify'
const PENDING_ACQUISITION_KEY = '@onramp/pending_acquisition'

// Ad platforms auto-tag landing URLs with a click ID instead of utm_* params
// (e.g. Google Ads appends only ?gclid=... unless a manual tracking template is
// set up). Map known click IDs to utm equivalents so paid traffic is still
// attributable. fbclid maps to 'social' rather than 'cpc' because Facebook
// appends it to organic shares as well as ads.
const CLICK_ID_SOURCES: ReadonlyArray<readonly [param: string, source: string, medium: string]> = [
  ['gclid', 'google', 'cpc'],
  ['gbraid', 'google', 'cpc'],
  ['wbraid', 'google', 'cpc'],
  ['msclkid', 'bing', 'cpc'],
  ['ttclid', 'tiktok', 'cpc'],
  ['twclid', 'twitter', 'cpc'],
  ['li_fat_id', 'linkedin', 'cpc'],
  ['fbclid', 'facebook', 'social'],
]

function utmFromClickId(params: URLSearchParams): Record<string, string> | null {
  for (const [param, source, medium] of CLICK_ID_SOURCES) {
    if (params.get(param)) return { _utm_source: source, _utm_medium: medium }
  }
  return null
}

function hashTraits(traits: Record<string, string | number | boolean>): string {
  const s = JSON.stringify(traits)
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0
  return h.toString(36)
}

interface StoredAnonId { id: string; createdAt: number }

function getOrCreateAnonymousId(maxAgeMs: number): string {
  const raw = safeGet(ANON_KEY)
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as StoredAnonId
      if (Date.now() - parsed.createdAt < maxAgeMs) return parsed.id
      // expired — fall through to generate a new one
    } catch {
      // legacy plain-string ID — migrate to JSON format, age clock starts now
      const migrated: StoredAnonId = { id: raw, createdAt: Date.now() }
      safeSet(ANON_KEY, JSON.stringify(migrated))
      return migrated.id
    }
  }
  const newId: StoredAnonId = { id: uuid(), createdAt: Date.now() }
  safeSet(ANON_KEY, JSON.stringify(newId))
  return newId.id
}

function loadSession(): StoredSession | null {
  const raw = safeGet(SESSION_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as StoredSession
  } catch {
    return null
  }
}

function persistSession(): void {
  if (!currentSessionId) return
  safeSet(SESSION_KEY, JSON.stringify({ id: currentSessionId, lastActive, stepCounter }))
}

function rotateSession(): void {
  currentSessionId = uuid()
  stepCounter = 0
  lastActive = Date.now()
  persistSession()
}

/** Rotate the session if the user has been away longer than the timeout. */
function ensureSessionFresh(): void {
  if (!currentSessionId || Date.now() - lastActive > sessionTimeoutMs) {
    rotateSession()
  }
}

function getDeviceType(): 'phone' | 'tablet' | 'desktop' {
  if (typeof navigator === 'undefined') return 'desktop'
  const ua = navigator.userAgent
  if (/iPad|Tablet|(Android(?!.*Mobile))/i.test(ua)) return 'tablet'
  if (/Mobi|Android|iPhone|iPod/i.test(ua)) return 'phone'
  return 'desktop'
}

function parseUA(): { osVersion: string; browser: string } {
  if (typeof navigator === 'undefined') return { osVersion: 'web', browser: '' }
  const ua = navigator.userAgent

  let os = 'web'
  let osVer = ''
  if (/iPad/.test(ua)) {
    os = 'ipados'; osVer = (ua.match(/OS (\d+[_.]\d+)/) ?? [])[1]?.replace('_', '.') ?? ''
  } else if (/iPhone|iPod/.test(ua)) {
    os = 'ios'; osVer = (ua.match(/OS (\d+[_.]\d+)/) ?? [])[1]?.replace('_', '.') ?? ''
  } else if (/Android (\d+\.?\d*)/.test(ua)) {
    os = 'android'; osVer = (ua.match(/Android (\d+\.?\d*)/) ?? [])[1] ?? ''
  } else if (/Windows NT (\d+\.\d+)/.test(ua)) {
    os = 'windows'
    const nt = (ua.match(/Windows NT (\d+\.\d+)/) ?? [])[1] ?? ''
    osVer = ({ '10.0': '10', '6.3': '8.1', '6.2': '8', '6.1': '7' } as Record<string, string>)[nt] ?? nt
  } else if (/Mac OS X (\d+[_.]\d+)/.test(ua)) {
    os = 'macos'; osVer = (ua.match(/Mac OS X (\d+[_.]\d+)/) ?? [])[1]?.replace('_', '.') ?? ''
  } else if (/Linux/.test(ua)) {
    os = 'linux'
  }

  let browser = ''
  if (/Edg\/(\d+)/.test(ua)) {
    browser = `Edge ${(ua.match(/Edg\/(\d+)/) ?? [])[1] ?? ''}`
  } else if (/OPR\/(\d+)/.test(ua)) {
    browser = `Opera ${(ua.match(/OPR\/(\d+)/) ?? [])[1] ?? ''}`
  } else if (/Firefox\/(\d+)/.test(ua)) {
    browser = `Firefox ${(ua.match(/Firefox\/(\d+)/) ?? [])[1] ?? ''}`
  } else if (/Chrome\/(\d+)/.test(ua)) {
    browser = `Chrome ${(ua.match(/Chrome\/(\d+)/) ?? [])[1] ?? ''}`
  } else if (/Version\/(\d+).*Safari/.test(ua)) {
    browser = `Safari ${(ua.match(/Version\/(\d+)/) ?? [])[1] ?? ''}`
  } else if (/Safari\//.test(ua)) {
    browser = 'Safari'
  }

  return { osVersion: osVer ? `${os} ${osVer}` : os, browser }
}

export interface StepOptions {
  /** Custom event properties (e.g. { plan: 'free', source: 'invite' }). */
  properties?: Record<string, string | number | boolean>
  /** @internal Used by the route tracker - not part of the public API. */
  _eventType?: 'nav_entered'
}

function isAutomated(): boolean {
  if (typeof navigator === 'undefined') return false
  if (navigator.webdriver) return true
  if (/HeadlessChrome|Playwright|PhantomJS/i.test(navigator.userAgent)) return true
  return false
}

export const OnRamp = {
  /**
   * Initialize the SDK. Safe to call during SSR (no-ops on the server) and
   * idempotent on the client, so it's fine to call from an effect that may
   * run more than once (e.g. React StrictMode).
   */
  init(config: OnRampReactConfig): void {
    if (!hasWindow()) return // server - defer to the client
    if (isAutomated()) return // headless browsers / crawlers
    if (started) return // already initialized this page load

    sessionTimeoutMs = config.sessionTimeoutMs ?? DEFAULT_SESSION_TIMEOUT_MS
    anonymousId = getOrCreateAnonymousId(config.anonymousIdMaxAgeMs ?? DEFAULT_ANON_MAX_AGE_MS)

    // Resume the previous session if the user returned within the timeout window.
    const stored = loadSession()
    if (stored && Date.now() - stored.lastActive < sessionTimeoutMs) {
      currentSessionId = stored.id
      stepCounter = stored.stepCounter
      lastActive = stored.lastActive
    } else {
      rotateSession()
    }

    // Capture external referrer on fresh page load. Same-origin referrers
    // (in-app navigation) are skipped since they're not useful for acquisition.
    if (document.referrer) {
      try {
        if (new URL(document.referrer).origin !== window.location.origin) {
          pendingReferrer = document.referrer
        }
      } catch {
        pendingReferrer = document.referrer
      }
    }

    // Capture UTM params so traffic source is attributable even when the referrer
    // header is stripped (e.g. Google organic, AI-tool redirects, paid campaigns).
    const urlParams = new URLSearchParams(window.location.search)
    const utmKeys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] as const
    const utmProps: Record<string, string> = {}
    for (const key of utmKeys) {
      const val = urlParams.get(key)
      if (val) utmProps[`_${key}`] = val
    }
    if (Object.keys(utmProps).length > 0) {
      pendingUtm = utmProps
    } else {
      pendingUtm = utmFromClickId(urlParams)
    }

    // Neither referrer nor UTM params survive on their own across a hard
    // navigation (e.g. an OAuth redirect between the landing page and the
    // first tracked step) since they only live in memory. Persist to
    // sessionStorage so attribution isn't lost mid-signup, and fall back to
    // it when this page load has no fresh referrer/UTM of its own.
    if (pendingReferrer || pendingUtm) {
      try {
        sessionStorage.setItem(
          PENDING_ACQUISITION_KEY,
          JSON.stringify({ referrer: pendingReferrer, utm: pendingUtm })
        )
      } catch {
        // sessionStorage unavailable - attribution won't survive a hard navigation
      }
    } else {
      try {
        const raw = sessionStorage.getItem(PENDING_ACQUISITION_KEY)
        if (raw) {
          const stored = JSON.parse(raw) as { referrer: string | null; utm: Record<string, string> | null }
          pendingReferrer = stored.referrer
          pendingUtm = stored.utm
        }
      } catch {
        // sessionStorage unavailable or corrupt - no prior attribution to restore
      }
    }

    client = new OnRampClient({
      apiKey: config.apiKey,
      host: config.host,
      platform: 'web',
      framework: config.framework ?? 'react',
      appVersion: config.appVersion ?? null,
      uuidFn: uuid,
    })

    // Heartbeat + last-chance flush when the tab is hidden or closed.
    // Both pagehide and visibilitychange can fire; the 500ms guard prevents
    // duplicate heartbeats when they fire in quick succession.
    function sendHeartbeat() {
      if (!client || !currentSessionId || !anonymousId) return
      const now = Date.now()
      if (now - lastHeartbeatTs < 500) return
      lastHeartbeatTs = now
      client.beacon({ sessionId: currentSessionId, anonymousId })
    }

    window.addEventListener('pagehide', () => {
      lastActive = Date.now()
      persistSession()
      sendHeartbeat()
      client?.flush()
    })
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        lastActive = Date.now()
        persistSession()
        sendHeartbeat()
        client?.flush()
      } else {
        ensureSessionFresh()
      }
    })

    // Periodic heartbeat so duration is accurate even when the user sits on a
    // single screen for a long time without triggering a page-visibility event.
    heartbeatTimer = setInterval(() => {
      if (document.visibilityState !== 'hidden') sendHeartbeat()
    }, 5_000)

    started = true
  },

  /** Track a milestone in your onboarding flow. */
  step(stepName: string, options?: StepOptions): void {
    if (!hasWindow()) return
    if (!client || !currentSessionId || !anonymousId) {
      console.warn('[OnRamp] call OnRamp.init() (or mount <OnRampProvider>) before tracking steps')
      return
    }

    ensureSessionFresh()
    const index = stepCounter++
    lastActive = Date.now()
    persistSession()

    const ref = pendingReferrer
    pendingReferrer = null
    const utm = pendingUtm
    pendingUtm = null
    if (ref || utm) {
      try {
        sessionStorage.removeItem(PENDING_ACQUISITION_KEY)
      } catch {
        // sessionStorage unavailable - nothing to clear
      }
    }

    const { osVersion, browser } = parseUA()
    const extraProps: Record<string, string> = {}
    if (browser) extraProps._browser = browser
    if (ref) extraProps._referrer = ref
    if (utm) Object.assign(extraProps, utm)

    client.track({
      sessionId: currentSessionId,
      anonymousId,
      eventType: options?._eventType,
      stepName,
      stepIndex: index,
      osVersion,
      deviceType: getDeviceType(),
      properties: Object.keys(extraProps).length || options?.properties
        ? { ...extraProps, ...options?.properties }
        : null,
    })
  },

  /**
   * Associate the current user with known traits (email, user ID, etc.).
   * Call this once after sign-in or account creation. OnRamp uses these traits
   * to match the user to records in connected integrations (Stripe, RevenueCat).
   *
   * ```ts
   * OnRamp.identify({ email: user.email, userId: user.id })
   * ```
   */
  identify(traits: Record<string, string | number | boolean>): void {
    if (!hasWindow()) return
    if (!client || !currentSessionId || !anonymousId) {
      console.warn('[OnRamp] call OnRamp.init() before calling identify()')
      return
    }
    // Deduplicate within the browser session: skip if the same traits were
    // already sent (survives hard navigations via sessionStorage).
    const hash = hashTraits(traits)
    try {
      if (sessionStorage.getItem(IDENTIFY_KEY) === hash) return
      sessionStorage.setItem(IDENTIFY_KEY, hash)
    } catch {
      // sessionStorage unavailable — send anyway
    }
    client.identify({ sessionId: currentSessionId, anonymousId, traits })
  },

  /** Force-start a new session (e.g. after logout). */
  newSession(): void {
    rotateSession()
  },

  /** Flush queued events immediately. Also runs automatically on tab hide/close. */
  flush(): Promise<void> {
    return client?.flush() ?? Promise.resolve()
  },

  /**
   * Return the current anonymous and session IDs so your server can associate
   * backend events (purchases, trial starts, etc.) with this user's journey.
   *
   * Pass both to your server at the moment of the action (e.g. in the checkout
   * request body). Do not store them server-side long-term — session IDs rotate.
   */
  getIds(): { anonymousId: string | null; sessionId: string | null } {
    return { anonymousId, sessionId: currentSessionId }
  },

  /** Whether init() has run on the client. */
  get isInitialized(): boolean {
    return started
  },
}
