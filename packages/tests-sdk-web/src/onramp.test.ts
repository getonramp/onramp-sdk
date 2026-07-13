/**
 * Integration tests for @onramp-sdk/web.
 *
 * The SDK is a module-level singleton. Each test uses vi.resetModules() +
 * dynamic import to get a fresh module instance with clean state, mirroring
 * a real page-load cycle. jsdom provides localStorage and window.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

type OnRampModule = typeof import('@onramp-sdk/web')

async function freshOnRamp(): Promise<OnRampModule['OnRamp']> {
  vi.resetModules()
  const mod = await import('@onramp-sdk/web')
  return mod.OnRamp
}

describe('OnRamp web SDK', () => {
  beforeEach(() => {
    mockFetch.mockResolvedValue({ ok: true })
    localStorage.clear()
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
  })

  describe('init', () => {
    it('marks the SDK as initialized', async () => {
      const OnRamp = await freshOnRamp()
      expect(OnRamp.isInitialized).toBe(false)
      OnRamp.init({ apiKey: 'test-key' })
      expect(OnRamp.isInitialized).toBe(true)
    })

    it('creates an anonymous ID and a session ID', async () => {
      const OnRamp = await freshOnRamp()
      OnRamp.init({ apiKey: 'test-key' })
      const { anonymousId, sessionId } = OnRamp.getIds()
      expect(anonymousId).toBeTruthy()
      expect(sessionId).toBeTruthy()
    })

    it('is a no-op when window is undefined (SSR guard)', async () => {
      const win = globalThis.window
      // @ts-expect-error simulate SSR
      delete globalThis.window
      const OnRamp = await freshOnRamp()
      expect(() => OnRamp.init({ apiKey: 'test-key' })).not.toThrow()
      expect(OnRamp.isInitialized).toBe(false)
      globalThis.window = win
    })

    it('is idempotent — calling init twice keeps the same IDs', async () => {
      const OnRamp = await freshOnRamp()
      OnRamp.init({ apiKey: 'test-key' })
      const first = OnRamp.getIds()

      OnRamp.init({ apiKey: 'test-key' }) // second call is a no-op
      const second = OnRamp.getIds()

      expect(second.anonymousId).toBe(first.anonymousId)
      expect(second.sessionId).toBe(first.sessionId)
    })
  })

  describe('step', () => {
    it('queues a track event that is sent on flush', async () => {
      const OnRamp = await freshOnRamp()
      OnRamp.init({ apiKey: 'test-key' })
      OnRamp.step('welcome')
      await OnRamp.flush()

      expect(mockFetch).toHaveBeenCalledOnce()
      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string)
      expect(body.events[0]).toMatchObject({
        step_name: 'welcome',
        step_index: 0,
        event_type: 'step_entered',
        app_key: 'test-key',
      })
    })

    it('increments step_index for each call', async () => {
      const OnRamp = await freshOnRamp()
      OnRamp.init({ apiKey: 'test-key' })
      OnRamp.step('step_a')
      OnRamp.step('step_b')
      OnRamp.step('step_c')
      await OnRamp.flush()

      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string)
      expect(body.events[0].step_index).toBe(0)
      expect(body.events[1].step_index).toBe(1)
      expect(body.events[2].step_index).toBe(2)
    })

    it('attaches custom properties to the event', async () => {
      const OnRamp = await freshOnRamp()
      OnRamp.init({ apiKey: 'test-key' })
      OnRamp.step('plan_selected', { properties: { plan: 'pro', trial: true } })
      await OnRamp.flush()

      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string)
      expect(body.events[0].properties).toMatchObject({ plan: 'pro', trial: true })
    })

    it('emits a console.warn when called before init', async () => {
      const OnRamp = await freshOnRamp()
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      OnRamp.step('too-early')
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('OnRamp.init()'))
      warn.mockRestore()
    })
  })

  describe('session management', () => {
    it('resumes a previous session when the user returns within the timeout', async () => {
      // First page load
      const OnRamp1 = await freshOnRamp()
      OnRamp1.init({ apiKey: 'test-key' })
      const { sessionId: firstSessionId, anonymousId: firstAnonId } = OnRamp1.getIds()

      // Second page load — same localStorage, session still valid
      const OnRamp2 = await freshOnRamp()
      OnRamp2.init({ apiKey: 'test-key' })

      expect(OnRamp2.getIds().sessionId).toBe(firstSessionId)
      expect(OnRamp2.getIds().anonymousId).toBe(firstAnonId)
    })

    it('starts a new session when the timeout has expired', async () => {
      vi.useFakeTimers()
      const now = Date.now()
      vi.setSystemTime(now)

      const OnRamp1 = await freshOnRamp()
      OnRamp1.init({ apiKey: 'test-key', sessionTimeoutMs: 1_000 })
      const { sessionId: firstSessionId } = OnRamp1.getIds()

      // Advance time past the session timeout
      vi.setSystemTime(now + 2_000)

      const OnRamp2 = await freshOnRamp()
      OnRamp2.init({ apiKey: 'test-key', sessionTimeoutMs: 1_000 })

      expect(OnRamp2.getIds().sessionId).not.toBe(firstSessionId)
    })

    it('newSession() rotates the session ID immediately', async () => {
      const OnRamp = await freshOnRamp()
      OnRamp.init({ apiKey: 'test-key' })
      const { sessionId: before } = OnRamp.getIds()

      OnRamp.newSession()

      expect(OnRamp.getIds().sessionId).not.toBe(before)
    })
  })

  describe('anonymous ID', () => {
    it('reuses the same anonymous ID across page loads', async () => {
      const OnRamp1 = await freshOnRamp()
      OnRamp1.init({ apiKey: 'test-key' })
      const anonId1 = OnRamp1.getIds().anonymousId

      const OnRamp2 = await freshOnRamp()
      OnRamp2.init({ apiKey: 'test-key' })
      const anonId2 = OnRamp2.getIds().anonymousId

      expect(anonId1).toBe(anonId2)
    })

    it('rotates the anonymous ID after anonymousIdMaxAgeMs has passed', async () => {
      vi.useFakeTimers()
      const now = Date.now()
      vi.setSystemTime(now)

      const OnRamp1 = await freshOnRamp()
      OnRamp1.init({ apiKey: 'test-key', anonymousIdMaxAgeMs: 500 })
      const anonId1 = OnRamp1.getIds().anonymousId

      vi.setSystemTime(now + 1_000)

      const OnRamp2 = await freshOnRamp()
      OnRamp2.init({ apiKey: 'test-key', anonymousIdMaxAgeMs: 500 })
      const anonId2 = OnRamp2.getIds().anonymousId

      expect(anonId2).not.toBe(anonId1)
    })
  })

  describe('acquisition attribution', () => {
    async function firstEventProps(search: string): Promise<Record<string, unknown> | null> {
      window.history.replaceState(null, '', `/${search}`)
      const OnRamp = await freshOnRamp()
      OnRamp.init({ apiKey: 'test-key' })
      OnRamp.step('welcome')
      await OnRamp.flush()
      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string)
      return body.events[0].properties
    }

    beforeEach(() => {
      sessionStorage.clear()
    })

    afterEach(() => {
      window.history.replaceState(null, '', '/')
    })

    it('attaches utm params from the landing URL to the first step', async () => {
      const props = await firstEventProps('?utm_source=newsletter&utm_medium=email')
      expect(props).toMatchObject({ _utm_source: 'newsletter', _utm_medium: 'email' })
    })

    it('falls back to gclid → google/cpc when no utm params are present', async () => {
      const props = await firstEventProps('?gclid=abc123')
      expect(props).toMatchObject({ _utm_source: 'google', _utm_medium: 'cpc' })
    })

    it('maps msclkid to bing/cpc and fbclid to facebook/social', async () => {
      expect(await firstEventProps('?msclkid=xyz')).toMatchObject({
        _utm_source: 'bing',
        _utm_medium: 'cpc',
      })
      mockFetch.mockClear()
      sessionStorage.clear()
      expect(await firstEventProps('?fbclid=xyz')).toMatchObject({
        _utm_source: 'facebook',
        _utm_medium: 'social',
      })
    })

    it('explicit utm params win over click IDs', async () => {
      const props = await firstEventProps('?gclid=abc123&utm_source=partner')
      expect(props).toMatchObject({ _utm_source: 'partner' })
      expect(props).not.toHaveProperty('_utm_medium')
    })

    it('labels a clean new-session visit as direct', async () => {
      const props = await firstEventProps('')
      expect(props).toMatchObject({ _referrer: 'direct' })
      expect(props).not.toHaveProperty('_utm_source')
    })

    it('does not relabel a resumed session as direct after attribution is consumed', async () => {
      const first = await freshOnRamp()
      first.init({ apiKey: 'test-key' })
      first.step('welcome')
      await first.flush()
      expect(JSON.parse(mockFetch.mock.calls[0][1].body as string).events[0].properties)
        .toMatchObject({ _referrer: 'direct' })

      mockFetch.mockClear()
      const resumed = await freshOnRamp()
      resumed.init({ apiKey: 'test-key' })
      resumed.step('profile')
      await resumed.flush()
      const properties = JSON.parse(mockFetch.mock.calls[0][1].body as string).events[0].properties
      expect(properties ?? {}).not.toHaveProperty('_referrer')
    })
  })

  describe('flush', () => {
    it('resolves immediately when nothing is queued', async () => {
      const OnRamp = await freshOnRamp()
      OnRamp.init({ apiKey: 'test-key' })
      await expect(OnRamp.flush()).resolves.toBeUndefined()
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('resolves even when not initialized', async () => {
      const OnRamp = await freshOnRamp()
      await expect(OnRamp.flush()).resolves.toBeUndefined()
    })
  })
})
