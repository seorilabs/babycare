import {
  babyId,
  eventId,
  groupId,
  userId,
  type CareEvent,
} from '@babycare/product-core';

const BASE_KEYS = [
  'id',
  'groupId',
  'babyId',
  'caregiverId',
  'kind',
  'occurredAt',
  'createdAt',
  'updatedAt',
  'revision',
  'note',
  'deletedAt',
] as const;

function hasOnlyKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
): boolean {
  return Object.keys(value).every(key => allowed.includes(key));
}

function isId(
  value: unknown,
  parse: (candidate: string) => string,
): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  try {
    return parse(value) === value;
  } catch {
    return false;
  }
}

function isTimestamp(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isPositiveNumber(value: unknown, maximum: number): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value > 0 &&
    value <= maximum
  );
}

export function isPersistedCareEvent(value: unknown): value is CareEvent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const event = value as Record<string, unknown>;
  if (
    !isId(event.id, eventId) ||
    !isId(event.groupId, groupId) ||
    !isId(event.babyId, babyId) ||
    !isId(event.caregiverId, userId) ||
    !isTimestamp(event.occurredAt) ||
    !isTimestamp(event.createdAt) ||
    !isTimestamp(event.updatedAt) ||
    event.updatedAt < event.createdAt ||
    event.occurredAt > event.updatedAt + 5 * 60 * 1_000 ||
    !Number.isInteger(event.revision) ||
    (event.revision as number) < 1 ||
    (event.note !== undefined &&
      (typeof event.note !== 'string' ||
        event.note.length === 0 ||
        event.note.length > 500)) ||
    (event.deletedAt !== undefined &&
      (!isTimestamp(event.deletedAt) || event.deletedAt !== event.updatedAt))
  ) {
    return false;
  }

  if (event.kind === 'feeding') {
    if (
      !hasOnlyKeys(event, [
        ...BASE_KEYS,
        'feedingType',
        'volumeMl',
        'leftDurationSeconds',
        'rightDurationSeconds',
      ]) ||
      !['breast', 'bottle_breastmilk', 'formula', 'solid'].includes(
        event.feedingType as string,
      )
    ) {
      return false;
    }
    const left = event.leftDurationSeconds;
    const right = event.rightDurationSeconds;
    if (event.feedingType === 'breast') {
      return (
        event.volumeMl === undefined &&
        (left === undefined || isPositiveNumber(left, 43_200)) &&
        (right === undefined || isPositiveNumber(right, 43_200)) &&
        ((left as number | undefined) ?? 0) +
          ((right as number | undefined) ?? 0) >
          0 &&
        ((left as number | undefined) ?? 0) +
          ((right as number | undefined) ?? 0) <=
          43_200
      );
    }
    return (
      isPositiveNumber(event.volumeMl, 2_000) &&
      left === undefined &&
      right === undefined
    );
  }

  if (event.kind === 'diaper') {
    return (
      hasOnlyKeys(event, [...BASE_KEYS, 'diaperType']) &&
      ['wet', 'dirty', 'mixed'].includes(event.diaperType as string)
    );
  }

  if (event.kind === 'sleep') {
    return (
      hasOnlyKeys(event, [...BASE_KEYS, 'sleepType', 'startedAt', 'endedAt']) &&
      ['nap', 'night'].includes(event.sleepType as string) &&
      isTimestamp(event.startedAt) &&
      event.startedAt === event.occurredAt &&
      (event.endedAt === undefined ||
        (isTimestamp(event.endedAt) &&
          event.endedAt > event.startedAt &&
          event.endedAt <= event.updatedAt &&
          event.endedAt - event.startedAt <= 48 * 60 * 60 * 1_000))
    );
  }

  return false;
}
