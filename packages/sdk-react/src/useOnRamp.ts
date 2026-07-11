'use client'

import { useEffect, useMemo } from 'react'
import { OnRamp, type StepOptions } from './core.js'
import { useHasOnRampProvider } from './OnRampProvider.js'

export interface OnRampApi {
  /** Track a milestone, e.g. `step('account_created')`. */
  step: (stepName: string, options?: Pick<StepOptions, 'properties'>) => void
  /**
   * Associate the current user with known traits. Call once after sign-in so
   * connected integrations (Stripe, RevenueCat) can match this user.
   *
   * ```ts
   * const { identify } = useOnRamp()
   * identify({ email: user.email, userId: user.id })
   * ```
   */
  identify: (traits: Record<string, string | number | boolean>) => void
  /** Force-start a new session (e.g. after logout). */
  newSession: () => void
  /** Flush queued events immediately. */
  flush: () => Promise<void>
  /**
   * Return the current `anonymousId` and `sessionId` so your server can
   * fire backend events (purchases, trials, etc.) tied to this user's session.
   * Pass both in the request body — do not cache them, session IDs rotate.
   */
  getIds: () => { anonymousId: string | null; sessionId: string | null }
}

/**
 * Access the OnRamp tracker from any client component below `<OnRampProvider>`.
 *
 * ```tsx
 * const { step } = useOnRamp()
 * <button onClick={() => step('plan_selected', { properties: { plan: 'pro' } })} />
 * ```
 */
export function useOnRamp(): OnRampApi {
  const hasProvider = useHasOnRampProvider()

  useEffect(() => {
    if (!hasProvider && process.env.NODE_ENV !== 'production') {
      console.warn('[OnRamp] useOnRamp() used without an <OnRampProvider> above it')
    }
  }, [hasProvider])

  return useMemo<OnRampApi>(
    () => ({
      step: (stepName, options) => OnRamp.step(stepName, options),
      identify: (traits) => OnRamp.identify(traits),
      newSession: () => OnRamp.newSession(),
      flush: () => OnRamp.flush(),
      getIds: () => OnRamp.getIds(),
    }),
    []
  )
}
