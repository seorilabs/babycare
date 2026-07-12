import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  calculateTimeAgo,
  fromMilliliters,
  groupId,
  roundVolume,
  toMilliliters,
} from '../src/index.ts';

describe('volume', () => {
  it('stores volume canonically in milliliters without integer truncation', () => {
    const ml = toMilliliters(4, 'oz');
    assert.equal(roundVolume(ml, 'ml'), 118);
    assert.equal(roundVolume(fromMilliliters(ml, 'oz'), 'oz'), 4);
  });
});

describe('time ago', () => {
  it('uses exact minute boundaries and preserves future direction', () => {
    assert.deepEqual(calculateTimeAgo(0, 60_000), {
      unit: 'minute',
      value: 1,
      isFuture: false,
    });
    assert.deepEqual(calculateTimeAgo(120_000, 60_000), {
      unit: 'minute',
      value: 1,
      isFuture: true,
    });
  });
});

describe('document identifiers', () => {
  it('normalizes whitespace and rejects path or control injection', () => {
    assert.equal(groupId(' group-1 '), 'group-1');
    assert.throws(() => groupId('../group'), /safe/);
    assert.throws(() => groupId('group\u202E'), /safe/);
    assert.throws(() => groupId('g'.repeat(129)), /safe/);
  });
});
