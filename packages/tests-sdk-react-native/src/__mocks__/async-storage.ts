import { vi } from 'vitest'

// Backed by jsdom's localStorage so data survives vi.resetModules() calls.
// Tests can call localStorage.clear() (or AsyncStorage.clear()) in beforeEach
// to ensure isolation between suites.
const AsyncStorage = {
  getItem: vi.fn((key: string): Promise<string | null> =>
    Promise.resolve(localStorage.getItem(key))
  ),
  setItem: vi.fn((key: string, value: string): Promise<void> => {
    localStorage.setItem(key, value)
    return Promise.resolve()
  }),
  removeItem: vi.fn((key: string): Promise<void> => {
    localStorage.removeItem(key)
    return Promise.resolve()
  }),
  clear: vi.fn((): Promise<void> => {
    localStorage.clear()
    return Promise.resolve()
  }),
}

export default AsyncStorage
