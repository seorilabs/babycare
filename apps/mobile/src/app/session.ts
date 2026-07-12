import {
  babyId,
  groupId,
  normalizeDisplayName,
  parseIsoCalendarDate,
  userId,
} from '@babycare/product-core';

const INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function localInvitePreview(): string {
  return Array.from(
    {length: 6},
    () => INVITE_ALPHABET[Math.floor(Math.random() * INVITE_ALPHABET.length)],
  ).join('');
}

export interface LocalSession {
  readonly groupId: string;
  readonly babyId: string;
  readonly caregiverId: string;
  readonly caregiverName: string;
  readonly babyName: string;
  readonly birthDate: string;
  readonly inviteCode: string;
}

function localCalendarDay(now: number): number {
  const value = new Date(now);
  return Date.UTC(value.getFullYear(), value.getMonth(), value.getDate());
}

export function isValidBirthDate(value: string, now: number = Date.now()): boolean {
  const day = parseIsoCalendarDate(value);
  return day !== undefined && day <= localCalendarDay(now);
}

export function createLocalSession(input: {
  readonly caregiverName: string;
  readonly babyName: string;
  readonly birthDate: string;
}, now: number = Date.now()): LocalSession {
  const caregiverName = normalizeDisplayName(
    input.caregiverName,
    'Caregiver name',
  );
  const babyName = normalizeDisplayName(input.babyName, 'Baby name');
  if (!isValidBirthDate(input.birthDate, now)) {
    throw new Error('Baby birthDate must be a real date that is not in the future');
  }
  const seed = `${now.toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return {
    groupId: `local-group-${seed}`,
    babyId: `local-baby-${seed}`,
    caregiverId: `local-user-${seed}`,
    caregiverName,
    babyName,
    birthDate: input.birthDate,
    inviteCode: localInvitePreview(),
  };
}

export function domainContext(session: LocalSession) {
  return {
    groupId: groupId(session.groupId),
    babyId: babyId(session.babyId),
    caregiverId: userId(session.caregiverId),
  };
}
