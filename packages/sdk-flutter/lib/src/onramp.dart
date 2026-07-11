import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

import 'storage.dart';

String _uuid() {
  final r = Random.secure();
  final bytes = List<int>.generate(16, (_) => r.nextInt(256));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  String hex(int b) => b.toRadixString(16).padLeft(2, '0');
  final h = bytes.map(hex).join();
  return '${h.substring(0, 8)}-${h.substring(8, 12)}-'
      '${h.substring(12, 16)}-${h.substring(16, 20)}-${h.substring(20)}';
}

final class OnRamp {
  OnRamp._();

  static const _sessionTimeoutMs = 30 * 60 * 1000;

  static String _apiKey = '';
  static String _host = '';
  static String? _appVersion;
  static String _anonymousId = '';
  static String _sessionId = '';
  static int _stepIndex = 0;
  static int _lastActiveMs = 0;

  // Tracks in-flight HTTP futures so flush() can await them.
  static final _inflight = <Future<void>>[];

  /// Overridden in tests to intercept HTTP calls without touching the network.
  @visibleForTesting
  static http.Client? httpClient;

  static Future<void> initialize({
    required String apiKey,
    required String host,
    String? appVersion,
  }) async {
    _apiKey = apiKey;
    _host = host.endsWith('/') ? host.substring(0, host.length - 1) : host;
    _appVersion = appVersion;

    final storedAnonId = await loadAnonymousId();
    if (storedAnonId != null) {
      _anonymousId = storedAnonId;
    } else {
      _anonymousId = _uuid();
      await saveAnonymousId(_anonymousId);
    }

    final stored = await loadSession();
    final now = DateTime.now().millisecondsSinceEpoch;
    if (stored != null && now - stored.lastActiveMs < _sessionTimeoutMs) {
      _sessionId = stored.id;
      _stepIndex = stored.stepCount;
      _lastActiveMs = stored.lastActiveMs;
    } else {
      _rotateSession();
    }
  }

  static void _rotateSession() {
    _sessionId = _uuid();
    _stepIndex = 0;
    _lastActiveMs = DateTime.now().millisecondsSinceEpoch;
    unawaited(saveSession(StoredSession(
      id: _sessionId,
      lastActiveMs: _lastActiveMs,
      stepCount: _stepIndex,
    )));
  }

  static void _refreshSession() {
    final now = DateTime.now().millisecondsSinceEpoch;
    if (_sessionId.isEmpty || now - _lastActiveMs > _sessionTimeoutMs) {
      _rotateSession();
    }
    _lastActiveMs = now;
  }

  static void step(String name, {Map<String, Object>? properties}) {
    if (_apiKey.isEmpty) {
      assert(false, '[OnRamp] call initialize() before tracking steps');
      return;
    }
    _refreshSession();
    final index = _stepIndex++;
    _lastActiveMs = DateTime.now().millisecondsSinceEpoch;
    unawaited(saveSession(StoredSession(
      id: _sessionId,
      lastActiveMs: _lastActiveMs,
      stepCount: _stepIndex,
    )));

    final event = <String, Object>{
      'schema_version': '1.0',
      'event_id': _uuid(),
      'event_type': 'step_entered',
      'app_key': _apiKey,
      'session_id': _sessionId,
      'anonymous_id': _anonymousId,
      'step_name': name,
      'step_index': index,
      'client_timestamp_ms': DateTime.now().millisecondsSinceEpoch,
      'platform': _platform,
      'os_version': _osVersion,
      'device_type': _deviceType,
    };
    if (_appVersion != null) event['app_version'] = _appVersion!;
    if (properties != null) event['properties'] = properties;
    _send(event);
  }

  /// Associate the current user with known traits (email, user ID, etc.).
  /// Call once after sign-in so connected integrations can match this user.
  ///
  /// ```dart
  /// OnRamp.identify({'email': user.email, 'userId': user.id});
  /// ```
  static void identify(Map<String, Object> traits) {
    if (_apiKey.isEmpty) {
      assert(false, '[OnRamp] call initialize() before calling identify()');
      return;
    }
    _refreshSession();

    final event = <String, Object>{
      'schema_version': '1.0',
      'event_id': _uuid(),
      'event_type': 'identify',
      'app_key': _apiKey,
      'session_id': _sessionId,
      'anonymous_id': _anonymousId,
      'step_name': '_identify',
      'step_index': 0,
      'client_timestamp_ms': DateTime.now().millisecondsSinceEpoch,
      'platform': _platform,
      'properties': traits,
    };
    if (_appVersion != null) event['app_version'] = _appVersion!;
    _send(event);
  }

  /// Force a new session. Call after sign-out so the next user starts fresh.
  static void newSession() => _rotateSession();

  /// Wait for all in-flight events to finish sending.
  /// Useful on app pause / before process exit.
  static Future<void> flush() async {
    if (_inflight.isEmpty) return;
    await Future.wait(List.from(_inflight));
    _inflight.clear();
  }

  /// Returns the current anonymous and session IDs so your server can
  /// associate backend events (purchases, trial starts) with this journey.
  static ({String anonymousId, String sessionId}) getIds() =>
      (anonymousId: _anonymousId, sessionId: _sessionId);

  static bool get isInitialized => _apiKey.isNotEmpty;

  @visibleForTesting
  static void reset() {
    _apiKey = '';
    _host = '';
    _appVersion = null;
    _anonymousId = '';
    _sessionId = '';
    _stepIndex = 0;
    _lastActiveMs = 0;
    _inflight.clear();
    httpClient = null;
  }

  static void _send(Map<String, Object> event) {
    final client = httpClient ?? http.Client();
    final f = client
        .post(
          Uri.parse('$_host/v1/events'),
          headers: {
            'Content-Type': 'application/json',
            'x-onramp-key': _apiKey,
          },
          body: jsonEncode({'events': [event]}),
        )
        .then((_) {})
        .catchError((_) {});
    _inflight.add(f);
    f.whenComplete(() => _inflight.remove(f));
  }

  static String get _platform {
    if (Platform.isIOS) return 'ios';
    if (Platform.isAndroid) return 'android';
    if (Platform.isMacOS) return 'macos';
    return 'other';
  }

  static String get _osVersion => Platform.operatingSystemVersion;

  static String get _deviceType {
    if (Platform.isMacOS || Platform.isLinux || Platform.isWindows) {
      return 'desktop';
    }
    return 'phone';
  }
}
