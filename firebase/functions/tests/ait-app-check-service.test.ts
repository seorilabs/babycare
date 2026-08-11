import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  AitAppCheckError,
  parseAitAuthorization,
  type AitLoginTransport,
  verifyAitAuthorization,
} from '../src/ait-app-check-service.js';

describe('AppsInToss App Check attestation', () => {
  it('일회용 인가 코드를 교환하고 userKey까지 검증한다', async () => {
    const calls: Parameters<AitLoginTransport['request']>[0][] = [];
    const transport: AitLoginTransport = {
      async request(input) {
        calls.push(input);
        if (input.method === 'POST') {
          return {
            status: 200,
            body: {
              resultType: 'SUCCESS',
              success: { accessToken: 'server-only-access-token' },
            },
          };
        }
        return {
          status: 200,
          body: { resultType: 'SUCCESS', success: { userKey: 443_731_104 } },
        };
      },
    };

    await verifyAitAuthorization(
      { authorizationCode: 'one-time-code', referrer: 'SANDBOX' },
      transport,
    );

    assert.deepEqual(calls, [
      {
        method: 'POST',
        path: '/api-partner/v1/apps-in-toss/user/oauth2/generate-token',
        body: { authorizationCode: 'one-time-code', referrer: 'SANDBOX' },
      },
      {
        method: 'GET',
        path: '/api-partner/v1/apps-in-toss/user/oauth2/login-me',
        bearer: 'server-only-access-token',
      },
    ]);
  });

  it('인가 코드와 실행 환경을 fail-closed로 검증한다', () => {
    assert.deepEqual(
      parseAitAuthorization({ authorizationCode: ' code ', referrer: 'DEFAULT' }),
      { authorizationCode: 'code', referrer: 'DEFAULT' },
    );
    for (const invalid of [
      null,
      {},
      { authorizationCode: '', referrer: 'DEFAULT' },
      { authorizationCode: 'code', referrer: 'UNKNOWN' },
    ]) {
      assert.throws(
        () => parseAitAuthorization(invalid),
        (error) =>
          error instanceof AitAppCheckError && error.code === 'invalid-request',
      );
    }
  });

  it('Toss 검증 실패 뒤 user API나 Firebase mint 단계로 진행하지 않는다', async () => {
    let calls = 0;
    const transport: AitLoginTransport = {
      async request() {
        calls += 1;
        return { status: 401, body: { resultType: 'FAIL' } };
      },
    };

    await assert.rejects(
      verifyAitAuthorization(
        { authorizationCode: 'invalid-code', referrer: 'DEFAULT' },
        transport,
      ),
      (error) =>
        error instanceof AitAppCheckError &&
        error.code === 'verification-failed',
    );
    assert.equal(calls, 1);
  });
});
