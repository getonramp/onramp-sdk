'use client'

import { useEffect } from 'react'
import { OnRamp } from './core.js'

export interface UseTrackStepOptions {
  /** Custom event properties attached to this step. */
  properties?: Record<string, string | number | boolean>
  /** Skip tracking while false - useful for gating on a loaded/ready state. */
  enabled?: boolean
}

/**
 * Fire a funnel step when a component mounts (and again if `stepName` changes).
 * Handy for marking an onboarding screen as entered the moment it renders:
 *
 * ```tsx
 * function ProfileSetup() {
 *   useTrackStep('profile_setup_viewed')
 *   return ...
 * }
 * ```
 */
export function useTrackStep(stepName: string, options?: UseTrackStepOptions): void {
  const enabled = options?.enabled ?? true
  // Serialize properties so the effect re-fires only on a real value change,
  // not on a new object identity each render.
  const propsKey = options?.properties ? JSON.stringify(options.properties) : ''

  useEffect(() => {
    if (!enabled) return
    OnRamp.step(stepName, { properties: options?.properties })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepName, enabled, propsKey])
}
