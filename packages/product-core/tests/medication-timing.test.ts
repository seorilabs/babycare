import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import {
  assessMedicationTiming,
  babyId,
  createCareEvent,
  eventId,
  groupId,
  nextMedicationTime,
  userId,
  type MedicationActiveIngredient,
  type MedicationEvent,
} from '../src/index.ts';

const ids = {
  groupId: groupId('group-1'),
  babyId: babyId('baby-1'),
  caregiverId: userId('user-1'),
};

function medication(input: {
  readonly id: string;
  readonly occurredAt: number;
  readonly ingredient: MedicationActiveIngredient;
  readonly interval: number;
  readonly name?: string;
}): MedicationEvent {
  const antipyretic = input.ingredient !== 'other';
  const event = createCareEvent(
    {
      ...ids,
      kind: 'medication',
      medicationName:
        input.name ??
        (input.ingredient === 'acetaminophen' ? '아세트아미노펜' : '이부프로펜'),
      medicationCategory: antipyretic ? 'antipyretic' : 'antibiotic',
      activeIngredient: input.ingredient,
      doseAmount: 3,
      doseUnit: 'ml',
      minimumIntervalMinutes: input.interval,
      occurredAt: input.occurredAt,
    },
    {id: eventId(input.id), now: input.occurredAt},
  );
  assert.equal(event.kind, 'medication');
  return event as MedicationEvent;
}

describe('medication timing', () => {
  it('requires acknowledgement when a same-ingredient entry is too close', () => {
    const prior = medication({
      id: 'medication-1',
      occurredAt: 1_000,
      ingredient: 'acetaminophen',
      interval: 240,
    });
    const assessment = assessMedicationTiming([prior], {
      occurredAt: 1_000 + 180 * 60_000,
      medicationName: '다른 제품명',
      medicationCategory: 'antipyretic',
      activeIngredient: 'acetaminophen',
      minimumIntervalMinutes: 240,
    });

    assert.equal(assessment.sameMedication?.id, prior.id);
    assert.equal(assessment.requiresAcknowledgement, true);
    assert.equal(assessment.nextAllowedAt, prior.occurredAt + 240 * 60_000);
  });

  it('checks a retrospective entry against the following dose too', () => {
    const later = medication({
      id: 'medication-later',
      occurredAt: 8 * 60 * 60_000,
      ingredient: 'other',
      interval: 480,
      name: '처방 항생제',
    });
    const assessment = assessMedicationTiming([later], {
      occurredAt: 4 * 60 * 60_000,
      medicationName: ' 처방  항생제 ',
      medicationCategory: 'antibiotic',
      activeIngredient: 'other',
      minimumIntervalMinutes: 480,
    });

    assert.equal(assessment.sameMedication?.id, later.id);
    assert.equal(assessment.requiresAcknowledgement, true);
  });

  it('flags different antipyretics recorded in the same minute', () => {
    const prior = medication({
      id: 'medication-ibuprofen',
      occurredAt: 1_000,
      ingredient: 'ibuprofen',
      interval: 360,
    });
    const assessment = assessMedicationTiming([prior], {
      occurredAt: 30_000,
      medicationName: '아세트아미노펜',
      medicationCategory: 'antipyretic',
      activeIngredient: 'acetaminophen',
      minimumIntervalMinutes: 240,
    });

    assert.equal(assessment.otherAntipyretic?.id, prior.id);
    assert.equal(assessment.requiresAcknowledgement, true);
  });

  it('builds the next time from the caregiver-confirmed interval', () => {
    const older = medication({
      id: 'medication-old',
      occurredAt: 1_000,
      ingredient: 'ibuprofen',
      interval: 360,
    });
    const latest = medication({
      id: 'medication-latest',
      occurredAt: 10_000,
      ingredient: 'ibuprofen',
      interval: 480,
    });

    assert.equal(
      nextMedicationTime([older, latest], 'ibuprofen'),
      latest.occurredAt + 480 * 60_000,
    );
  });
});
