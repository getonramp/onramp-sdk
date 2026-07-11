export interface SegmentBreakdown {
  value: string
  visitors: number
  conversion_pct: number
}

export interface FunnelStep {
  step_name: string
  step_index: number
  visitors: number
  conversion_pct: number
  drop_off_from_prev_pct: number
  median_time_from_prev_ms: number | null
  p90_time_from_prev_ms: number | null
  /** Median ms a user spends at this step before their next action (or leaving). */
  median_time_on_step_ms: number | null
  /** % of sessions where this was the only funnel step the user visited. */
  bounce_at_step_pct: number
  segment_breakdown: {
    by_os_version: SegmentBreakdown[]
    by_app_version: SegmentBreakdown[]
    by_device_type: SegmentBreakdown[]
  }
}

export interface RetentionSplit {
  completed_cohort: number
  dropped_cohort: number
  /** Day used for the headline comparison (e.g. 7 for D7), or null if cohorts too young */
  headline_day: number | null
  /** Retention % for completers at headline_day */
  completed_pct: number | null
  /** Retention % for droppers at headline_day */
  dropped_pct: number | null
  /** completed_pct / dropped_pct, rounded to 1 dp; null when dropped_pct is 0 or cohorts immature */
  lift_multiple: number | null
}

export interface FunnelSegmentSummary {
  value: string
  entered: number
  conversion_pct: number
}

export interface FunnelExitPath {
  from_step: string
  expected_next_step: string
  destinations: Array<{
    /** Screen name, or __no_later_nav__ when no later navigation event was recorded. */
    destination: string
    user_count: number
    pct: number
  }>
}

export interface FunnelSnapshot {
  app_context?: {
    name: string | null
    platform: string | null
    benchmark_context: 'mobile_app' | 'web_app' | 'unknown'
  }
  funnel_name: string
  date_range: { start: string; end: string }
  total_visitors: number
  /** Users who reached the final step (converted) */
  converted_visitors: number
  /** converted_visitors / total_visitors as a percentage */
  overall_conversion_pct: number
  steps: FunnelStep[]
  /** Retention split by funnel completion - present when the funnel has ≥2 defined steps */
  retention_split?: RetentionSplit
  acquisition?: {
    utm_sources: FunnelSegmentSummary[]
    referrers: FunnelSegmentSummary[]
  }
  app_versions?: FunnelSegmentSummary[]
  exit_paths?: FunnelExitPath[]
}
