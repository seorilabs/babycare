import {
  babyId,
  groupId,
  inviteCode,
  normalizeDisplayName,
  type AuthIdentity,
  type AuthPort,
  type Baby,
  type BabyRepositoryPort,
  type CareGroup,
  type CareGroupRepositoryPort,
  type ClockPort,
  type InviteServicePort,
  type Membership,
} from '@babycare/product-core';

import {
  assertAuthenticatedCareContext,
  type AuthenticatedCareContext,
} from './care-context';
import {isValidBirthDate} from './session';

export interface CareDocumentIdFactory {
  next(prefix: 'group' | 'baby'): string;
}

export class RandomCareDocumentIdFactory implements CareDocumentIdFactory {
  #sequence = 0;

  next(prefix: 'group' | 'baby'): string {
    this.#sequence += 1;
    const random = Math.random().toString(36).slice(2, 12);
    return `${prefix}-${Date.now().toString(36)}-${this.#sequence.toString(36)}-${random}`;
  }
}

export interface FirebaseSessionServices {
  readonly auth: AuthPort;
  readonly groups: CareGroupRepositoryPort;
  readonly babies: BabyRepositoryPort;
  readonly invites: InviteServicePort;
  readonly clock: ClockPort;
  readonly documentIds: CareDocumentIdFactory;
}

export interface ReadyFirebaseSession {
  readonly context: AuthenticatedCareContext;
  readonly memberships: readonly Membership[];
}

export type FirebaseSessionBootstrap =
  | {readonly kind: 'signed_out'}
  | {readonly kind: 'needs_group'; readonly identity: AuthIdentity}
  | ({readonly kind: 'ready'} & ReadyFirebaseSession);

async function authenticatedIdentity(auth: AuthPort): Promise<AuthIdentity> {
  const current = await auth.currentUser();
  return current && !current.isAnonymous
    ? current
    : auth.signInWithoutAccount();
}

async function readySessionForGroup(
  services: FirebaseSessionServices,
  identity: AuthIdentity,
  group: CareGroup,
): Promise<ReadyFirebaseSession> {
  const [membership, babies, memberships] = await Promise.all([
    services.groups.findMembership(group.id, identity.userId),
    services.babies.list(group.id),
    services.groups.listMemberships(group.id),
  ]);
  const baby = babies.find(item => group.babyIds.includes(item.id));
  if (!membership || !baby) {
    throw new Error('돌봄 그룹 정보를 완전하게 불러오지 못했어요');
  }
  const context = {identity, membership, group, baby};
  assertAuthenticatedCareContext(context);
  return {context, memberships};
}

export async function restoreFirebaseSession(
  services: FirebaseSessionServices,
): Promise<FirebaseSessionBootstrap> {
  const current = await services.auth.currentUser();
  if (!current) {
    return {kind: 'signed_out'};
  }
  const identity = current.isAnonymous
    ? await services.auth.signInWithoutAccount()
    : current;
  const groups = await services.groups.listForUser(identity.userId);
  if (groups.length === 0) {
    return {kind: 'needs_group', identity};
  }
  if (groups.length > 1) {
    throw new Error('여러 돌봄 그룹 중 사용할 그룹을 선택해야 해요');
  }
  const group = groups[0]!;
  return {
    kind: 'ready',
    ...(await readySessionForGroup(services, identity, group)),
  };
}

export async function createOwnerFirebaseSession(
  services: FirebaseSessionServices,
  input: {
    readonly caregiverName: string;
    readonly babyName: string;
    readonly birthDate: string;
  },
): Promise<ReadyFirebaseSession> {
  const caregiverName = normalizeDisplayName(
    input.caregiverName,
    'Caregiver name',
  );
  const babyName = normalizeDisplayName(input.babyName, 'Baby name');
  if (!isValidBirthDate(input.birthDate, services.clock.now())) {
    throw new Error('아기 생년월일을 YYYY-MM-DD 형식으로 확인해 주세요');
  }

  const identity = await authenticatedIdentity(services.auth);
  const existingGroups = await services.groups.listForUser(identity.userId);
  if (existingGroups.length > 1) {
    throw new Error('여러 돌봄 그룹 중 사용할 그룹을 선택해야 해요');
  }
  if (existingGroups.length === 1) {
    return readySessionForGroup(services, identity, existingGroups[0]!);
  }
  const now = services.clock.now();
  const nextGroupId = groupId(services.documentIds.next('group'));
  const nextBabyId = babyId(services.documentIds.next('baby'));
  const group: CareGroup = {
    id: nextGroupId,
    name: babyName,
    ownerId: identity.userId,
    babyIds: [nextBabyId],
    createdAt: now,
    updatedAt: now,
  };
  const membership: Membership = {
    userId: identity.userId,
    groupId: nextGroupId,
    caregiverRole: 'other',
    membershipRole: 'owner',
    displayName: caregiverName,
    color: '#5FB49C',
    joinedAt: now,
  };
  const baby: Baby = {
    id: nextBabyId,
    groupId: nextGroupId,
    name: babyName,
    birthDate: input.birthDate,
    sex: 'unspecified',
    createdAt: now,
    updatedAt: now,
  };

  await services.groups.createOwnerGroup({
    group,
    ownerMembership: membership,
    baby,
  });
  const context = {identity, membership, group, baby};
  assertAuthenticatedCareContext(context);
  return {context, memberships: [membership]};
}

export async function joinFirebaseSession(
  services: FirebaseSessionServices,
  input: {
    readonly caregiverName: string;
    readonly code: string;
  },
): Promise<ReadyFirebaseSession> {
  const displayName = normalizeDisplayName(
    input.caregiverName,
    'Caregiver name',
  );
  const identity = await authenticatedIdentity(services.auth);
  const membership = await services.invites.acceptInvite({
    code: inviteCode(input.code),
    userId: identity.userId,
    displayName,
  });
  const group = await services.groups.findById(membership.groupId);
  if (!group) {
    throw new Error('초대된 돌봄 그룹을 불러오지 못했어요');
  }
  return readySessionForGroup(services, identity, group);
}

export function firebaseSessionView(
  ready: ReadyFirebaseSession,
  invite: string = '',
) {
  return {
    groupId: ready.context.group.id,
    babyId: ready.context.baby.id,
    caregiverId: ready.context.identity.userId,
    caregiverName: ready.context.membership.displayName,
    babyName: ready.context.baby.name,
    birthDate: ready.context.baby.birthDate,
    inviteCode: invite,
    runtimeMode: 'firebase' as const,
    membershipRole: ready.context.membership.membershipRole,
  };
}
