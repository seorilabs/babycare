import {hasUnsafeDisplayControl} from '../value_objects/display-name.ts';

export type Brand<Value, Name extends string> = Value & {
  readonly __brand: Name;
};

export type UserId = Brand<string, 'UserId'>;
export type GroupId = Brand<string, 'GroupId'>;
export type BabyId = Brand<string, 'BabyId'>;
export type EventId = Brand<string, 'EventId'>;
export type InviteId = Brand<string, 'InviteId'>;

function nonEmptyId<Name extends string>(value: string, label: Name): Brand<string, Name> {
  const normalized = value.trim();
  if (
    normalized.length === 0 ||
    normalized.length > 128 ||
    normalized === '.' ||
    normalized === '..' ||
    normalized.includes('/') ||
    hasUnsafeDisplayControl(normalized)
  ) {
    throw new Error(`${label} must be a safe non-empty document identifier`);
  }
  return normalized as Brand<string, Name>;
}

export const userId = (value: string): UserId => nonEmptyId(value, 'UserId');
export const groupId = (value: string): GroupId => nonEmptyId(value, 'GroupId');
export const babyId = (value: string): BabyId => nonEmptyId(value, 'BabyId');
export const eventId = (value: string): EventId => nonEmptyId(value, 'EventId');
export const inviteId = (value: string): InviteId => nonEmptyId(value, 'InviteId');
