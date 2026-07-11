import 'package:shared_preferences/shared_preferences.dart';

const _anonKey = 'onramp_anonymous_id';
const _sessionIdKey = 'onramp_session_id';
const _sessionLastActiveKey = 'onramp_session_last_active_ms';
const _sessionStepCountKey = 'onramp_session_step_count';

Future<String?> loadAnonymousId() async {
  final prefs = await SharedPreferences.getInstance();
  return prefs.getString(_anonKey);
}

Future<void> saveAnonymousId(String id) async {
  final prefs = await SharedPreferences.getInstance();
  await prefs.setString(_anonKey, id);
}

class StoredSession {
  final String id;
  final int lastActiveMs;
  final int stepCount;

  const StoredSession({
    required this.id,
    required this.lastActiveMs,
    required this.stepCount,
  });
}

Future<StoredSession?> loadSession() async {
  final prefs = await SharedPreferences.getInstance();
  final id = prefs.getString(_sessionIdKey);
  if (id == null) return null;
  return StoredSession(
    id: id,
    lastActiveMs: prefs.getInt(_sessionLastActiveKey) ?? 0,
    stepCount: prefs.getInt(_sessionStepCountKey) ?? 0,
  );
}

Future<void> saveSession(StoredSession session) async {
  final prefs = await SharedPreferences.getInstance();
  await prefs.setString(_sessionIdKey, session.id);
  await prefs.setInt(_sessionLastActiveKey, session.lastActiveMs);
  await prefs.setInt(_sessionStepCountKey, session.stepCount);
}
