'use client'

import { createContext, useContext, useRef } from 'react'
import type { ReactNode } from 'react'
import { OnRamp, type OnRampReactConfig } from './core.js'

const OnRampContext = createContext<boolean>(false)

export interface OnRampProviderProps extends OnRampReactConfig {
  children: ReactNode
}

/**
 * Initializes OnRamp once on the client and makes the tracker available to
 * `useOnRamp` / `useTrackStep` below it. Render it high in your tree - in
 * Next.js App Router, inside the root layout (it's a client component, so it
 * won't opt your whole layout into client rendering; only its own subtree).
 */
export function OnRampProvider({ children, ...config }: OnRampProviderProps) {
  const configRef = useRef(config)
  configRef.current = config

  // Init synchronously during render so the client is ready before any child
  // effects fire (e.g. OnRampRouteTracker). init() is a no-op on the server
  // (hasWindow() guard) and idempotent on re-renders (started flag).
  OnRamp.init(configRef.current)

  return <OnRampContext.Provider value={true}>{children}</OnRampContext.Provider>
}

/** @internal - true when a provider is mounted above the caller. */
export function useHasOnRampProvider(): boolean {
  return useContext(OnRampContext)
}
