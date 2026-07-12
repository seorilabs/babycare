import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import {
  babyId,
  groupId,
  validateCareEventProjectionScope,
  validateCareEventWindowRequest,
  validateLatestCareEventRequest,
} from '../src/index.ts';

describe('care event projection request validation', () => {
  it('accepts canonical scopes without normalizing or copying them', () => {
    const scope = {
      groupId: groupId('group-1'),
      babyId: babyId('baby-1'),
    };

    assert.equal(validateCareEventProjectionScope(scope), scope);
  });

  it('accepts a valid half-open window and preserves optional filters', () => {
    const request = {
      groupId: groupId('group-1'),
      babyId: babyId('baby-1'),
      from: 1_000,
      to: 2_000,
      kinds: ['feeding', 'sleep'] as const,
    };

    assert.equal(validateCareEventWindowRequest(request), request);
  });

  it('accepts an open-ended window', () => {
    const request = {
      groupId: groupId('group-1'),
      babyId: babyId('baby-1'),
      from: 0,
    };

    assert.equal(validateCareEventWindowRequest(request), request);
  });

  it('rejects malformed scopes, timestamps, ranges, and kinds', () => {
    const valid = {groupId: 'group-1', babyId: 'baby-1'};
    const invalid: readonly [unknown, RegExp][] = [
      [null, /scope must be an object/],
      [{...valid, groupId: ' group-1'}, /groupId/],
      [{...valid, babyId: 'baby/1'}, /babyId/],
      [{...valid, from: -1}, /from/],
      [{...valid, from: 1.5}, /from/],
      [{...valid, from: 1_000, to: Number.POSITIVE_INFINITY}, /to/],
      [{...valid, from: 1_000, to: 1_000}, /positive duration/],
      [{...valid, from: 1_000, to: 999}, /positive duration/],
      [{...valid, from: 1_000, kinds: 'sleep'}, /kinds/],
      [{...valid, from: 1_000, kinds: ['sleep', 'unknown']}, /kinds/],
    ];

    for (const [request, message] of invalid) {
      assert.throws(() => validateCareEventWindowRequest(request), message);
    }
  });

  it('validates the latest-kind discriminator at runtime', () => {
    const request = {
      groupId: groupId('group-1'),
      babyId: babyId('baby-1'),
      kind: 'diaper' as const,
    };

    assert.equal(validateLatestCareEventRequest(request), request);
    assert.throws(
      () => validateLatestCareEventRequest({...request, kind: 'unknown'}),
      /kind is invalid/,
    );
  });
});
