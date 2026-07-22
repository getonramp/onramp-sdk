# OnRamp Analytics

[![SDK CI](https://github.com/getonramp/onramp-sdk/actions/workflows/ci.yml/badge.svg)](https://github.com/getonramp/onramp-sdk/actions/workflows/ci.yml)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Public SDKs for OnRamp onboarding funnel analytics on mobile and web. The hosted OnRamp application and infrastructure are not part of this repository.

**[Website](https://getonramp.dev)** · **[Documentation](https://getonramp.dev/docs)** · **[Quick start](https://getonramp.dev/docs/getting-started)**

**[React Native + Expo onboarding example](examples/react-native-expo-onboarding)** · **[React Native implementation guide](https://getonramp.dev/blog/react-native-onboarding-analytics)**

---

## The Problem

Most analytics tools tell you *what* users did, not *where they gave up during onboarding*. SaaS has mature funnel tools. Mobile has almost nothing affordable, privacy-safe, and actionable.

OnRamp fills that gap: track key milestones in your app, define funnels in the dashboard, and immediately see step-by-step conversion with OS/device breakdowns and custom property segmentation.

---

## Quick Start - React Native

```bash
npm install @onramp-sdk/react-native @react-native-async-storage/async-storage
```

```typescript
import { OnRamp } from '@onramp-sdk/react-native'

// Once at app start (App.tsx)
await OnRamp.init({
  apiKey: 'onr_your_key',
  host: 'https://your-ingestion-url',
  appVersion: '1.0.0',   // optional - enables version breakdown
})

// At each meaningful milestone
OnRamp.step('account_created')
OnRamp.step('profile_completed')
OnRamp.step('first_action_done', {
  properties: { plan: 'free', source: 'invite' },
})
```

**Auto-track navigation** (React Navigation users):

```typescript
import { NavigationTracker } from '@onramp-sdk/react-native'

<NavigationTracker>
  <NavigationContainer>
    {/* your navigators */}
  </NavigationContainer>
</NavigationTracker>
```

---

## Quick Start - React & Next.js

```bash
npm install @onramp-sdk/react
```

```tsx
// Wrap your app once (Next.js: app/layout.tsx; React: your root)
import { OnRampProvider } from '@onramp-sdk/react'

<OnRampProvider apiKey="onr_your_key" host="https://your-ingestion-url" appVersion="1.0.0">
  {children}
</OnRampProvider>
```

```tsx
// Track from any client component below the provider
import { useOnRamp, useTrackStep } from '@onramp-sdk/react'

useTrackStep('profile_setup_viewed')        // fires on render
const { step } = useOnRamp()
step('account_created', { properties: { plan: 'free' } })
```

**Auto-track routes** (Next.js App Router) - mount once inside the provider:

```tsx
import { OnRampRouteTracker } from '@onramp-sdk/react/next'
// <OnRampProvider ...><OnRampRouteTracker />{children}</OnRampProvider>
```

> Next.js uses this same `@onramp-sdk/react` package - the App Router tracker just lives in the `@onramp-sdk/react/next` entry point. No separate Next package.

---

## Quick Start - Web

```bash
npm install @onramp-sdk/web
```

```typescript
import { OnRamp } from '@onramp-sdk/web'

// Once on page load
OnRamp.init({
  apiKey: 'onr_your_key',
  host: 'https://your-ingestion-url',
})

// At each meaningful milestone
OnRamp.step('signup_started')
OnRamp.step('email_verified')
OnRamp.step('first_action_done', {
  properties: { plan: 'free', referrer: 'producthunt' },
})
```

---

## Quick Start - Flutter

```bash
flutter pub add onramp_sdk
```

```dart
import 'package:onramp_sdk/onramp_sdk.dart';

// Once at app start — await in main() before runApp()
await OnRamp.initialize(
  apiKey: 'onr_your_key',
  host: 'https://your-ingestion-url',
  appVersion: '1.0.0',   // optional - enables version breakdown
)

// At each meaningful milestone
OnRamp.step('account_created')
OnRamp.step('profile_completed')
OnRamp.step('first_action_done', properties: {'plan': 'free', 'source': 'invite'})

// After sign-in - link anonymous journey to a real user
OnRamp.identify({'userId': user.id, 'email': user.email})
```

---

## Quick Start - iOS (Swift)

Add via Xcode → File → Add Package Dependencies: `https://github.com/getonramp/onramp-swift`

```swift
import OnRamp

// UIKit: application(_:didFinishLaunchingWithOptions:)
// SwiftUI: App init()
OnRamp.initialize(
    apiKey: "onr_your_key",
    host: "https://your-ingestion-url",
    appVersion: Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String
)

// At each meaningful milestone
OnRamp.step("account_created")
OnRamp.step("first_action_done", properties: ["plan": "free"])

// After sign-in
OnRamp.identify(["userId": user.id, "email": user.email])
```

---

## How Funnels Work

Funnels are **defined in the dashboard**, not in the SDK. You call `OnRamp.step()` anywhere in your code with a step name - no funnel routing, no step index, no ceremony. Then in the dashboard you create a funnel definition, pick which steps belong to it and in what order, give them display labels, and instantly see historical conversion for those steps.

This means:
- You can reorder steps in the dashboard without shipping a new app version
- The same step (e.g. `account_created`) can appear in multiple funnels
- Custom properties passed to `step()` become breakdown dimensions in the funnel chart

---

## Dashboard Features

| Feature | Description |
|---|---|
| **Funnel builder** | Define step order + display labels without touching the SDK |
| **Step-by-step conversion** | Visual funnel with drop-off % between every step |
| **Segment breakdowns** | Split conversion by OS version, app version, device type, or any custom property |
| **Session timeline** | See every screen each user visited, with timing |
| **Realtime view** | Active sessions in the last 10 minutes |
| **Conversion trends** | Daily conversion rate over time with period-over-period delta |
| **Weekly digest** | Email summary of funnel metrics every Monday |
| **Alerts** | Slack webhook when conversion drops below your threshold |

---

## Repository scope

This repository contains the TypeScript and Flutter SDKs plus their automated tests. The native Swift SDK is maintained separately at [getonramp/onramp-swift](https://github.com/getonramp/onramp-swift). Product documentation lives at [getonramp.dev/docs](https://getonramp.dev/docs).

The dashboard, APIs, workers, database migrations, deployment configuration, and other OnRamp infrastructure are intentionally private.

---

## Packages

| Package | Version | Description |
|---|---|---|
| [`@onramp-sdk/react-native`](packages/sdk-react-native) | 0.7.2 | React Native and Expo SDK |
| [`@onramp-sdk/react`](packages/sdk-react) | 0.3.4 | React and Next.js SDK |
| [`@onramp-sdk/web`](packages/sdk-web) | 0.5.4 | Web SDK |
| [`@onramp-sdk/core`](packages/sdk-core) | 0.6.2 | Platform-agnostic core |
| [`@onramp-sdk/shared`](packages/shared) | 0.4.1 | Shared event types and schema |
| [`onramp_sdk`](packages/sdk-flutter) | 0.2.0 | Flutter SDK |
| [`OnRamp`](packages/sdk-ios) | — | iOS (Swift) SDK via Swift Package Manager |

---

## Domain

`getonramp.dev`

## Contributing and security

Bug reports and focused SDK improvements are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. Please report vulnerabilities privately using the process in [SECURITY.md](SECURITY.md), not through a public issue.
