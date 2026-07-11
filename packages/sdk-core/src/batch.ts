import type { OnRampEvent } from '@onramp-sdk/shared'
import { MAX_EVENTS_PER_BATCH } from '@onramp-sdk/shared'

type FlushFn = (events: OnRampEvent[]) => Promise<void>

const MAX_RETRIES = 3
const RETRY_BASE_MS = 1_000 // 1s → 2s → 4s

export class BatchQueue {
  private queue: OnRampEvent[] = []
  private timer: ReturnType<typeof setTimeout> | null = null
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private retryCount = 0
  private sending = false
  private readonly flushIntervalMs: number
  private readonly flushFn: FlushFn

  constructor(flush: FlushFn, flushIntervalMs = 5_000) {
    this.flushFn = flush
    this.flushIntervalMs = flushIntervalMs
  }

  push(event: OnRampEvent): void {
    this.queue.push(event)
    if (this.queue.length >= MAX_EVENTS_PER_BATCH) {
      this.sendWhenReady()
    } else if (!this.timer && !this.retryTimer) {
      this.timer = setTimeout(() => this.sendWhenReady(), this.flushIntervalMs)
    }
  }

  /** Called on app background / page hide - best-effort, no retries */
  async flushNow(): Promise<void> {
    this.cancelTimers()
    while (this.queue.length > 0) {
      const batch = this.queue.splice(0, MAX_EVENTS_PER_BATCH)
      await this.flushFn(batch).catch(() => {
        // best-effort on manual flush - don't re-queue
      })
    }
  }

  destroy(): void {
    this.cancelTimers()
  }

  // ── internals ──────────────────────────────────────────────────────────────

  private sendWhenReady(): void {
    if (this.sending) return
    this.cancelTimers()
    void this.trySend()
  }

  private async trySend(): Promise<void> {
    if (this.sending || this.queue.length === 0) return
    this.sending = true

    const batch = this.queue.splice(0, MAX_EVENTS_PER_BATCH)
    try {
      await this.flushFn(batch)
      this.retryCount = 0
      // More events may have arrived while we were sending
      if (this.queue.length > 0 && !this.timer) {
        this.timer = setTimeout(() => this.sendWhenReady(), this.flushIntervalMs)
      }
    } catch {
      // Put batch back at the front so it goes out first on retry
      this.queue.unshift(...batch)
      if (this.retryCount < MAX_RETRIES) {
        const delay = RETRY_BASE_MS * 2 ** this.retryCount
        this.retryCount++
        this.retryTimer = setTimeout(() => this.sendWhenReady(), delay)
      } else {
        // Give up - drop the stuck batch, reset so new events can flow
        this.queue.splice(0, batch.length)
        this.retryCount = 0
      }
    } finally {
      this.sending = false
    }
  }

  private cancelTimers(): void {
    if (this.timer) { clearTimeout(this.timer); this.timer = null }
    if (this.retryTimer) { clearTimeout(this.retryTimer); this.retryTimer = null }
  }
}
