import { SAFE_INVITE_CODE_PATTERN } from './invite-crypto.js';
import { InviteServiceError } from './invite-error.js';
import type { CaregiverRole } from './types.js';

const DOCUMENT_ID = /^[A-Za-z0-9_-]{1,128}$/;
const CONTROL_CHARACTER = /[\u0000-\u001F\u007F]/;
const UNSAFE_DISPLAY_CHARACTER = /[\u0000-\u001F\u007F-\u009F\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/u;
const COLOR = /^#[0-9A-Fa-f]{6}$/;
const CAREGIVER_ROLES = new Set<CaregiverRole>([
  'parent',
  'grandparent',
  'sitter',
  'teacher',
  'other',
]);

export function requireAuthenticatedUid(value: unknown): string {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length > 128
    || value === '.'
    || value === '..'
    || value.includes('/')
    || CONTROL_CHARACTER.test(value)
  ) {
    throw new InviteServiceError('unauthenticated', 'Authentication is required');
  }
  return value;
}

export function validateGroupId(value: unknown): string {
  if (typeof value !== 'string') {
    throw new InviteServiceError('invalid-argument', 'groupId must be a string');
  }
  const normalized = value.trim();
  if (!DOCUMENT_ID.test(normalized)) {
    throw new InviteServiceError('invalid-argument', 'groupId is invalid');
  }
  return normalized;
}

export function normalizeInviteCode(value: unknown): string {
  if (typeof value !== 'string') {
    throw new InviteServiceError('invalid-argument', 'code must be a string');
  }
  const normalized = value.trim().toUpperCase();
  if (!SAFE_INVITE_CODE_PATTERN.test(normalized)) {
    throw new InviteServiceError(
      'invalid-argument',
      'Invite code must contain six safe uppercase characters',
    );
  }
  return normalized;
}

export function validateDisplayName(value: unknown): string {
  if (typeof value !== 'string') {
    throw new InviteServiceError('invalid-argument', 'displayName must be a string');
  }
  if (UNSAFE_DISPLAY_CHARACTER.test(value)) {
    throw new InviteServiceError(
      'invalid-argument',
      'displayName contains an unsupported control character',
    );
  }
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > 80) {
    throw new InviteServiceError(
      'invalid-argument',
      'displayName must contain between 1 and 80 characters',
    );
  }
  return normalized;
}

export function validateCaregiverRole(value: unknown): CaregiverRole {
  const normalized = value ?? 'other';
  if (
    typeof normalized !== 'string'
    || !CAREGIVER_ROLES.has(normalized as CaregiverRole)
  ) {
    throw new InviteServiceError('invalid-argument', 'caregiverRole is invalid');
  }
  return normalized as CaregiverRole;
}

export function validateColor(value: unknown): string {
  const normalized = value ?? '#5FB49C';
  if (typeof normalized !== 'string' || !COLOR.test(normalized)) {
    throw new InviteServiceError('invalid-argument', 'color must use #RRGGBB');
  }
  return normalized.toUpperCase();
}

export function requirePositiveInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new InviteServiceError('internal', `${label} must be a positive integer`);
  }
  return value;
}
