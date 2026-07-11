# @onramp-sdk/react-native

OnRamp onboarding funnel analytics for React Native. Track where users drop off during onboarding - without video recording.

**[getonramp.dev](https://getonramp.dev)**

## Installation

```bash
npm install @onramp-sdk/react-native @react-native-async-storage/async-storage
# or
yarn add @onramp-sdk/react-native @react-native-async-storage/async-storage
```

React Navigation auto-tracking (optional):

```bash
npm install @react-navigation/native
```

## Setup

### 1. Initialize

Call `OnRamp.init()` once at app start, before any navigation renders:

```typescript
import { OnRamp } from '@onramp-sdk/react-native'

// App.tsx
await OnRamp.init({
  apiKey: 'onr_your_api_key',        // from the OnRamp dashboard
  host: 'https://your-ingestion-url', // your ingestion API URL
  appVersion: '1.0.0',               // optional - enables version breakdown
})
```

### 2. Track milestones

Call `OnRamp.step()` at each meaningful moment in your onboarding flow:

```typescript
// Inside your sign-up handler
OnRamp.step('account_created')

// After profile setup
OnRamp.step('profile_completed')

// After the first meaningful action - attach properties for richer breakdowns
OnRamp.step('first_action_done', {
  properties: {
    plan: 'free',
    source: 'organic',
    items_added: 3,
  },
})
```

Step names can be anything - they appear in the dashboard where you build your funnel definition.

### 3. Auto-track navigation (optional)

Wrap your `NavigationContainer` with `NavigationTracker` to populate the Session Timeline - a per-user view of every screen visited between milestones:

```typescript
import { NavigationTracker } from '@onramp-sdk/react-native'
import { NavigationContainer } from '@react-navigation/native'

export function App() {
  return (
    <NavigationTracker>
      <NavigationContainer>
        {/* your stack/tab navigators */}
      </NavigationContainer>
    </NavigationTracker>
  )
}
```

## API

### `OnRamp.init(config)`

| Option | Type | Required | Description |
|---|---|---|---|
| `apiKey` | `string` | ✓ | Your app's API key from the OnRamp dashboard |
| `host` | `string` | | Ingestion API base URL (default: `http://localhost:3001`) |
| `appVersion` | `string` | | App version string - enables version breakdown in dashboard |
| `sessionTimeoutMs` | `number` | | Idle time before a new session starts (default: 30 min) |

### `OnRamp.step(stepName, options?)`

| Option | Type | Description |
|---|---|---|
| `stepName` | `string` | Identifier for this milestone - e.g. `'account_created'` |
| `options.properties` | `Record<string, string \| number \| boolean>` | Custom properties to attach - become breakdown dimensions in the dashboard |

### `OnRamp.newSession()`

Force-start a new session (e.g. after logout).

### `OnRamp.flush()`

Flush the event queue immediately. Called automatically when the app backgrounds.

## How Funnels Work

Funnels are defined in the **OnRamp dashboard**, not in the SDK. You call `OnRamp.step()` with a step name - the dashboard lets you pick which steps belong to which funnel, reorder them, and give them display labels. No SDK changes needed when you iterate on your funnel structure.

## Session Handling

OnRamp automatically manages sessions using AsyncStorage. A session persists across app foregrounding/backgrounding within the configured timeout window (default: 30 minutes). After the timeout, the next `step()` call starts a new session.

## Expo

Fully compatible with Expo managed and bare workflows. No native modules required beyond `@react-native-async-storage/async-storage`.

## License

MIT
