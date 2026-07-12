import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import {
  babyId,
  groupId,
  parseIsoCalendarDate,
  validateBaby,
  type Baby,
} from '../src/index.ts';

const CREATED_AT = Date.UTC(2026, 3, 20);

function baby(overrides: Partial<Baby> = {}): Baby {
  return {
    id: babyId('baby-1'),
    groupId: groupId('group-1'),
    name: ' 지안 ',
    birthDate: '2024-02-29',
    sex: 'unspecified',
    createdAt: CREATED_AT,
    updatedAt: CREATED_AT,
    ...overrides,
  };
}

describe('baby calendar date validation', () => {
  it('accepts real leap days and rejects normalized or malformed dates', () => {
    assert.equal(parseIsoCalendarDate('2024-02-29'), Date.UTC(2024, 1, 29));
    assert.equal(parseIsoCalendarDate('2026-02-29'), undefined);
    assert.equal(parseIsoCalendarDate('2026-02-31'), undefined);
    assert.equal(parseIsoCalendarDate('2026-13-01'), undefined);
  });

  it('normalizes the name and rejects distant future birth dates', () => {
    assert.equal(validateBaby(baby()).name, '지안');
    assert.throws(
      () => validateBaby(baby({birthDate: '2027-01-01'})),
      /future/,
    );
  });

  it('rejects overlong and bidi-controlled display names', () => {
    assert.throws(() => validateBaby(baby({name: '가'.repeat(81)})), /1 to 80/);
    assert.throws(() => validateBaby(baby({name: '지안\u202E'})), /control/);
  });
});
