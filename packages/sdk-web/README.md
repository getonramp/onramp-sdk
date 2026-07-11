# @onramp-sdk/web

OnRamp onboarding funnel analytics for web apps. Track where users drop off during onboarding - works with any JS framework.

**[getonramp.dev](https://getonramp.dev)**

## Installation

```bash
npm install @onramp-sdk/web
# or
yarn add @onramp-sdk/web
```

## Setup

### 1. Initialize

Call `OnRamp.init()` once at app start:

```typescript
import { OnRamp } from '@onramp-sdk/web'

OnRamp.init({
  apiKey: 'onr_your_api_key',         // from the OnRamp dashboard
  host: 'https://your-ingestion-url',  // your ingestion API URL
  appVersion: '1.0.0',                // optional - enables version breakdown
})
```

### 2. Track milestones

Call `OnRamp.step()` at each meaningful moment in your onboarding flow:

```typescript
// After account creation
OnRamp.step('account_created')

// After completing setup
OnRamp.step('profile_completed')

// After first meaningful action - attach properties for richer breakdowns
OnRamp.step('first_action_done', {
  properties: {
    plan: 'free',
    referrer: 'producthunt',
    items_added: 3,
  },
})
```

## API

### `OnRamp.init(config)`

| Option | Type | Required | Description |
|---|---|---|---|
| `apiKey` | `string` | ✓ | Your app's API key from the OnRamp dashboard |
| `host` | `string` | | Ingestion API base URL (default: `http://localhost:3001`) |
| `appVersion` | `string` | | App version string - enables version breakdown in dashboard |

### `OnRamp.step(stepName, options?)`

| Option | Type | Description |
|---|---|---|
| `stepName` | `string` | Identifier for this milestone - e.g. `'account_created'` |
| `options.properties` | `Record<string, string \| number \| boolean>` | Custom properties - become breakdown dimensions in the dashboard |

### `OnRamp.newSession()`

Force-start a new session (e.g. after logout or page load into a new context).

### `OnRamp.flush()`

Flush the event queue immediately. Called automatically on `pagehide` and `visibilitychange`.

## How Funnels Work

Funnels are defined in the **OnRamp dashboard**, not in the SDK. You call `OnRamp.step()` with a step name - the dashboard lets you pick which steps belong to which funnel and in what order. No SDK changes needed when you iterate on your funnel structure.

## Framework Notes

- **Next.js / SSR**: Call `OnRamp.init()` on the client side only (inside `useEffect` or a client component). The SDK accesses `localStorage` and `window` - it is safe in SSR environments (access is guarded), but events are only tracked in the browser.
- **SPA routing**: Call `OnRamp.newSession()` if you want a new session to start on a specific navigation event (e.g. user logs out and logs back in).

## License

MIT
