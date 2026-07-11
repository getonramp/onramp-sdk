import React from 'react'
import { OnRamp } from './OnRamp.js'

interface Props {
  children: React.ReactNode
}

// Traverse nested navigation state to find the leaf route name
type NavState = { routes: Array<{ name: string; state?: NavState }>; index?: number }
function getActiveRouteName(state: NavState | undefined): string {
  if (!state?.routes?.length) return 'screen'
  const route = state.routes[state.index ?? state.routes.length - 1]
  if (route.state) return getActiveRouteName(route.state)
  return route.name
}

export function NavigationTracker({ children }: Props) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function onStateChange(state: any) {
    const screenName = getActiveRouteName(state)
    OnRamp.step(screenName, {
      _eventType: 'nav_entered',
      properties: { _nav: true },
    })
  }

  return React.cloneElement(React.Children.only(children) as React.ReactElement, {
    onStateChange,
  })
}
