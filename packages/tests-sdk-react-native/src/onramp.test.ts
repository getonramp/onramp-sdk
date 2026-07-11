/**
 * Integration tests for @onramp-sdk/react-native.
 *
 * react-native and AsyncStorage are aliased to local mocks via vitest.config.ts.
 * The SDK is aliased to its TypeScript source so Vite processes everything
 * (no esbuild pre-bundling of the Flow-typed react-native package).
 *
 * Each test group calls freshOnRamp() which does vi.resetModules() + dynamic
 * import to get a fresh singleton state. Because vi.resetModules() clears the
 * mock module cache too, tests that interact with AppState or AsyncStorage
 * import those AFTER freshOnRamp() to get the same instance the SDK is using.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

type OnRampModule = typeof import('@onramp-sdk/react-native')

async function freshOnRamp(): Promise<OnRampModule['OnRamp']> {
  vi.resetModules()
  const mod = await import('@onramp-sdk/react-native')
  return mod.OnRamp
}

describe('OnRamp react-native SDK', () => {
  beforeEach(() => {
    mockFetch.mockResolvedValue({ ok: true })
    localStorage.clear()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('init', () => {
    it('marks the SDK as initialized after awaiting init()', async () => {
      const OnRamp = await freshOnRamp()
      expect(OnRamp.isInitialized).toBe(false)
      await OnRamp.init({ apiKey: 'test-key' })
      expect(OnRamp.isInitialized).toBe(true)
    })

    it('creates an anonymous ID and a session ID', async () => {
      const OnRamp = await freshOnRamp()
      await OnRamp.init({ apiKey: 'test-key' })
      const { anonymousId, sessionId } = OnRamp.getIds()
      expect(anonymousId).toBeTruthy()
      expect(sessionId).toBeTruthy()
    })

    it('persists the anonymous ID in AsyncStorage (backed by localStorage)', async () => {
      const OnRamp = await freshOnRamp()
      // Import AsyncStorage AFTER freshOnRamp so we get the same module instance
      // the SDK is using (vi.resetModules() inside freshOnRamp re-evaluates mocks).
      const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default

      await OnRamp.init({ apiKey: 'test-key' })
      const { anonymousId } = OnRamp.getIds()

      const stored = await AsyncStorage.getItem('@onramp/anonymous_id')
      expect(stored).not.toBeNull()
      const parsed = JSON.parse(stored!)
      expect(parsed.id).toBe(anonymousId)
    })

    it('resumes a previous session within the timeout window', async () => {
      vi.useFakeTimers()
      const now = Date.now()
      vi.setSystemTime(now)

      // First "app launch"
      const OnRamp1 = await freshOnRamp()
      await OnRamp1.init({ apiKey: 'test-key', sessionTimeoutMs: 5_000 })
      const { sessionId: firstSessionId } = OnRamp1.getIds()

      // A short time passes — still within the session window
      vi.setSystemTime(now + 1_000)

      // Second "app launch" — reads session from localStorage (via AsyncStorage mock)
      const OnRamp2 = await freshOnRamp()
      await OnRamp2.init({ apiKey: 'test-key', sessionTimeoutMs: 5_000 })

      expect(OnRamp2.getIds().sessionId).toBe(firstSessionId)
    })

    it('starts a new session when the timeout has expired', async () => {
      vi.useFakeTimers()
      const now = Date.now()
      vi.setSystemTime(now)

      const OnRamp1 = await freshOnRamp()
      await OnRamp1.init({ apiKey: 'test-key', sessionTimeoutMs: 1_000 })
      const { sessionId: firstSessionId } = OnRamp1.getIds()

      vi.setSystemTime(now + 2_000)

      const OnRamp2 = await freshOnRamp()
      await OnRamp2.init({ apiKey: 'test-key', sessionTimeoutMs: 1_000 })

      expect(OnRamp2.getIds().sessionId).not.toBe(firstSessionId)
    })
  })

  describe('step', () => {
    it('queues an event that is sent on flush', async () => {
      const OnRamp = await freshOnRamp()
      await OnRamp.init({ apiKey: 'test-key' })
      OnRamp.step('onboarding_start')
      await OnRamp.flush()

      expect(mockFetch).toHaveBeenCalledOnce()
      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string)
      expect(body.events[0]).toMatchObject({
        step_name: 'onboarding_start',
        step_index: 0,
        event_type: 'step_entered',
        app_key: 'test-key',
      })
    })

    it('tags the platform as ios when Platform.OS is ios', async () => {
      const OnRamp = await freshOnRamp()
      await OnRamp.init({ apiKey: 'test-key' })
      OnRamp.step('first_step')
      await OnRamp.flush()

      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string)
      expect(body.events[0].platform).toBe('ios')
    })

    it('tags events with _framework: react_native', async () => {
      const OnRamp = await freshOnRamp()
      await OnRamp.init({ apiKey: 'test-key' })
      OnRamp.step('first_step')
      await OnRamp.flush()

      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string)
      expect(body.events[0].properties?._framework).toBe('react_native')
    })

    it('increments step_index for each call', async () => {
      const OnRamp = await freshOnRamp()
      await OnRamp.init({ apiKey: 'test-key' })
      OnRamp.step('a')
      OnRamp.step('b')
      OnRamp.step('c')
      await OnRamp.flush()

      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string)
      expect(body.events[0].step_index).toBe(0)
      expect(body.events[1].step_index).toBe(1)
      expect(body.events[2].step_index).toBe(2)
    })

    it('attaches custom properties', async () => {
      const OnRamp = await freshOnRamp()
      await OnRamp.init({ apiKey: 'test-key' })
      OnRamp.step('plan_selected', { properties: { plan: 'pro', trial: false } })
      await OnRamp.flush()

      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string)
      expect(body.events[0].properties).toMatchObject({ plan: 'pro', trial: false })
    })
  })

  describe('session management', () => {
    it('newSession() rotates the session ID', async () => {
      const OnRamp = await freshOnRamp()
      await OnRamp.init({ apiKey: 'test-key' })
      const { sessionId: before } = OnRamp.getIds()

      OnRamp.newSession()

      expect(OnRamp.getIds().sessionId).not.toBe(before)
    })

    it('flushes when app goes to background', async () => {
      const OnRamp = await freshOnRamp()
      // Import AppState AFTER freshOnRamp so we get the instance the SDK registered with.
      const { AppState } = (await import('react-native')) as unknown as {
        AppState: { __simulateChange: (s: string) => void }
      }

      await OnRamp.init({ apiKey: 'test-key' })
      OnRamp.step('active_step')

      AppState.__simulateChange('background')

      // flush is fire-and-forget; give the microtask queue a tick
      await Promise.resolve()
      await Promise.resolve()
      expect(mockFetch).toHaveBeenCalled()
    })

    it('rotates session after timeout when app returns to foreground', async () => {
      vi.useFakeTimers()
      const now = Date.now()
      vi.setSystemTime(now)

      const OnRamp = await freshOnRamp()
      const { AppState } = (await import('react-native')) as unknown as {
        AppState: { __simulateChange: (s: string) => void }
      }

      await OnRamp.init({ apiKey: 'test-key', sessionTimeoutMs: 1 })
      const { sessionId: before } = OnRamp.getIds()

      AppState.__simulateChange('background')
      vi.setSystemTime(now + 100)
      AppState.__simulateChange('active')

      expect(OnRamp.getIds().sessionId).not.toBe(before)
    })
  })

  describe('flush', () => {
    it('resolves immediately when not initialized', async () => {
      const OnRamp = await freshOnRamp()
      await expect(OnRamp.flush()).resolves.toBeUndefined()
    })

    it('resolves immediately when nothing is queued', async () => {
      const OnRamp = await freshOnRamp()
      await OnRamp.init({ apiKey: 'test-key' })
      await expect(OnRamp.flush()).resolves.toBeUndefined()
      expect(mockFetch).not.toHaveBeenCalled()
    })
  })
})
