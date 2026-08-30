import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import {
  classifyBootFailure,
  classifyInviteJoinFailure,
} from '../src/index.ts';

describe('analytics error classification', () => {
  it('maps invite failures to the fixed low-cardinality allowlist', () => {
    assert.equal(classifyInviteJoinFailure({code: 'invite/expired'}), 'expired');
    assert.equal(classifyInviteJoinFailure(new Error('already a member')), 'already_member');
    assert.equal(classifyInviteJoinFailure({code: 'permission-denied'}), 'permission');
    assert.equal(classifyInviteJoinFailure(new Error('network timeout')), 'network');
    assert.equal(classifyInviteJoinFailure({code: 'not-found'}), 'invalid_code');
    assert.equal(classifyInviteJoinFailure('secret raw failure'), 'unknown');
  });

  it('maps boot failures without returning raw error text', () => {
    assert.equal(classifyBootFailure(new Error('missing Firebase config')), 'configuration');
    assert.equal(classifyBootFailure({code: 'auth/unauthenticated'}), 'unauthenticated');
    assert.equal(classifyBootFailure({code: 'permission-denied'}), 'permission');
    assert.equal(classifyBootFailure(new Error('cache storage unavailable')), 'storage');
    assert.equal(classifyBootFailure(new Error('network timeout')), 'network');
    assert.equal(classifyBootFailure('user@example.com'), 'unknown');
  });
});
