import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { OnRampClient } from '@onramp-sdk/core'
import { INGEST_ROUTE, API_KEY_HEADER } from '@onramp-sdk/shared'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

function makeClient(overrides: Partial<ConstructorParameters<typeof OnRampClient>[0]> = {}) {
  return new OnRampClient({
    apiKey: 'test-key',
    uuidFn: () => 'test-uuid',
    flushIntervalMs: 60_000, // don't auto-flush during tests
    ...overrides,
  })
}

describe('OnRampClient', () => {
  beforeEach(() => {
    mockFetch.mockResolvedValue({ ok: true })
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  describe('track + flush', () => {
    it('sends events to the correct endpoint with the API key header', async () => {
      const client = makeClient()
      client.track({ sessionId: 's1', anonymousId: 'a1', stepName: 'welcome', stepIndex: 0 })
      await client.flush()

      expect(mockFetch).toHaveBeenCalledOnce()
      const [url, options] = mockFetch.mock.calls[0]
      expect(url).toBe(`https://ingest.getonramp.dev${INGEST_ROUTE}`)
      expect(options.method).toBe('POST')
      expect(options.headers[API_KEY_HEADER]).toBe('test-key')
      client.destroy()
    })

    it('emits a correctly shaped event payload', async () => {
      const client = makeClient({ platform: 'web', appVersion: '1.2.3' })
      client.track({
        sessionId: 'session-1',
        anonymousId: 'anon-1',
        stepName: 'profile_setup',
        stepIndex: 2,
        deviceType: 'desktop',
        osVersion: 'macos 14',
        properties: { plan: 'pro' },
      })
      await client.flush()

      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string)
      expect(body.events[0]).toMatchObject({
        schema_version: '1.0',
        event_type: 'step_entered',
        app_key: 'test-key',
        session_id: 'session-1',
        anonymous_id: 'anon-1',
        step_name: 'profile_setup',
        step_index: 2,
        platform: 'web',
        app_version: '1.2.3',
        device_type: 'desktop',
        os_version: 'macos 14',
      })
      // event_id comes from uuidFn
      expect(body.events[0].event_id).toBe('test-uuid')
      client.destroy()
    })

    it('uses a custom host when provided', async () => {
      const client = makeClient({ host: 'https://ingest.custom.test' })
      client.track({ sessionId: 's', anonymousId: 'a', stepName: 'x', stepIndex: 0 })
      await client.flush()
      expect(mockFetch.mock.calls[0][0]).toBe(`https://ingest.custom.test${INGEST_ROUTE}`)
      client.destroy()
    })

    it('injects _framework into properties when framework is set', async () => {
      const client = makeClient({ framework: 'react' })
      client.track({ sessionId: 's', anonymousId: 'a', stepName: 'x', stepIndex: 0 })
      await client.flush()
      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string)
      expect(body.events[0].properties._framework).toBe('react')
      client.destroy()
    })

    it('merges custom properties with _framework prefix', async () => {
      const client = makeClient({ framework: 'nextjs' })
      client.track({
        sessionId: 's',
        anonymousId: 'a',
        stepName: 'x',
        stepIndex: 0,
        properties: { plan: 'free', count: 5 },
      })
      await client.flush()
      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string)
      expect(body.events[0].properties).toMatchObject({
        _framework: 'nextjs',
        plan: 'free',
        count: 5,
      })
      client.destroy()
    })

    it('sends custom eventType when provided', async () => {
      const client = makeClient()
      client.track({
        sessionId: 's',
        anonymousId: 'a',
        stepName: '/home',
        stepIndex: 0,
        eventType: 'nav_entered',
      })
      await client.flush()
      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string)
      expect(body.events[0].event_type).toBe('nav_entered')
      client.destroy()
    })
  })

  describe('beacon', () => {
    it('sends a heartbeat event with keepalive immediately (bypasses queue)', () => {
      const client = makeClient()
      client.beacon({ sessionId: 'session-1', anonymousId: 'anon-1' })

      expect(mockFetch).toHaveBeenCalledOnce()
      const [, opts] = mockFetch.mock.calls[0]
      expect(opts.keepalive).toBe(true)

      const body = JSON.parse(opts.body as string)
      expect(body.events[0]).toMatchObject({
        event_type: 'heartbeat',
        step_name: '_heartbeat',
        session_id: 'session-1',
        anonymous_id: 'anon-1',
      })
      client.destroy()
    })

    it('does nothing when fetch is not available', () => {
      vi.stubGlobal('fetch', undefined)
      const client = makeClient()
      expect(() => client.beacon({ sessionId: 's', anonymousId: 'a' })).not.toThrow()
      vi.stubGlobal('fetch', mockFetch)
      client.destroy()
    })
  })

  describe('error handling', () => {
    it('does not throw when the server returns a non-ok status (retry is handled by queue)', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 429 })
      const client = makeClient({ flushIntervalMs: 1 })
      client.track({ sessionId: 's', anonymousId: 'a', stepName: 'x', stepIndex: 0 })
      // The queue will handle retries internally; verify no uncaught exception escapes
      await vi.runAllTimersAsync()
      expect(mockFetch).toHaveBeenCalled()
      client.destroy()
    })
  })

  describe('destroy', () => {
    it('cancels internal timers so no further flushes occur', async () => {
      const client = makeClient({ flushIntervalMs: 500 })
      client.track({ sessionId: 's', anonymousId: 'a', stepName: 'x', stepIndex: 0 })
      client.destroy()
      await vi.runAllTimersAsync()
      expect(mockFetch).not.toHaveBeenCalled()
    })
  })
})
