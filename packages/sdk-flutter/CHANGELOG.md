## 0.2.0

- Updated homepage to getonramp.dev
- Improved README with full API reference

## 0.1.0

- Initial release
- `OnRamp.initialize()` — persists anonymous ID and resumes sessions across app launches
- `OnRamp.step()` — fire-and-forget milestone tracking with optional properties
- `OnRamp.identify()` — links anonymous journey to a known user
- `OnRamp.newSession()` — rotates session on sign-out
- `OnRamp.flush()` — awaits all in-flight HTTP sends
- `OnRamp.getIds()` — exposes anonymous and session IDs for server-side joins
- 30-minute session timeout with SharedPreferences persistence
