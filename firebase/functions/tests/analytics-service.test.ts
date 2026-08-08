import assert from 'node:assert/strict';
import test from 'node:test';

import {
  parseAnalyticsClientId,
  parseAnalyticsEvents,
  relayAnalyticsToGa4,
} from '../src/analytics-service.js';

test('accepts an allowlisted analytics batch and normalizes booleans', () => {
  assert.deepEqual(
    parseAnalyticsEvents([
      {
        name: 'core_screen_view',
        params: {screen_name: 'stats', returning: true},
      },
    ]),
    [
      {
        name: 'core_screen_view',
        params: {screen_name: 'stats', returning: 1},
      },
    ],
  );
  assert.equal(parseAnalyticsClientId('ait-client.123'), 'ait-client.123');
});

test('rejects unknown events and PII parameter keys', () => {
  assert.throws(
    () => parseAnalyticsEvents([{name: 'unknown', params: {}}]),
    /not allowed/,
  );
  assert.throws(
    () =>
      parseAnalyticsEvents([
        {name: 'bc_first_log', params: {email: 'care@example.com'}},
      ]),
    /not allowed/,
  );
});

test('relays the authenticated batch without exposing the secret in the body', async () => {
  let url = '';
  let body = '';
  await relayAnalyticsToGa4({
    measurementId: 'G-TEST',
    apiSecret: 'secret-value',
    clientId: 'client-123',
    userId: 'uid-123',
    events: [{name: 'bc_first_log', params: {type: 'feeding'}}],
    fetchImpl: async (input, init) => {
      url = String(input);
      body = String(init?.body);
      return new Response(null, {status: 204});
    },
  });

  assert.match(url, /measurement_id=G-TEST/);
  assert.match(url, /api_secret=secret-value/);
  assert.equal(body.includes('secret-value'), false);
  assert.equal(JSON.parse(body).user_id, 'uid-123');
});
