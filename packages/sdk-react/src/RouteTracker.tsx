'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { OnRamp } from './core.js'

/**
 * Auto-tracks route changes in the Next.js App Router as navigation events.
 *
 * These are tagged so the dashboard keeps them out of your defined funnels -
 * they power the session timeline, not conversion steps. Mount once in your
 * root layout:
 *
 * ```tsx
 * import { OnRampRouteTracker } from '@onramp-sdk/react/next'
 * // <OnRampProvider apiKey="..."><OnRampRouteTracker />{children}</OnRampProvider>
 * ```
 */
export function OnRampRouteTracker(): null {
  const pathname = usePathname()

  useEffect(() => {
    if (!pathname) return
    OnRamp.step(pathname, { _eventType: 'nav_entered', properties: { _nav: true } })
  }, [pathname])

  return null
}
