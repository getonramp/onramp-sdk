import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render } from '@testing-library/react'
import React from 'react'
import { NavigationTracker, OnRamp } from '@onramp-sdk/react-native'

vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))

describe('NavigationTracker', () => {
  beforeEach(() => {
    vi.spyOn(OnRamp, 'step').mockImplementation(() => {})
    vi.spyOn(OnRamp, 'init').mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('passes an onStateChange prop to its single child', () => {
    const receivedProps: Record<string, unknown> = {}
    function Child(props: Record<string, unknown>) {
      Object.assign(receivedProps, props)
      return <div />
    }

    render(
      <NavigationTracker>
        <Child />
      </NavigationTracker>
    )

    expect(typeof receivedProps.onStateChange).toBe('function')
  })

  it('tracks a simple flat navigation state as the active route name', () => {
    let capturedOnStateChange: ((state: unknown) => void) | undefined

    function Child({ onStateChange }: { onStateChange?: (state: unknown) => void }) {
      capturedOnStateChange = onStateChange
      return <div />
    }

    render(
      <NavigationTracker>
        <Child />
      </NavigationTracker>
    )

    capturedOnStateChange!({
      routes: [{ name: 'Home' }, { name: 'Profile' }],
      index: 1,
    })

    expect(OnRamp.step).toHaveBeenCalledWith('Profile', {
      _eventType: 'nav_entered',
      properties: { _nav: true },
    })
  })

  it('resolves nested navigation state to the leaf route name', () => {
    let capturedOnStateChange: ((state: unknown) => void) | undefined

    function Child({ onStateChange }: { onStateChange?: (state: unknown) => void }) {
      capturedOnStateChange = onStateChange
      return <div />
    }

    render(
      <NavigationTracker>
        <Child />
      </NavigationTracker>
    )

    capturedOnStateChange!({
      routes: [
        {
          name: 'Tabs',
          state: {
            routes: [{ name: 'Feed' }, { name: 'Settings' }],
            index: 1,
          },
        },
      ],
      index: 0,
    })

    expect(OnRamp.step).toHaveBeenCalledWith('Settings', expect.anything())
  })

  it('falls back to "screen" when navigation state has no routes', () => {
    let capturedOnStateChange: ((state: unknown) => void) | undefined

    function Child({ onStateChange }: { onStateChange?: (state: unknown) => void }) {
      capturedOnStateChange = onStateChange
      return <div />
    }

    render(
      <NavigationTracker>
        <Child />
      </NavigationTracker>
    )

    capturedOnStateChange!({ routes: [] })

    expect(OnRamp.step).toHaveBeenCalledWith('screen', expect.anything())
  })

  it('uses the last route when no index is set', () => {
    let capturedOnStateChange: ((state: unknown) => void) | undefined

    function Child({ onStateChange }: { onStateChange?: (state: unknown) => void }) {
      capturedOnStateChange = onStateChange
      return <div />
    }

    render(
      <NavigationTracker>
        <Child />
      </NavigationTracker>
    )

    capturedOnStateChange!({
      routes: [{ name: 'First' }, { name: 'Last' }],
      // no index — should default to routes.length - 1
    })

    expect(OnRamp.step).toHaveBeenCalledWith('Last', expect.anything())
  })
})
