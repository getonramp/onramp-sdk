import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:onramp_sdk/onramp_sdk.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  const host = 'https://api.test.example';
  const key = 'onr_test_key';

  final captured = <http.Request>[];

  Future<void> setupOnRamp() async {
    SharedPreferences.setMockInitialValues({});
    captured.clear();
    OnRamp.reset();
    OnRamp.httpClient = MockClient((req) async {
      captured.add(req);
      return http.Response('', 200);
    });
    await OnRamp.initialize(apiKey: key, host: host);
  }

  setUp(setupOnRamp);
  tearDown(OnRamp.reset);

  Map<String, dynamic> eventAt(int i) {
    final body = jsonDecode(captured[i].body) as Map<String, dynamic>;
    return (body['events'] as List).first as Map<String, dynamic>;
  }

  Map<String, dynamic> event() => eventAt(0);

  // MARK: - HTTP shape

  group('HTTP shape', () {
    test('step() posts to correct URL and method', () async {
      OnRamp.step('test');
      await OnRamp.flush();
      expect(captured.first.url.toString(), '$host/v1/events');
      expect(captured.first.method, 'POST');
    });

    test('step() sets auth and content-type headers', () async {
      OnRamp.step('test');
      await OnRamp.flush();
      expect(captured.first.headers['x-onramp-key'], key);
      expect(captured.first.headers['Content-Type'], 'application/json');
    });
  });

  // MARK: - Event schema

  group('Event schema', () {
    test('step() body contains required fields', () async {
      OnRamp.step('account_created');
      await OnRamp.flush();
      final ev = event();
      expect(ev['event_type'], 'step_entered');
      expect(ev['step_name'], 'account_created');
      expect(ev['schema_version'], '1.0');
      expect(ev['app_key'], key);
      expect(ev['anonymous_id'], isNotNull);
      expect(ev['session_id'], isNotNull);
      expect(ev['event_id'], isNotNull);
      expect(ev['client_timestamp_ms'], isNotNull);
    });

    test('step() includes properties when provided', () async {
      OnRamp.step('signup', properties: {'plan': 'free', 'source': 'invite'});
      await OnRamp.flush();
      final props = event()['properties'] as Map<String, dynamic>;
      expect(props['plan'], 'free');
      expect(props['source'], 'invite');
    });

    test('step() omits properties field when not provided', () async {
      OnRamp.step('no_props');
      await OnRamp.flush();
      expect(event()['properties'], isNull);
    });

    test('anonymous_id is a valid UUID v4', () async {
      OnRamp.step('test');
      await OnRamp.flush();
      final anonId = event()['anonymous_id'] as String;
      expect(
        RegExp(r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
            .hasMatch(anonId),
        isTrue,
      );
    });
  });

  // MARK: - Step index

  group('Step index', () {
    test('step index increments across calls', () async {
      OnRamp.step('a');
      OnRamp.step('b');
      OnRamp.step('c');
      await OnRamp.flush();
      expect(captured.length, 3);
      final indices = List.generate(3, (i) => eventAt(i)['step_index'] as int);
      expect(indices, [0, 1, 2]);
    });

    test('newSession() resets step index to 0', () async {
      OnRamp.step('before');
      OnRamp.newSession();
      OnRamp.step('after');
      await OnRamp.flush();
      expect(eventAt(1)['step_index'], 0);
    });

    test('newSession() rotates session ID', () async {
      OnRamp.step('before');
      OnRamp.newSession();
      OnRamp.step('after');
      await OnRamp.flush();
      expect(eventAt(0)['session_id'], isNot(eventAt(1)['session_id']));
    });
  });

  // MARK: - identify()

  group('identify()', () {
    test('uses correct event_type and step_name', () async {
      OnRamp.identify({'userId': 'u_123', 'email': 'a@b.com'});
      await OnRamp.flush();
      expect(event()['event_type'], 'identify');
      expect(event()['step_name'], '_identify');
    });

    test('passes traits as properties', () async {
      OnRamp.identify({'userId': 'u_123', 'plan': 'pro'});
      await OnRamp.flush();
      final props = event()['properties'] as Map<String, dynamic>;
      expect(props['userId'], 'u_123');
      expect(props['plan'], 'pro');
    });
  });

  // MARK: - initialize()

  group('initialize()', () {
    test('trailing slash stripped from host', () async {
      OnRamp.reset();
      SharedPreferences.setMockInitialValues({});
      await OnRamp.initialize(apiKey: key, host: '$host/');
      OnRamp.step('test');
      await OnRamp.flush();
      expect(captured.first.url.toString(), '$host/v1/events');
    });

    test('anonymous ID persists across re-initialize', () async {
      OnRamp.step('first');
      await OnRamp.flush();
      final id1 = event()['anonymous_id'] as String;

      captured.clear();
      // Re-init without clearing SharedPreferences — simulates app restart.
      await OnRamp.initialize(apiKey: key, host: host);
      OnRamp.step('second');
      await OnRamp.flush();
      final id2 = event()['anonymous_id'] as String;

      expect(id1, id2);
    });

    test('clearing storage generates a new anonymous ID', () async {
      OnRamp.step('first');
      await OnRamp.flush();
      final id1 = event()['anonymous_id'] as String;

      captured.clear();
      OnRamp.reset();
      SharedPreferences.setMockInitialValues({});
      await OnRamp.initialize(apiKey: key, host: host);
      OnRamp.step('second');
      await OnRamp.flush();
      final id2 = event()['anonymous_id'] as String;

      expect(id1, isNot(id2));
    });
  });
}
