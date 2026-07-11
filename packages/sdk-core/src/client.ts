import { BatchQueue } from './batch.js'
import type { OnRampEvent, Platform } from '@onramp-sdk/shared'
import { SCHEMA_VERSION, INGEST_ROUTE, API_KEY_HEADER } from '@onramp-sdk/shared'

export interface OnRampConfig {
  apiKey: string
  host?: string
  /** The OS the app runs on (ios/android/web). Distinct from `framework`. */
  platform?: Platform
  /** The SDK/runtime, e.g. 'react_native' or 'flutter'. Reported on each event. */
  framework?: string | null
  appVersion?: string | null
  flushIntervalMs?: number
  /** Provide a UUID v4 generator - platform SDKs inject their own */
  uuidFn: () => string
}

export class OnRampClient {
  private readonly config: Required<OnRampConfig>
  private readonly queue: BatchQueue

  constructor(config: OnRampConfig) {
    this.config = {
      host: 'https://ingest.getonramp.dev',
      platform: 'other',
      framework: null,
      appVersion: null,
      flushIntervalMs: 5000,
      ...config,
    }
    this.queue = new BatchQueue(this.sendBatch.bind(this), this.config.flushIntervalMs)
  }

  track(params: {
    sessionId: string
    anonymousId: string
    stepName: string
    stepIndex: number
    eventType?: OnRampEvent['event_type']
    osVersion?: string | null
    deviceModel?: string | null
    deviceType?: OnRampEvent['device_type']
    properties?: Record<string, string | number | boolean> | null
  }): void {
    const event: OnRampEvent = {
      schema_version: SCHEMA_VERSION,
      event_id: this.config.uuidFn(),
      event_type: params.eventType ?? 'step_entered',
      app_key: this.config.apiKey,
      session_id: params.sessionId,
      anonymous_id: params.anonymousId,
      step_name: params.stepName,
      step_index: params.stepIndex,
      client_timestamp_ms: Date.now(),
      platform: this.config.platform,
      os_version: params.osVersion ?? null,
      app_version: this.config.appVersion,
      device_model: params.deviceModel ?? null,
      device_type: params.deviceType ?? null,
      properties: this.config.framework
        ? { _framework: this.config.framework, ...params.properties }
        : params.properties ?? null,
    }
    this.queue.push(event)
  }

  identify(params: {
    sessionId: string
    anonymousId: string
    traits: Record<string, string | number | boolean>
  }): void {
    const event: OnRampEvent = {
      schema_version: SCHEMA_VERSION,
      event_id: this.config.uuidFn(),
      event_type: 'identify',
      app_key: this.config.apiKey,
      session_id: params.sessionId,
      anonymous_id: params.anonymousId,
      step_name: '_identify',
      step_index: 0,
      client_timestamp_ms: Date.now(),
      platform: this.config.platform,
      os_version: null,
      app_version: this.config.appVersion,
      device_model: null,
      device_type: null,
      properties: params.traits,
    }
    this.queue.push(event)
  }

  flush(): Promise<void> {
    return this.queue.flushNow()
  }

  /**
   * Fire a heartbeat event and forget. Uses keepalive fetch so the request
   * completes even after the page unloads — call this from pagehide /
   * visibilitychange before flush(). Unlike track(), this bypasses the queue
   * so the timestamp is captured at the exact moment of the call.
   */
  beacon(params: { sessionId: string; anonymousId: string }): void {
    if (typeof fetch === 'undefined') return
    const event: OnRampEvent = {
      schema_version: SCHEMA_VERSION,
      event_id: this.config.uuidFn(),
      event_type: 'heartbeat',
      app_key: this.config.apiKey,
      session_id: params.sessionId,
      anonymous_id: params.anonymousId,
      step_name: '_heartbeat',
      step_index: 0,
      client_timestamp_ms: Date.now(),
      platform: this.config.platform,
      os_version: null,
      app_version: this.config.appVersion,
      device_model: null,
      device_type: null,
      properties: null,
    }
    fetch(`${this.config.host}${INGEST_ROUTE}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [API_KEY_HEADER]: this.config.apiKey,
      },
      body: JSON.stringify({ events: [event] }),
      keepalive: true,
    }).catch(() => {})
  }

  destroy(): void {
    this.queue.destroy()
  }

  private async sendBatch(events: OnRampEvent[]): Promise<void> {
    const url = `${this.config.host}${INGEST_ROUTE}`
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [API_KEY_HEADER]: this.config.apiKey,
      },
      body: JSON.stringify({ events }),
    })
    if (!res.ok) {
      throw new Error(`Ingest failed: ${res.status}`)
    }
  }
}
