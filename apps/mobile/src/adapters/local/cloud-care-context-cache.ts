import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  babyId,
  groupId,
  normalizeDisplayName,
  userId,
  validateBaby,
  type AuthIdentity,
  type Baby,
  type CareGroup,
  type Membership,
  type StringStoragePort,
  type UserId,
} from '@babycare/product-core';

import {
  assertAuthenticatedCareContext,
  type AuthenticatedCareContext,
} from '../../app/care-context';

export const CLOUD_CARE_CONTEXT_KEY = '@babycare/cloud-care-context/v1';

const CACHE_VERSION = 1;
const CAREGIVER_ROLES = new Set<Membership['caregiverRole']>([
  'parent',
  'grandparent',
  'sitter',
  'teacher',
  'other',
]);
const MEMBERSHIP_ROLES = new Set<Membership['membershipRole']>([
  'owner',
  'member',
]);

export interface CloudCareContextSnapshot {
  readonly context: AuthenticatedCareContext;
  readonly memberships: readonly Membership[];
}

export type CloudCareContextSessionToken = number;

export class CloudCareContextHydrationError extends Error {
  constructor(reason: 'invalid-json' | 'invalid-schema', detail?: string) {
    const summary =
      reason === 'invalid-json'
        ? '저장된 공동 돌봄 정보가 손상되었습니다'
        : '저장된 공동 돌봄 정보가 현재 형식과 맞지 않습니다';
    super(detail ? `${summary}: ${detail}` : summary);
    this.name = 'CloudCareContextHydrationError';
  }
}

