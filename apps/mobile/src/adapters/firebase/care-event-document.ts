import {
  babyId,
  createCareEvent,
  eventId,
  groupId,
  userId,
  type CareEvent,
  type CareEventQuery,
  type CreateCareEventInput,
} from '@babycare/product-core';

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Care event document must be an object');
  }
  return value as Record<string, unknown>;
}

const BASE_FIELDS = [
  'id',
  'groupId',
  'babyId',
  'caregiverId',
  'kind',
  'occurredAt',
  'createdAt',
  'updatedAt',
  'revision',
  'isDeleted',
  'note',
  'deletedAt',
] as const;

function onlyKeys(data: Record<string, unknown>, allowed: readonly string[]): void {
  if (Object.keys(data).some(key => !allowed.includes(key))) {
    throw new Error('Care event document contains an unexpected field');
  }
}

function stringField(data: Record<string, unknown>, key: string): string {
  const value = data[key];
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Care event ${key} must be a non-empty string`);
  }
  return value;
}

function numberField(data: Record<string, unknown>, key: string): number {
  const value = data[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Care event ${key} must be a finite number`);
  }
  return value;
}

function timestampField(data: Record<string, unknown>, key: string): number {
  const value = numberField(data, key);
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`Care event ${key} must be a valid timestamp`);
  }
  return value;
}

function optionalNumber(data: Record<string, unknown>, key: string): number | undefined {
  return data[key] === undefined ? undefined : numberField(data, key);
}

function optionalTimestamp(data: Record<string, unknown>, key: string): number | undefined {
  return data[key] === undefined ? undefined : timestampField(data, key);
}

function optionalString(data: Record<string, unknown>, key: string): string | undefined {
  const value = data[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new Error(`Care event ${key} must be a string`);
  }
  return value;
}

function createInput(data: Record<string, unknown>): CreateCareEventInput {
  const shared = {
    groupId: groupId(stringField(data, 'groupId')),
    babyId: babyId(stringField(data, 'babyId')),
    caregiverId: userId(stringField(data, 'caregiverId')),
    ...(optionalString(data, 'note') !== undefined ? {note: optionalString(data, 'note')} : {}),
  };
  const kind = stringField(data, 'kind');

  if (kind === 'feeding') {
    onlyKeys(data, [
      ...BASE_FIELDS,
      'feedingType',
      'volumeMl',
      'leftDurationSeconds',
      'rightDurationSeconds',
    ]);
    const feedingType = stringField(data, 'feedingType');
    if (!['breast', 'bottle_breastmilk', 'formula', 'solid'].includes(feedingType)) {
      throw new Error('Care event feedingType is invalid');
    }
    return {
      ...shared,
      kind,
      feedingType: feedingType as 'breast' | 'bottle_breastmilk' | 'formula' | 'solid',
      occurredAt: timestampField(data, 'occurredAt'),
      ...(optionalNumber(data, 'volumeMl') !== undefined
        ? {volumeMl: optionalNumber(data, 'volumeMl')}
        : {}),
      ...(optionalNumber(data, 'leftDurationSeconds') !== undefined
        ? {leftDurationSeconds: optionalNumber(data, 'leftDurationSeconds')}
        : {}),
      ...(optionalNumber(data, 'rightDurationSeconds') !== undefined
        ? {rightDurationSeconds: optionalNumber(data, 'rightDurationSeconds')}
        : {}),
    };
  }

  if (kind === 'diaper') {
    onlyKeys(data, [...BASE_FIELDS, 'diaperType']);
    const diaperType = stringField(data, 'diaperType');
    if (!['wet', 'dirty', 'mixed'].includes(diaperType)) {
      throw new Error('Care event diaperType is invalid');
    }
    return {
      ...shared,
      kind,
      diaperType: diaperType as 'wet' | 'dirty' | 'mixed',
      occurredAt: timestampField(data, 'occurredAt'),
    };
  }

  if (kind === 'sleep') {
    onlyKeys(data, [...BASE_FIELDS, 'sleepType', 'startedAt', 'endedAt']);
    const sleepType = stringField(data, 'sleepType');
    if (!['nap', 'night'].includes(sleepType)) {
      throw new Error('Care event sleepType is invalid');
    }
    const startedAt = timestampField(data, 'startedAt');
    if (timestampField(data, 'occurredAt') !== startedAt) {
      throw new Error('Care event sleep timestamps are inconsistent');
    }
    return {
      ...shared,
      kind,
      sleepType: sleepType as 'nap' | 'night',
      startedAt,
      ...(optionalTimestamp(data, 'endedAt') !== undefined
        ? {endedAt: optionalTimestamp(data, 'endedAt')}
        : {}),
    };
  }

  throw new Error('Care event kind is invalid');
}

export function decodeCareEventDocument(input: {
  readonly documentId: string;
  readonly groupId: string;
  readonly data: unknown;
}): CareEvent {
  const data = asRecord(input.data);
  const id = eventId(stringField(data, 'id'));
  const documentGroupId = stringField(data, 'groupId');
  if (id !== input.documentId || documentGroupId !== input.groupId) {
    throw new Error('Care event document identity does not match its path');
  }
  const createdAt = timestampField(data, 'createdAt');
  const updatedAt = timestampField(data, 'updatedAt');
  const revision = numberField(data, 'revision');
  const deletedAt = optionalTimestamp(data, 'deletedAt');
  const isDeleted = data.isDeleted;
  if (typeof isDeleted !== 'boolean' || isDeleted !== (deletedAt !== undefined)) {
    throw new Error('Care event deletion state is invalid');
  }
  if (!Number.isInteger(revision) || revision < 1) {
    throw new Error('Care event revision must be a positive integer');
  }
  if (updatedAt < createdAt || (deletedAt !== undefined && deletedAt !== updatedAt)) {
    throw new Error('Care event audit timestamps are invalid');
  }

  // occurredAt is editable after creation. Revalidate it against the update
  // timestamp instead of the immutable creation timestamp.
  const validated = createCareEvent(createInput(data), {id, now: updatedAt});
  return {
    ...validated,
    createdAt,
    updatedAt,
    revision,
    ...(deletedAt !== undefined ? {deletedAt} : {}),
  };
}

export function encodeCareEventDocument(event: CareEvent): Record<string, unknown> {
  return {...event, isDeleted: event.deletedAt !== undefined};
}

export function selectCareEventQueryResults(
  events: readonly CareEvent[],
  query: Pick<CareEventQuery, 'includeDeleted' | 'limit'>,
): readonly CareEvent[] {
  const visible = query.includeDeleted
    ? events
    : events.filter(event => event.deletedAt === undefined);
  return query.limit === undefined ? visible : visible.slice(0, query.limit);
}
