import type { BabyId, GroupId } from './ids.ts';
import {normalizeDisplayName} from '../value_objects/display-name.ts';

export type BiologicalSex = 'female' | 'male' | 'unspecified';

export interface Baby {
  readonly id: BabyId;
  readonly groupId: GroupId;
  readonly name: string;
  readonly birthDate: string;
  readonly sex: BiologicalSex;
  readonly dueDate?: string;
  readonly avatarStoragePath?: string;
  readonly createdAt: number;
  readonly updatedAt: number;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseIsoCalendarDate(value: string): number | undefined {
  const match = ISO_DATE.exec(value);
  if (!match) {
    return undefined;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const timestamp = Date.UTC(year, month - 1, day);
  const parsed = new Date(timestamp);
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return undefined;
  }
  return timestamp;
}

export function validateBaby(baby: Baby): Baby {
  const name = normalizeDisplayName(baby.name, 'Baby name');
  const birthDate = parseIsoCalendarDate(baby.birthDate);
  if (birthDate === undefined) {
    throw new Error('Baby birthDate must be a real YYYY-MM-DD calendar date');
  }
  // Date-only values are interpreted in the caregiver's local calendar. A
  // 24-hour allowance covers every civil timezone while rejecting distant
  // future dates at persistence/decoder boundaries.
  if (birthDate > baby.createdAt + 24 * 60 * 60 * 1_000) {
    throw new Error('Baby birthDate must not be in the future');
  }
  if (
    baby.dueDate !== undefined &&
    parseIsoCalendarDate(baby.dueDate) === undefined
  ) {
    throw new Error('Baby dueDate must be a real YYYY-MM-DD calendar date');
  }
  if (!['female', 'male', 'unspecified'].includes(baby.sex)) {
    throw new Error('Baby sex is invalid');
  }
  if (baby.updatedAt < baby.createdAt) {
    throw new Error('Baby updatedAt must not precede createdAt');
  }
  return {...baby, name};
}