function record(
  value: unknown,
  label: string,
  allowed: readonly string[],
  required: readonly string[] = allowed,
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} 값이 객체가 아닙니다`);
  }
  const data = value as Record<string, unknown>;
  const keys = Object.keys(data);
  if (keys.some(key => !allowed.includes(key))) {
    throw new Error(`${label}에 알 수 없는 필드가 있습니다`);
  }
  if (required.some(key => !Object.prototype.hasOwnProperty.call(data, key))) {
    throw new Error(`${label}에 필수 필드가 없습니다`);
  }
  return data;
}

function text(
  data: Record<string, unknown>,
  key: string,
  label: string,
): string {
  const value = data[key];
  if (typeof value !== 'string') {
    throw new Error(`${label} 값이 문자열이 아닙니다`);
  }
  return value;
}

function displayName(
  data: Record<string, unknown>,
  key: string,
  label: string,
): string {
  const value = text(data, key, label);
  if (normalizeDisplayName(value, label) !== value) {
    throw new Error(`${label} 값이 canonical 형식이 아닙니다`);
  }
  return value;
}

function timestamp(
  data: Record<string, unknown>,
  key: string,
  label: string,
): number {
  const value = data[key];
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error(`${label} 값이 유효한 timestamp가 아닙니다`);
  }
  return value as number;
}

function canonicalUserId(
  data: Record<string, unknown>,
  key: string,
  label: string,
): UserId {
  const value = text(data, key, label);
  const decoded = userId(value);
  if (decoded !== value) {
    throw new Error(`${label} 값이 canonical 형식이 아닙니다`);
  }
  return decoded;
}

function decodeIdentity(value: unknown): AuthIdentity {
  const data = record(value, '인증 정보', [
    'userId',
    'displayName',
    'isAnonymous',
  ]);
  if (typeof data.isAnonymous !== 'boolean') {
    throw new Error('익명 인증 여부가 boolean이 아닙니다');
  }
  return {
    userId: canonicalUserId(data, 'userId', '사용자 식별자'),
    displayName: displayName(data, 'displayName', '인증 표시 이름'),
    isAnonymous: data.isAnonymous,
  };
}

function decodeGroup(value: unknown): CareGroup {
  const data = record(value, '돌봄 그룹', [
    'id',
    'name',
    'ownerId',
    'babyIds',
    'createdAt',
    'updatedAt',
  ]);
  const rawId = text(data, 'id', '그룹 식별자');
  const id = groupId(rawId);
  if (id !== rawId) {
    throw new Error('그룹 식별자가 canonical 형식이 아닙니다');
  }
  if (!Array.isArray(data.babyIds) || data.babyIds.length !== 1) {
    throw new Error('돌봄 그룹에는 아기 식별자 한 개가 필요합니다');
  }
  const rawBabyId = data.babyIds[0];
  if (typeof rawBabyId !== 'string' || babyId(rawBabyId) !== rawBabyId) {
    throw new Error('아기 식별자가 canonical 형식이 아닙니다');
  }
  const createdAt = timestamp(data, 'createdAt', '그룹 생성 시각');
  const updatedAt = timestamp(data, 'updatedAt', '그룹 수정 시각');
  if (updatedAt < createdAt) {
    throw new Error('그룹 수정 시각이 생성 시각보다 빠릅니다');
  }
  return {
    id,
    name: displayName(data, 'name', '그룹 이름'),
    ownerId: canonicalUserId(data, 'ownerId', '그룹 소유자 식별자'),
    babyIds: [babyId(rawBabyId)],
    createdAt,
    updatedAt,
  };
}

function decodeMembership(value: unknown): Membership {
  const data = record(value, '그룹 멤버십', [
    'userId',
    'groupId',
    'caregiverRole',
    'membershipRole',
    'displayName',
    'color',
    'joinedAt',
  ]);
  const rawGroupId = text(data, 'groupId', '멤버십 그룹 식별자');
  const membershipGroupId = groupId(rawGroupId);
  if (membershipGroupId !== rawGroupId) {
    throw new Error('멤버십 그룹 식별자가 canonical 형식이 아닙니다');
  }
  const caregiverRole = text(data, 'caregiverRole', '양육자 역할');
  const membershipRole = text(data, 'membershipRole', '멤버십 역할');
  const color = text(data, 'color', '멤버 색상');
  if (!CAREGIVER_ROLES.has(caregiverRole as Membership['caregiverRole'])) {
    throw new Error('양육자 역할이 유효하지 않습니다');
  }
  if (!MEMBERSHIP_ROLES.has(membershipRole as Membership['membershipRole'])) {
    throw new Error('멤버십 역할이 유효하지 않습니다');
  }
  if (!/^#[0-9A-Fa-f]{6}$/.test(color)) {
    throw new Error('멤버 색상이 #RRGGBB 형식이 아닙니다');
  }
  return {
    userId: canonicalUserId(data, 'userId', '멤버 사용자 식별자'),
    groupId: membershipGroupId,
    caregiverRole: caregiverRole as Membership['caregiverRole'],
    membershipRole: membershipRole as Membership['membershipRole'],
    displayName: displayName(data, 'displayName', '멤버 표시 이름'),
    color,
    joinedAt: timestamp(data, 'joinedAt', '멤버 합류 시각'),
  };
}

function canonicalAvatarStoragePath(
  value: string,
  expectedGroupId: string,
  expectedBabyId: string,
): boolean {
  const [root, pathGroupId, babies, pathBabyId, ...objectSegments] =
    value.split('/');
  return (
    root === 'groups' &&
    pathGroupId === expectedGroupId &&
    babies === 'babies' &&
    pathBabyId === expectedBabyId &&
    objectSegments.length > 0 &&
    objectSegments.every(
      segment => segment.length > 0 && segment !== '.' && segment !== '..',
    )
  );
}

function decodeBaby(value: unknown): Baby {
  const allowed = [
    'id',
    'groupId',
    'name',
    'birthDate',
    'sex',
    'dueDate',
    'avatarStoragePath',
    'createdAt',
    'updatedAt',
  ];
  const required = [
    'id',
    'groupId',
    'name',
    'birthDate',
    'sex',
    'createdAt',
    'updatedAt',
  ];
  const data = record(value, '아기 정보', allowed, required);
  const rawId = text(data, 'id', '아기 식별자');
  const id = babyId(rawId);
  if (id !== rawId) {
    throw new Error('아기 식별자가 canonical 형식이 아닙니다');
  }
  const rawGroupId = text(data, 'groupId', '아기 그룹 식별자');
  const babyGroupId = groupId(rawGroupId);
  if (babyGroupId !== rawGroupId) {
    throw new Error('아기 그룹 식별자가 canonical 형식이 아닙니다');
  }
  const sex = text(data, 'sex', '아기 성별');
  if (!['female', 'male', 'unspecified'].includes(sex)) {
    throw new Error('아기 성별이 유효하지 않습니다');
  }
  const dueDate = data.dueDate;
  if (dueDate !== undefined && typeof dueDate !== 'string') {
    throw new Error('출산 예정일 값이 문자열이 아닙니다');
  }
  const avatarStoragePath = data.avatarStoragePath;
  if (
    avatarStoragePath !== undefined &&
    (typeof avatarStoragePath !== 'string' ||
      !canonicalAvatarStoragePath(avatarStoragePath, rawGroupId, rawId))
  ) {
    throw new Error('아기 이미지 경로가 canonical 형식이 아닙니다');
  }
  return validateBaby({
    id,
    groupId: babyGroupId,
    name: displayName(data, 'name', '아기 이름'),
    birthDate: text(data, 'birthDate', '아기 생년월일'),
    sex: sex as Baby['sex'],
    ...(dueDate !== undefined ? { dueDate } : {}),
    ...(avatarStoragePath !== undefined ? { avatarStoragePath } : {}),
    createdAt: timestamp(data, 'createdAt', '아기 정보 생성 시각'),
    updatedAt: timestamp(data, 'updatedAt', '아기 정보 수정 시각'),
  });
}

function membershipsEqual(left: Membership, right: Membership): boolean {
  return (
    left.userId === right.userId &&
    left.groupId === right.groupId &&
    left.caregiverRole === right.caregiverRole &&
    left.membershipRole === right.membershipRole &&
    left.displayName === right.displayName &&
    left.color === right.color &&
    left.joinedAt === right.joinedAt
  );
}

function validateSnapshot(snapshot: CloudCareContextSnapshot): void {
  assertAuthenticatedCareContext(snapshot.context);
  if (snapshot.memberships.length === 0) {
    throw new Error('그룹 멤버십 목록이 비어 있습니다');
  }
  const membershipsByUser = new Map<UserId, Membership>();
  for (const membership of snapshot.memberships) {
    if (membership.groupId !== snapshot.context.group.id) {
      throw new Error('다른 그룹의 멤버십이 캐시에 포함되어 있습니다');
    }
    if (membershipsByUser.has(membership.userId)) {
      throw new Error('중복된 사용자 멤버십이 캐시에 포함되어 있습니다');
    }
    const expectedRole =
      membership.userId === snapshot.context.group.ownerId ? 'owner' : 'member';
    if (membership.membershipRole !== expectedRole) {
      throw new Error('그룹 소유자와 멤버십 역할이 일치하지 않습니다');
    }
    membershipsByUser.set(membership.userId, membership);
  }
  const selected = membershipsByUser.get(snapshot.context.identity.userId);
  if (!selected || !membershipsEqual(selected, snapshot.context.membership)) {
    throw new Error('현재 사용자의 멤버십과 멤버십 목록이 일치하지 않습니다');
  }
  if (!membershipsByUser.has(snapshot.context.group.ownerId)) {
    throw new Error('그룹 소유자 멤버십이 캐시에 없습니다');
  }
}

function decodeSnapshot(value: unknown): CloudCareContextSnapshot {
  const envelope = record(value, '공동 돌봄 캐시', [
    'version',
    'context',
    'memberships',
  ]);
  if (envelope.version !== CACHE_VERSION) {
    throw new Error('지원하지 않는 공동 돌봄 캐시 버전입니다');
  }
  const contextData = record(envelope.context, '돌봄 context', [
    'identity',
    'membership',
    'group',
    'baby',
  ]);
  if (!Array.isArray(envelope.memberships)) {
    throw new Error('그룹 멤버십 목록이 배열이 아닙니다');
  }
  const snapshot: CloudCareContextSnapshot = {
    context: {
      identity: decodeIdentity(contextData.identity),
      membership: decodeMembership(contextData.membership),
      group: decodeGroup(contextData.group),
      baby: decodeBaby(contextData.baby),
    },
    memberships: envelope.memberships.map(decodeMembership),
  };
  validateSnapshot(snapshot);
  return snapshot;
}

function encodeIdentity(identity: AuthIdentity) {
  return {
    userId: identity.userId,
    displayName: identity.displayName,
    isAnonymous: identity.isAnonymous,
  };
}

function encodeMembership(membership: Membership) {
  return {
    userId: membership.userId,
    groupId: membership.groupId,
    caregiverRole: membership.caregiverRole,
    membershipRole: membership.membershipRole,
    displayName: membership.displayName,
    color: membership.color,
    joinedAt: membership.joinedAt,
  };
}

function encodeGroup(group: CareGroup) {
  return {
    id: group.id,
    name: group.name,
    ownerId: group.ownerId,
    babyIds: [...group.babyIds],
    createdAt: group.createdAt,
    updatedAt: group.updatedAt,
  };
}

function encodeBaby(baby: Baby) {
  return {
    id: baby.id,
    groupId: baby.groupId,
    name: baby.name,
    birthDate: baby.birthDate,
    sex: baby.sex,
    ...(baby.dueDate !== undefined ? { dueDate: baby.dueDate } : {}),
    ...(baby.avatarStoragePath !== undefined
      ? { avatarStoragePath: baby.avatarStoragePath }
      : {}),
    createdAt: baby.createdAt,
    updatedAt: baby.updatedAt,
  };
}

function encodeSnapshot(snapshot: CloudCareContextSnapshot) {
  return {
    version: CACHE_VERSION,
    context: {
      identity: encodeIdentity(snapshot.context.identity),
      membership: encodeMembership(snapshot.context.membership),
      group: encodeGroup(snapshot.context.group),
      baby: encodeBaby(snapshot.context.baby),
    },
    memberships: snapshot.memberships.map(encodeMembership),
  };
}

export class CloudCareContextCache {
  readonly #storage: StringStoragePort;

  constructor(storage: StringStoragePort = AsyncStorage) {
    this.#storage = storage;
  }

  async load(
    expectedUserId: UserId,
  ): Promise<CloudCareContextSnapshot | undefined> {
    const raw = await this.#storage.getItem(CLOUD_CARE_CONTEXT_KEY);
    if (raw === null) {
      return undefined;
    }
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      await this.#discardInvalid();
      throw new CloudCareContextHydrationError('invalid-json');
    }
    let snapshot: CloudCareContextSnapshot;
    try {
      snapshot = decodeSnapshot(value);
    } catch (error) {
      await this.#discardInvalid();
      throw new CloudCareContextHydrationError(
        'invalid-schema',
        error instanceof Error ? error.message : undefined,
      );
    }
    if (snapshot.context.identity.userId !== expectedUserId) {
      await this.#discardInvalid();
      return undefined;
    }
    return snapshot;
  }

  async save(snapshot: CloudCareContextSnapshot): Promise<void> {
    const encoded = encodeSnapshot(snapshot);
    decodeSnapshot(encoded);
    await this.#storage.setItem(
      CLOUD_CARE_CONTEXT_KEY,
      JSON.stringify(encoded),
    );
  }

  async clear(): Promise<void> {
    await this.#storage.removeItem(CLOUD_CARE_CONTEXT_KEY);
  }

  async #discardInvalid(): Promise<void> {
    try {
      await this.#storage.removeItem(CLOUD_CARE_CONTEXT_KEY);
    } catch {
      // Preserve the schema/identity failure as the actionable signal.
    }
  }
}

/**
 * Serializes session cache writes with revocation clears. Revoking a token is
 * synchronous so a membership refresh that completes later cannot restore a
 * context after its clear has been queued.
 */
export class CloudCareContextSessionStore {
  readonly #cache: CloudCareContextCache;
  #generation = 0;
  #tail: Promise<void> = Promise.resolve();

  constructor(cache: CloudCareContextCache = new CloudCareContextCache()) {
    this.#cache = cache;
  }

  begin(): CloudCareContextSessionToken {
    this.#generation += 1;
    return this.#generation;
  }

  isCurrent(token: CloudCareContextSessionToken): boolean {
    return token === this.#generation;
  }

  async save(
    token: CloudCareContextSessionToken,
    snapshot: CloudCareContextSnapshot,
  ): Promise<boolean> {
    return this.#enqueue(async () => {
      if (!this.isCurrent(token)) {
        return false;
      }
      await this.#cache.save(snapshot);
      return this.isCurrent(token);
    });
  }

  clear(token: CloudCareContextSessionToken): Promise<boolean> {
    if (!this.isCurrent(token)) {
      return Promise.resolve(false);
    }
    this.#generation += 1;
    return this.#enqueue(async () => {
      await this.#cache.clear();
      return true;
    });
  }

  #enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.#tail.then(operation, operation);
    this.#tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}
