declare module '@react-native-async-storage/async-storage' {
  const AsyncStorage: {
    getItem(key: string): Promise<string | null>
    setItem(key: string, value: string): Promise<void>
    removeItem(key: string): Promise<void>
    clear(): Promise<void>
  }
  export default AsyncStorage
}

declare module 'react-native' {
  export const AppState: {
    addEventListener(event: string, handler: (state: string) => void): { remove(): void }
    __simulateChange?(state: string): void
    __resetListener?(): void
  }

  export const Platform: {
    OS: 'ios' | 'android' | 'web' | string
    Version: string | number
    isTV: boolean
    isPad: boolean
  }
}
