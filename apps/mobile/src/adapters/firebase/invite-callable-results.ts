import {
  groupId,
  inviteCode,
  inviteId,
  userId,
  type CareGroupInvite,
  type Membership,
  type UserId,
} from '@babycare/product-core';

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function text(data: Record<string, unknown>, key: string): string {
  const value = data[key];
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${key} must be a non-empty string`);
  }
  return value;
}

function timestamp(data: Record<string, unknown>, key: string): number {
  const value = data[key];
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error(`${key} must be a valid timestamp`);
  }
  return value as number;
}

export function decodeCreateInviteResult(input: {
  readonly value: unknown;
  readonly requestedBy: UserId;
  readonly expectedGroupId: string;
}): CareGroupInvite {
  const data = record(input.value, 'Create invite response');
  const responseGroupId = text(data, 'groupId');
  if (responseGroupId !== input.expectedGroupId) {
    throw new Error('Create invite response group does not match its request');
  }
  const rawInviteId = text(data, 'inviteId');
  if (!/^[0-9a-f]{64}$/.test(rawInviteId)) {
    throw new Error('Create invite response inviteId is invalid');
  }
  const createdAt = timestamp(data, 'createdAt');
  const expiresAt = timestamp(data, 'expiresAt');
  if (expiresAt <= createdAt) {
    throw new Error('Create invite response expiry is invalid');
  }

  return {
    id: inviteId(rawInviteId),
    groupId: groupId(responseGroupId),
    invitedBy: input.requestedBy,
    code: inviteCode(text(data, 'code')),
    createdAt,
    expiresAt,
  };
}

export function decodeAcceptInviteResult(input: {
  readonly value: unknown;
  readonly expectedUserId: UserId;
}): Membership {
  const data = record(input.value, 'Accept invite response');
  const responseUserId = userId(text(data, 'userId'));
  if (responseUserId !== input.expectedUserId) {
    throw new Error('Accept invite response user does not match its request');
  }
  const membershipRole = text(data, 'membershipRole');
  const caregiverRole = text(data, 'caregiverRole');
  const color = text(data, 'color');
  if (membershipRole !== 'member') {
    throw new Error('Accept invite response membershipRole is invalid');
  }
  if (!['parent', 'grandparent', 'sitter', 'teacher', 'other'].includes(caregiverRole)) {
    throw new Error('Accept invite response caregiverRole is invalid');
  }
  if (!/^#[0-9A-F]{6}$/.test(color)) {
    throw new Error('Accept invite response color is invalid');
  }

  return {
    userId: responseUserId,
    groupId: groupId(text(data, 'groupId')),
    displayName: text(data, 'displayName'),
    membershipRole,
    caregiverRole: caregiverRole as Membership['caregiverRole'],
    color,
    joinedAt: timestamp(data, 'joinedAt'),
  };
}
