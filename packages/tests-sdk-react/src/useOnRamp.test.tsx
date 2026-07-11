import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import React from 'react'
import { useOnRamp, OnRampProvider, OnRamp } from '@onramp-sdk/react'

vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))

function wrapper({ children }: { children: React.ReactNode }) {
  return <OnRampProvider apiKey="test-key">{children}</OnRampProvider>
}

describe('useOnRamp', () => {
  beforeEach(() => {
    vi.spyOn(OnRamp, 'init').mockImplementation(() => {})
    vi.spyOn(OnRamp, 'step').mockImplementation(() => {})
    vi.spyOn(OnRamp, 'flush').mockResolvedValue(undefined)
    vi.spyOn(OnRamp, 'newSession').mockImplementation(() => {})
    vi.spyOn(OnRamp, 'getIds').mockReturnValue({ anonymousId: 'anon-1', sessionId: 'sess-1' })
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns a step function that delegates to OnRamp.step', () => {
    const { result } = renderHook(() => useOnRamp(), { wrapper })
    act(() => {
      result.current.step('plan_selected', { properties: { plan: 'pro' } })
    })
    expect(OnRamp.step).toHaveBeenCalledWith('plan_selected', { properties: { plan: 'pro' } })
  })

  it('returns a flush function that delegates to OnRamp.flush', async () => {
    const { result } = renderHook(() => useOnRamp(), { wrapper })
    await act(async () => {
      await result.current.flush()
    })
    expect(OnRamp.flush).toHaveBeenCalledOnce()
  })

  it('returns a newSession function that delegates to OnRamp.newSession', () => {
    const { result } = renderHook(() => useOnRamp(), { wrapper })
    act(() => {
      result.current.newSession()
    })
    expect(OnRamp.newSession).toHaveBeenCalledOnce()
  })

  it('returns a getIds function that delegates to OnRamp.getIds', () => {
    const { result } = renderHook(() => useOnRamp(), { wrapper })
    const ids = result.current.getIds()
    expect(ids).toEqual({ anonymousId: 'anon-1', sessionId: 'sess-1' })
    expect(OnRamp.getIds).toHaveBeenCalledOnce()
  })

  it('warns when used outside of OnRampProvider', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    // Render without a wrapper so there's no provider in the tree
    renderHook(() => useOnRamp())

    // Warning fires asynchronously in useEffect
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('OnRampProvider'))
    warn.mockRestore()
  })
})
