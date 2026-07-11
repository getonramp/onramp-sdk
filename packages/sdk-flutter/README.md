# onramp_sdk

OnRamp SDK for Flutter — onboarding funnel visibility for iOS and Android apps.

Track where users drop off during onboarding, see step-by-step conversion, and segment by OS version, device type, or any custom property — all without video recording.

**[getonramp.dev](https://getonramp.dev)**

---

## Installation

```bash
flutter pub add onramp_sdk
```

---

## Quick Start

```dart
import 'package:onramp_sdk/onramp_sdk.dart';

// Once at app start — await in main() before runApp()
Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await OnRamp.initialize(
    apiKey: 'onr_your_key',
    host: 'https://your-ingestion-url',
    appVersion: '1.0.0', // optional — enables version breakdown in the dashboard
  );
  runApp(const MyApp());
}
```

```dart
// At each meaningful onboarding milestone
OnRamp.step('account_created');
OnRamp.step('profile_completed', properties: {'plan': 'free'});
OnRamp.step('first_action_done');

// After sign-in — link the anonymous journey to a real user
OnRamp.identify({'userId': user.id, 'email': user.email});

// After sign-out — start a fresh session for the next user
OnRamp.newSession();
```

---

## API

| Method | Description |
|---|---|
| `OnRamp.initialize({apiKey, host, appVersion?})` | Initialize once at app start. Restores the previous session if the user returned within 30 min. |
| `OnRamp.step(name, {properties?})` | Track a conversion milestone. Properties become breakdown dimensions in the dashboard. |
| `OnRamp.identify(traits)` | Associate the current user with known traits (userId, email, plan, etc.). Call once after sign-in. |
| `OnRamp.newSession()` | Force a new session. Call after sign-out so the next user starts fresh. |
| `OnRamp.flush()` | Await all in-flight events. Useful on app pause or before process exit. |
| `OnRamp.getIds()` | Returns `(anonymousId, sessionId)` — pass to your server to join backend events to this journey. |

---

## Funnels

Funnels are **defined in the dashboard**, not in the SDK. Call `OnRamp.step()` anywhere with a name — no routing, no step index, no ceremony. Then in the dashboard pick which steps belong to a funnel, in what order, and instantly see historical conversion.

This means you can reorder steps or add new ones in the dashboard without shipping an app update.
