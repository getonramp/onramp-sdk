import { OnRampClient } from '@onramp-sdk/core'

const ANON_KEY    = '@onramp/anonymous_id'
const SESSION_KEY = '@onramp/session'
const PENDING_ACQUISITION_KEY = '@onramp/pending_acquisition'
const DEFAULT_SESSION_TIMEOUT_MS = 30 * 60 * 1000          // 30 min
const DEFAULT_ANON_MAX_AGE_MS    = 365 * 24 * 60 * 60 * 1000 // 365 days

function uuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

function safeGet(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}

function safeSet(key: string, value: string): void {
  try { localStorage.setItem(key, value) } catch { /* private mode / quota */ }
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

interface StoredSession { id: string; lastActive: number; stepCounter: number }

function loadSession(): StoredSession | null {
  const raw = safeGet(SESSION_KEY)
  if (!raw) return null
  try { return JSON.parse(raw) as StoredSession } catch { return null }
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

function ensureSessionFresh(): void {
  if (!currentSessionId || Date.now() - lastActive > sessionTimeoutMs) rotateSession()
}

function parseUA(): { osVersion: string; browser: string } {
  if (typeof navigator === 'undefined') return { osVersion: 'web', browser: '' }
  const ua = navigator.userAgent

  let os = 'web', osVer = ''
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
  if (/Edg\/(\d+)/.test(ua))            browser = `Edge ${(ua.match(/Edg\/(\d+)/) ?? [])[1] ?? ''}`
  else if (/OPR\/(\d+)/.test(ua))       browser = `Opera ${(ua.match(/OPR\/(\d+)/) ?? [])[1] ?? ''}`
  else if (/Firefox\/(\d+)/.test(ua))   browser = `Firefox ${(ua.match(/Firefox\/(\d+)/) ?? [])[1] ?? ''}`
  else if (/Chrome\/(\d+)/.test(ua))    browser = `Chrome ${(ua.match(/Chrome\/(\d+)/) ?? [])[1] ?? ''}`
  else if (/Version\/(\d+).*Safari/.test(ua)) browser = `Safari ${(ua.match(/Version\/(\d+)/) ?? [])[1] ?? ''}`
  else if (/Safari\//.test(ua))         browser = 'Safari'

  return { osVersion: osVer ? `${os} ${osVer}` : os, browser }
}

function getDeviceType(): 'phone' | 'tablet' | 'desktop' {
  if (typeof navigator === 'undefined') return 'desktop'
  const ua = navigator.userAgent
  if (/iPad|Tablet|(Android(?!.*Mobile))/i.test(ua)) return 'tablet'
  if (/Mobi|Android|iPhone|iPod/i.test(ua)) return 'phone'
  return 'desktop'
}

interface InitConfig {
  apiKey: string
  host?: string
  appVersion?: string
  /** Quit-and-return within this window continues the same session. Default 30 min. */
  sessionTimeoutMs?: number
  /** Anonymous ID is rotated after this many milliseconds. Default 365 days. */
  anonymousIdMaxAgeMs?: number
}

let client: OnRampClient | null = null
let currentSessionId: string | null = null
let anonymousId: string | null = null
let stepCounter = 0
let lastActive = 0
let lastHeartbeatTs = 0
let sessionTimeoutMs = DEFAULT_SESSION_TIMEOUT_MS
let pendingReferrer: string | null = null
let pendingUtm: Record<string, string> | null = null

function safeSessionGet(key: string): string | null {
  try { return sessionStorage.getItem(key) } catch { return null }
}

function safeSessionSet(key: string, value: string): void {
  try { sessionStorage.setItem(key, value) } catch { /* unavailable */ }
}

function safeSessionRemove(key: string): void {
  try { sessionStorage.removeItem(key) } catch { /* unavailable */ }
}

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

function captureAcquisition(): void {
  pendingReferrer = null
  pendingUtm = null

  if (document.referrer) {
    try {
      if (new URL(document.referrer).origin !== window.location.origin) {
        pendingReferrer = document.referrer
      }
    } catch {
      pendingReferrer = document.referrer
    }
  }

  const urlParams = new URLSearchParams(window.location.search)
  const utmKeys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] as const
  const utmProps: Record<string, string> = {}
  for (const key of utmKeys) {
    const value = urlParams.get(key)
    if (value) utmProps[`_${key}`] = value
  }
  if (Object.keys(utmProps).length > 0) {
    pendingUtm = utmProps
  } else {
    pendingUtm = utmFromClickId(urlParams)
  }

  if (pendingReferrer || pendingUtm) {
    safeSessionSet(PENDING_ACQUISITION_KEY, JSON.stringify({ referrer: pendingReferrer, utm: pendingUtm }))
    return
  }

  const raw = safeSessionGet(PENDING_ACQUISITION_KEY)
  if (!raw) return
  try {
    const stored = JSON.parse(raw) as { referrer: string | null; utm: Record<string, string> | null }
    pendingReferrer = stored.referrer
    pendingUtm = stored.utm
  } catch {
    safeSessionRemove(PENDING_ACQUISITION_KEY)
  }
}

export const OnRamp = {
  init(config: InitConfig): void {
    if (typeof window === 'undefined') return // SSR guard

    sessionTimeoutMs = config.sessionTimeoutMs ?? DEFAULT_SESSION_TIMEOUT_MS
    anonymousId = getOrCreateAnonymousId(config.anonymousIdMaxAgeMs ?? DEFAULT_ANON_MAX_AGE_MS)

    // Resume previous session if user returned within the timeout window
    const stored = loadSession()
    if (stored && Date.now() - stored.lastActive < sessionTimeoutMs) {
      currentSessionId = stored.id
      stepCounter = stored.stepCounter
      lastActive = stored.lastActive
    } else {
      rotateSession()
    }

    captureAcquisition()

    client = new OnRampClient({
      apiKey: config.apiKey,
      host: config.host,
      platform: 'web',
      appVersion: config.appVersion ?? null,
      uuidFn: uuid,
    })

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

    // Periodic heartbeat so session duration is accurate on long-idle tabs
    setInterval(() => {
      if (document.visibilityState !== 'hidden') sendHeartbeat()
    }, 5_000)

    // Outbound link tracking — fires nav_entered for external anchors
    document.addEventListener('click', (e) => {
      const anchor = (e.target as Element | null)?.closest?.('a')
      if (!anchor) return
      const href = anchor.getAttribute('href') ?? ''
      if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return
      try {
        const url = new URL(href, window.location.href)
        if (url.hostname === window.location.hostname) return
        if (!client || !currentSessionId || !anonymousId) return
        ensureSessionFresh()
        const index = stepCounter++
        lastActive = Date.now()
        persistSession()
        client.track({
          sessionId: currentSessionId,
          anonymousId,
          eventType: 'nav_entered',
          stepName: url.href.slice(0, 128),
          stepIndex: index,
          osVersion: parseUA().osVersion,
          deviceType: getDeviceType(),
          properties: null,
        })
      } catch { /* malformed href */ }
    }, { capture: true, passive: true })
  },

  step(
    stepName: string,
    options?: {
      /** Custom event properties (e.g. { plan: 'free', source: 'invite' }) */
      properties?: Record<string, string | number | boolean>
    }
  ): void {
    if (!client || !currentSessionId || !anonymousId) {
      console.warn('[OnRamp] call OnRamp.init() before tracking steps')
      return
    }

    ensureSessionFresh()
    const index = stepCounter++
    lastActive = Date.now()
    persistSession()

    const { osVersion, browser } = parseUA()
    const extraProps: Record<string, string> = {}
    if (browser) extraProps._browser = browser
    if (pendingReferrer) extraProps._referrer = pendingReferrer
    if (pendingUtm) Object.assign(extraProps, pendingUtm)
    if (pendingReferrer || pendingUtm) {
      pendingReferrer = null
      pendingUtm = null
      safeSessionRemove(PENDING_ACQUISITION_KEY)
    }

    client.track({
      sessionId: currentSessionId,
      anonymousId,
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
   * Call once after sign-in so connected integrations (Stripe, RevenueCat)
   * can match this user to their records.
   *
   * `identify()` is entirely optional — omit it if your app has no integrations
   * or if your users prefer not to share identity traits.
   *
   * ```ts
   * OnRamp.identify({ email: user.email, userId: user.id })
   * ```
   */
  identify(traits: Record<string, string | number | boolean>): void {
    if (!client || !currentSessionId || !anonymousId) {
      console.warn('[OnRamp] call OnRamp.init() before calling identify()')
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
