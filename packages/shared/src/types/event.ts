export type EventType =
  | 'step_entered'
  | 'step_completed'
  | 'step_skipped'
  | 'funnel_started'
  | 'funnel_abandoned'
  | 'nav_entered'
  | 'heartbeat'
  | 'identify'

export type Platform = 'ios' | 'android' | 'react_native' | 'flutter' | 'web' | 'other'
export type DeviceType = 'phone' | 'tablet' | 'desktop' | 'other'

export interface OnRampEvent {
  schema_version: '1.0'
  event_id: string
  event_type: EventType
  app_key: string
  session_id: string
  anonymous_id: string
  step_name: string
  step_index: number
  client_timestamp_ms: number
  server_timestamp_ms?: number
  platform: Platform
  os_version: string | null
  app_version: string | null
  device_model: string | null
  device_type: DeviceType | null
  properties: Record<string, string | number | boolean> | null
}

export interface IngestPayload {
  events: OnRampEvent[]
}
