import { vi } from 'vitest'

type AppStateHandler = (state: string) => void

let _listener: AppStateHandler | null = null

export const AppState = {
  addEventListener: vi.fn((_event: string, handler: AppStateHandler) => {
    _listener = handler
    return { remove: vi.fn() }
  }),
  __simulateChange: (state: string) => _listener?.(state),
  __resetListener: () => { _listener = null },
}

export const Platform = {
  OS: 'ios' as const,
  Version: '17.0',
  isTV: false,
  isPad: false,
}
