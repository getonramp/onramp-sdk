import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import React from 'react'
import { useTrackStep, OnRampProvider, OnRamp } from '@onramp-sdk/react'

vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))

function wrapper({ children }: { children: React.ReactNode }) {
  return <OnRampProvider apiKey="test-key">{children}</OnRampProvider>
}

describe('useTrackStep', () => {
  beforeEach(() => {
    vi.spyOn(OnRamp, 'init').mockImplementation(() => {})
    vi.spyOn(OnRamp, 'step').mockImplementation(() => {})
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('fires OnRamp.step with the step name on mount', () => {
    renderHook(() => useTrackStep('welcome_screen'), { wrapper })
    expect(OnRamp.step).toHaveBeenCalledOnce()
    expect(OnRamp.step).toHaveBeenCalledWith(
      'welcome_screen',
      expect.objectContaining({ properties: undefined })
    )
  })

  it('passes custom properties to OnRamp.step', () => {
    renderHook(
      () => useTrackStep('profile_setup', { properties: { source: 'invite', count: 3 } }),
      { wrapper }
    )
    expect(OnRamp.step).toHaveBeenCalledWith(
      'profile_setup',
      expect.objectContaining({ properties: { source: 'invite', count: 3 } })
    )
  })

  it('does not fire when enabled is false', () => {
    renderHook(() => useTrackStep('gated_screen', { enabled: false }), { wrapper })
    expect(OnRamp.step).not.toHaveBeenCalled()
  })

  it('fires when enabled transitions from false to true', () => {
    const { rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useTrackStep('payment_screen', { enabled }),
      { wrapper, initialProps: { enabled: false } }
    )

    expect(OnRamp.step).not.toHaveBeenCalled()

    rerender({ enabled: true })

    expect(OnRamp.step).toHaveBeenCalledOnce()
    expect(OnRamp.step).toHaveBeenCalledWith('payment_screen', expect.anything())
  })

  it('re-fires when the stepName changes', () => {
    const { rerender } = renderHook(
      ({ name }: { name: string }) => useTrackStep(name),
      { wrapper, initialProps: { name: 'step_a' } }
    )

    expect(OnRamp.step).toHaveBeenCalledWith('step_a', expect.anything())
    vi.clearAllMocks()

    rerender({ name: 'step_b' })

    expect(OnRamp.step).toHaveBeenCalledWith('step_b', expect.anything())
  })

  it('does not re-fire when the same stepName re-renders with unchanged properties', () => {
    const { rerender } = renderHook(
      () => useTrackStep('stable_step', { properties: { x: 1 } }),
      { wrapper }
    )

    expect(OnRamp.step).toHaveBeenCalledOnce()
    vi.clearAllMocks()

    // Re-render with the same props — the properties object is re-created but
    // useTrackStep serializes it, so the effect should not re-fire
    rerender()

    expect(OnRamp.step).not.toHaveBeenCalled()
  })
})
