# @onramp-sdk/react

OnRamp onboarding funnel analytics for **React & Next.js**. Track where users drop off during onboarding, with hooks and a provider that fit naturally into a React tree.

**[getonramp.dev](https://getonramp.dev)**

## Installation

```bash
npm install @onramp-sdk/react
# or
yarn add @onramp-sdk/react
```

`react >= 18` is a peer dependency. `next >= 13` is an optional peer - only needed for the route tracker in `@onramp-sdk/react/next`.

## Setup

### 1. Wrap your app in the provider

`<OnRampProvider>` initializes the SDK once on the client. It's SSR-safe - it no-ops on the server and starts tracking in the browser.

**Next.js App Router** (`app/layout.tsx`):

```tsx
import { OnRampProvider } from '@onramp-sdk/react'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        <OnRampProvider apiKey="onr_your_api_key" host="https://your-ingestion-url" appVersion="1.0.0">
          {children}
        </OnRampProvider>
      </body>
    </html>
  )
}
```

`<OnRampProvider>` is a client component, so it only opts its own subtree into client rendering - your layout and pages stay server components.

**Plain React** (e.g. Vite, CRA): wrap your root the same way.

### 2. Track milestones

From any client component below the provider:

```tsx
'use client'
import { useOnRamp } from '@onramp-sdk/react'

export function PlanPicker() {
  const { step } = useOnRamp()
  return (
    <button onClick={() => step('plan_selected', { properties: { plan: 'pro' } })}>
      Choose Pro
    </button>
  )
}
```

Or mark a step the moment a screen renders with `useTrackStep`:

```tsx
'use client'
import { useTrackStep } from '@onramp-sdk/react'

export function ProfileSetup() {
  useTrackStep('profile_setup_viewed')
  return <>...</>
}
```

### 3. (Next.js) Auto-track route changes - optional

Mount `<OnRampRouteTracker />` once inside the provider to record every App Router navigation. These are tagged as navigation events and kept **out** of your defined funnels - they power the session timeline, not conversion steps.

```tsx
import { OnRampProvider } from '@onramp-sdk/react'
import { OnRampRouteTracker } from '@onramp-sdk/react/next'

<OnRampProvider apiKey="onr_your_api_key">
  <OnRampRouteTracker />
  {children}
</OnRampProvider>
```

## API

### `<OnRampProvider>`

| Prop | Type | Required | Description |
|---|---|---|---|
| `apiKey` | `string` | ✓ | Your app's API key from the OnRamp dashboard |
| `host` | `string` | | Ingestion API base URL |
| `appVersion` | `string` | | App version string - enables the version breakdown |
| `framework` | `string` | | Runtime label on each event (default `'react'`; e.g. `'nextjs'`) |
| `sessionTimeoutMs` | `number` | | Idle window before a new session starts (default 30 min) |

### `useOnRamp()`

Returns `{ step, newSession, flush }`.

- `step(stepName, { properties? })` - track a milestone.
- `newSession()` - force-start a new session (e.g. after logout).
- `flush()` - flush queued events immediately (also runs automatically on tab hide/close).

### `useTrackStep(stepName, options?)`

Fires a step on mount (and again if `stepName` changes).

| Option | Type | Description |
|---|---|---|
| `properties` | `Record<string, string \| number \| boolean>` | Custom properties for this step |
| `enabled` | `boolean` | Skip tracking while `false` (e.g. gate on a ready state) |

### Imperative `OnRamp`

The same singleton is exported directly for use outside the React tree (e.g. event handlers in non-component modules): `import { OnRamp } from '@onramp-sdk/react'`. Call `OnRamp.init(config)` yourself if you don't use the provider.

## How Funnels Work

Funnels are defined in the **OnRamp dashboard**, not in the SDK. You call `step()` with a step name; the dashboard decides which steps form which funnel and in what order - no SDK changes when you iterate on funnel structure.

## License

MIT
