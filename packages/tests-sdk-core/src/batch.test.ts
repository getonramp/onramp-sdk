import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { BatchQueue } from '@onramp-sdk/core'
import type { OnRampEvent } from '@onramp-sdk/shared'

function makeEvent(overrides: Partial<OnRampEvent> = {}): OnRampEvent {
  return {
    schema_version: '1.0',
    event_id: 'evt-1',
    event_type: 'step_entered',
    app_key: 'test-key',
    session_id: 'session-1',
    anonymous_id: 'anon-1',
    step_name: 'welcome',
    step_index: 0,
    client_timestamp_ms: 1000,
    platform: 'web',
    os_version: null,
    app_version: null,
    device_model: null,
    device_type: null,
    properties: null,
    ...overrides,
  }
}

describe('BatchQueue', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('calls flush after the timer interval fires', async () => {
    const flush = vi.fn().mockResolvedValue(undefined)
    const queue = new BatchQueue(flush, 1_000)

    queue.push(makeEvent())
    expect(flush).not.toHaveBeenCalled()

    await vi.runAllTimersAsync()

    expect(flush).toHaveBeenCalledOnce()
    expect(flush.mock.calls[0][0]).toHaveLength(1)
    expect(flush.mock.calls[0][0][0].step_name).toBe('welcome')
    queue.destroy()
  })

  it('does not start a second timer if one is already pending', async () => {
    const flush = vi.fn().mockResolvedValue(undefined)
    const queue = new BatchQueue(flush, 1_000)

    queue.push(makeEvent({ event_id: 'e1' }))
    queue.push(makeEvent({ event_id: 'e2' }))

    await vi.runAllTimersAsync()

    // Both events should be in one batch
    expect(flush).toHaveBeenCalledOnce()
    expect(flush.mock.calls[0][0]).toHaveLength(2)
    queue.destroy()
  })

  it('flushes immediately when MAX_EVENTS_PER_BATCH (50) events are pushed', async () => {
    const flush = vi.fn().mockResolvedValue(undefined)
    const queue = new BatchQueue(flush, 60_000) // long interval - won't fire naturally

    for (let i = 0; i < 50; i++) {
      queue.push(makeEvent({ event_id: `evt-${i}`, step_index: i }))
    }

    await vi.runAllTimersAsync()

    expect(flush).toHaveBeenCalledOnce()
    expect(flush.mock.calls[0][0]).toHaveLength(50)
    queue.destroy()
  })

  it('retries with exponential backoff on flush failure', async () => {
    const flush = vi.fn()
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValue(undefined)

    const queue = new BatchQueue(flush, 1_000)
    queue.push(makeEvent())

    // Advance past the flush interval — first attempt fires and fails,
    // then the retry timer (1 s backoff) is scheduled.
    await vi.advanceTimersByTimeAsync(1_100)
    expect(flush).toHaveBeenCalledOnce()

    // Advance past the retry backoff (1 s) — retry fires and succeeds.
    await vi.advanceTimersByTimeAsync(1_100)
    expect(flush).toHaveBeenCalledTimes(2)
    expect(flush.mock.calls[1][0]).toHaveLength(1)
    queue.destroy()
  })

  it('drops events after 3 retries and allows new events to flow', async () => {
    const flush = vi.fn().mockRejectedValue(new Error('always fails'))
    const queue = new BatchQueue(flush, 1_000)

    queue.push(makeEvent({ event_id: 'stuck' }))

    // Run enough timer cycles to exhaust retries (1 initial + 3 retries = 4 calls)
    for (let i = 0; i < 10; i++) {
      await vi.runAllTimersAsync()
    }

    expect(flush.mock.calls.length).toBe(4)

    // After the max retries, new events should flush cleanly
    flush.mockResolvedValue(undefined)
    queue.push(makeEvent({ event_id: 'new-event' }))
    await vi.runAllTimersAsync()

    expect(flush).toHaveBeenLastCalledWith([
      expect.objectContaining({ event_id: 'new-event' }),
    ])
    queue.destroy()
  })

  it('flushNow drains all pending events immediately', async () => {
    const flush = vi.fn().mockResolvedValue(undefined)
    const queue = new BatchQueue(flush, 60_000)

    queue.push(makeEvent({ event_id: 'e1' }))
    queue.push(makeEvent({ event_id: 'e2' }))

    await queue.flushNow()

    expect(flush).toHaveBeenCalledOnce()
    expect(flush.mock.calls[0][0]).toHaveLength(2)
    queue.destroy()
  })

  it('flushNow is best-effort and does not throw on failure', async () => {
    const flush = vi.fn().mockRejectedValue(new Error('fail'))
    const queue = new BatchQueue(flush, 60_000)

    queue.push(makeEvent())

    await expect(queue.flushNow()).resolves.toBeUndefined()
    queue.destroy()
  })

  it('destroy cancels pending timers so flush is never called', async () => {
    const flush = vi.fn()
    const queue = new BatchQueue(flush, 1_000)

    queue.push(makeEvent())
    queue.destroy()

    await vi.runAllTimersAsync()

    expect(flush).not.toHaveBeenCalled()
  })
})
