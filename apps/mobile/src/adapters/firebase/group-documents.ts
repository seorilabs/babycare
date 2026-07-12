import {
  babyId,
  groupId,
  normalizeDisplayName,
  userId,
  validateBaby,
  type Baby,
  type CareGroup,
  type Membership,
} from '@babycare/product-core';

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function onlyKeys(
  data: Record<string, unknown>,
  allowed: readonly string[],
  label: string,
): void {
  if (Object.keys(data).some(key => !allowed.includes(key))) {
    throw new Error(`${label} contains an unexpected field`);
  }
}

function text(data: Record<string, unknown>, key: string): string {
  const value = data[key];
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${key} must be a non-empty string`);
  }
  return value;
}

function optionalText(
  data: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = data[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${key} must be a non-empty string`);
  }
  return value;
}

function time(data: Record<string, unknown>, key: string): number {
  const value = data[key];
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error(`${key} must be a valid timestamp`);
  }
  return value as number;
}

export function decodeCareGroup(documentId: string, value: unknown): CareGroup {
  const data = record(value, 'Care group');
  onlyKeys(data, ['id', 'name', 'ownerId', 'babyIds', 'createdAt', 'updatedAt'], 'Care group');
  const id = groupId(text(data, 'id'));
  if (id !== documentId) {
    throw new Error('Care group identity does not match its path');
  }
  const values = data.babyIds;
  if (
    !Array.isArray(values) ||
    values.length !== 1 ||
    !values.every(item => typeof item === 'string' && item.trim())
  ) {
    throw new Error('Care group babyIds must contain non-empty strings');
  }
  const createdAt = time(data, 'createdAt');
  const updatedAt = time(data, 'updatedAt');
  if (updatedAt < createdAt) {
    throw new Error('Care group audit timestamps are invalid');
  }
  const name = normalizeDisplayName(text(data, 'name'), 'Care group name');
  return {
    id,
    name,
    ownerId: userId(text(data, 'ownerId')),
    babyIds: values.map(valueId => babyId(valueId)),
    createdAt,
    updatedAt,
  };
}

export function decodeMembership(
  groupDocumentId: string,
  userDocumentId: string,
  value: unknown,
): Membership {
  const data = record(value, 'Membership');
  onlyKeys(
    data,
    ['userId', 'groupId', 'caregiverRole', 'membershipRole', 'displayName', 'color', 'joinedAt'],
    'Membership',
  );
  if (text(data, 'groupId') !== groupDocumentId || text(data, 'userId') !== userDocumentId) {
    throw new Error('Membership identity does not match its path');
  }
  const caregiverRole = text(data, 'caregiverRole');
  const membershipRole = text(data, 'membershipRole');
  const color = text(data, 'color');
  if (!['parent', 'grandparent', 'sitter', 'teacher', 'other'].includes(caregiverRole)) {
    throw new Error('Membership caregiverRole is invalid');
  }
  if (!['owner', 'member'].includes(membershipRole)) {
    throw new Error('Membership membershipRole is invalid');
  }
  if (!/^#[0-9A-Fa-f]{6}$/.test(color)) {
    throw new Error('Membership color is invalid');
  }
  const displayName = normalizeDisplayName(
    text(data, 'displayName'),
    'Membership displayName',
  );
  return {
    groupId: groupId(groupDocumentId),
    userId: userId(userDocumentId),
    caregiverRole: caregiverRole as Membership['caregiverRole'],
    membershipRole: membershipRole as Membership['membershipRole'],
    displayName,
    color,
    joinedAt: time(data, 'joinedAt'),
  };
}

export function decodeBaby(groupDocumentId: string, babyDocumentId: string, value: unknown): Baby {
  const data = record(value, 'Baby');
  onlyKeys(
    data,
    ['id', 'groupId', 'name', 'birthDate', 'sex', 'dueDate', 'avatarStoragePath', 'createdAt', 'updatedAt'],
    'Baby',
  );
  const documentBabyId = babyId(babyDocumentId);
  const dataBabyId = babyId(text(data, 'id'));
  if (
    documentBabyId !== babyDocumentId ||
    text(data, 'groupId') !== groupDocumentId ||
    dataBabyId !== documentBabyId
  ) {
    throw new Error('Baby identity does not match its path');
  }
  const sex = text(data, 'sex');
  if (!['female', 'male', 'unspecified'].includes(sex)) {
    throw new Error('Baby sex is invalid');
  }
  const name = text(data, 'name');
  if (name.length > 80) {
    throw new Error('Baby name must be at most 80 characters');
  }
  const dueDate = optionalText(data, 'dueDate');
  const avatarStoragePath = optionalText(data, 'avatarStoragePath');
  const avatarPrefix = `groups/${groupDocumentId}/babies/${documentBabyId}/`;
  const avatarSuffix = avatarStoragePath?.slice(avatarPrefix.length);
  if (
    avatarStoragePath !== undefined &&
    (!avatarStoragePath.startsWith(avatarPrefix) ||
      !avatarSuffix ||
      avatarSuffix.split('/').some(segment => !segment || segment === '.' || segment === '..'))
  ) {
    throw new Error('Baby avatarStoragePath is invalid');
  }
  return validateBaby({
    id: documentBabyId,
    groupId: groupId(groupDocumentId),
    name,
    birthDate: text(data, 'birthDate'),
    sex: sex as Baby['sex'],
    ...(dueDate !== undefined ? {dueDate} : {}),
    ...(avatarStoragePath !== undefined ? {avatarStoragePath} : {}),
    createdAt: time(data, 'createdAt'),
    updatedAt: time(data, 'updatedAt'),
  });
}

export const encodeGroupDocument = (group: CareGroup): Record<string, unknown> => ({...group});
export const encodeMembershipDocument = (membership: Membership): Record<string, unknown> => ({
  ...membership,
});
export const encodeBabyDocument = (baby: Baby): Record<string, unknown> => ({...baby});
