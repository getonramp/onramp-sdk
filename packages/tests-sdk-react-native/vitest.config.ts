import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// @onramp-sdk/react-native's CJS dist requires the real "react-native" package,
// which contains Flow-typed source that esbuild cannot parse. Aliasing the SDK
// to its TypeScript source lets Vite process everything through its own pipeline
// (esbuild-with-TypeScript-support), where the react-native/async-storage aliases
// below redirect those imports to lightweight local mocks.
const sdkSrc = resolve(__dirname, '../sdk-react-native/src')

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@onramp-sdk/react-native': resolve(sdkSrc, 'index.ts'),
      'react-native': resolve(__dirname, 'src/__mocks__/react-native.ts'),
      '@react-native-async-storage/async-storage': resolve(
        __dirname,
        'src/__mocks__/async-storage.ts'
      ),
    },
  },
  test: {
    environment: 'jsdom',
  },
})
