import {Storage} from '@apps-in-toss/framework';
import {type Baby} from '../../../../packages/product-core/src/domain/baby.ts';
import {
  createCareEvent,
  type CareEvent,
  type SleepEvent,
  type MedicationActiveIngredient,
  type MedicationCategory,
  type MedicationDoseUnit,
  type TemperatureMeasurementSite,
} from '../../../../packages/product-core/src/domain/care-event.ts';
import type {CareEventQuery} from '../../../../packages/product-core/src/ports/care-event-repository.ts';
import type {
  CareEventMutation,
  CareEventPushResult,
  CareEventRemoteObservation,
  CareEventRemotePage,
  CareEventRemotePageObservation,
  CareEventRemoteStorePort,
} from '../../../../packages/product-core/src/ports/care-event-remote-store.ts';
import type {CareEventPageRequest} from '../../../../packages/product-core/src/ports/care-event-timeline.ts';
import type {
  ActiveSleepObservation,
  CareEventProjectionRemotePort,
  CareEventProjectionScope,
  CareEventWindowObservation,
  CareEventWindowRequest,
  LatestCareEventObservation,
  LatestCareEventRequest,
} from '../../../../packages/product-core/src/ports/care-event-projection.ts';
import {
  type CareGroup,
  type Membership,
} from '../../../../packages/product-core/src/domain/care-group.ts';
import {
  inviteCode,
  type CareGroupInvite,
} from '../../../../packages/product-core/src/domain/invite.ts';
import {
  babyId,
  eventId,
  groupId,
  inviteId,
  userId,
  type EventId,
  type GroupId,
} from '../../../../packages/product-core/src/domain/ids.ts';
import {createRemoveGroupMember} from '../../../../packages/product-core/src/use_cases/remove-group-member.ts';
import {createUpdateBabyProfile} from '../../../../packages/product-core/src/use_cases/update-baby-profile.ts';
import {
  careEventMutationId,
  careEventPayloadHash,
  careEventsEqual,
} from '../../../../packages/product-data/src/care-event-revision.ts';
import {careEventSyncStorageKey} from '../../../../packages/product-data/src/persistent-care-event-sync-store.ts';
import {currentAitAppCheckToken} from './ait-app-check';

const PROJECT_ID = 'seorilabs-babycare';
const PLATFORM_URL =
  'https://platform-api-306278488979.asia-northeast3.run.app';
const FUNCTIONS_URL =
  'https://asia-northeast3-seorilabs-babycare.cloudfunctions.net';
const FIRESTORE_DOCUMENT_ROOT =
  `projects/${PROJECT_ID}/databases/(default)/documents`;
const FIRESTORE_URL =
  `https://firestore.googleapis.com/v1/${FIRESTORE_DOCUMENT_ROOT}`;
const SESSION_KEY = 'babynest.firebase-session.v1';
const FIREBASE_WEB_API_KEY = process.env.FIREBASE_WEB_API_KEY ?? '';

interface StoredSession {
  readonly refreshToken: string;
  readonly uid: string;
  readonly groupId?: string;
  readonly babyId?: string;
}

interface AccessSession extends StoredSession {
  readonly idToken: string;
}

export interface ReadyCareSession {
  readonly uid: string;
  readonly group: CareGroup;
  readonly baby: Baby;
  readonly membership: Membership;
  readonly memberships: readonly Membership[];
  readonly events: readonly CareEvent[];
}

interface FirestoreListResponse {
  readonly documents?: readonly FirestoreDocument[];
  readonly nextPageToken?: string;
}

type FirestoreValue =
  | {readonly stringValue: string}
  | {readonly integerValue: string}
  | {readonly doubleValue: number}
  | {readonly booleanValue: boolean}
  | {readonly nullValue: null}
  | {readonly arrayValue: {readonly values?: readonly FirestoreValue[]}}
  | {readonly mapValue: {readonly fields?: Readonly<Record<string, FirestoreValue>>}};

interface FirestoreDocument {
  readonly name: string;
  readonly fields?: Readonly<Record<string, FirestoreValue>>;
  readonly updateTime?: string;
}

function requireApiKey(): string {
  if (!FIREBASE_WEB_API_KEY) {
    throw new Error('Firebase 연결 설정을 불러오지 못했어요.');
  }
  return FIREBASE_WEB_API_KEY;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} 응답을 확인하지 못했어요.`);
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} 응답을 확인하지 못했어요.`);
  }
  return value;
}

function finiteNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label} 응답을 확인하지 못했어요.`);
  }
  return value;
}

function enumValue<T extends string>(
  value: unknown,
  values: readonly T[],
  label: string,
): T {
  if (typeof value !== 'string' || !values.includes(value as T)) {
    throw new Error(`${label} 응답을 확인하지 못했어요.`);
  }
  return value as T;
}

function randomId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 12)}`;
}

function toFirestoreValue(value: unknown): FirestoreValue {
  if (value === null || value === undefined) {
    return {nullValue: null};
  }
  if (typeof value === 'string') {
    return {stringValue: value};
  }
  if (typeof value === 'boolean') {
    return {booleanValue: value};
  }
  if (typeof value === 'number') {
    return Number.isSafeInteger(value)
      ? {integerValue: String(value)}
      : {doubleValue: value};
  }
  if (Array.isArray(value)) {
    return {arrayValue: {values: value.map(toFirestoreValue)}};
  }
  if (typeof value === 'object') {
    return {
      mapValue: {
        fields: Object.fromEntries(
          Object.entries(value)
            .filter(([, item]) => item !== undefined)
            .map(([key, item]) => [key, toFirestoreValue(item)]),
        ),
      },
    };
  }
  throw new Error('Firestore에 저장할 수 없는 값이에요.');
}

function toFirestoreFields(
  value: object,
): Readonly<Record<string, FirestoreValue>> {
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => [key, toFirestoreValue(item)]),
  );
}

function fromFirestoreValue(value: FirestoreValue): unknown {
  if ('stringValue' in value) {
    return value.stringValue;
  }
  if ('integerValue' in value) {
    return Number(value.integerValue);
  }
  if ('doubleValue' in value) {
    return value.doubleValue;
  }
  if ('booleanValue' in value) {
    return value.booleanValue;
  }
  if ('nullValue' in value) {
    return null;
  }
  if ('arrayValue' in value) {
    return (value.arrayValue.values ?? []).map(fromFirestoreValue);
  }
  return Object.fromEntries(
    Object.entries(value.mapValue.fields ?? {}).map(([key, item]) => [
      key,
      fromFirestoreValue(item),
    ]),
  );
}

function fromFirestoreDocument(document: FirestoreDocument): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(document.fields ?? {}).map(([key, value]) => [
      key,
      fromFirestoreValue(value),
    ]),
  );
}

async function jsonResponse(response: Response): Promise<unknown> {
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    throw new Error('서버 응답을 읽지 못했어요.');
  }
  if (!response.ok) {
    const body = record(value, '서버');
    const responseError = body.error;
    const message =
      responseError &&
      typeof responseError === 'object' &&
      'message' in responseError
        ? String(responseError.message)
        : '서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.';
    const error = new Error(message) as Error & {status?: number};
    error.status = response.status;
    throw error;
  }
  return value;
}

async function saveStoredSession(session: StoredSession): Promise<void> {
  await Storage.setItem(SESSION_KEY, JSON.stringify(session));
}

async function loadStoredSession(): Promise<StoredSession | undefined> {
  const raw = await Storage.getItem(SESSION_KEY);
  if (!raw) {
    return undefined;
  }
  try {
    const value = record(JSON.parse(raw), '저장된 인증');
    return {
      refreshToken: text(value.refreshToken, 'refresh token'),
      uid: text(value.uid, '사용자'),
      ...(typeof value.groupId === 'string' && value.groupId
        ? {groupId: value.groupId}
        : {}),
      ...(typeof value.babyId === 'string' && value.babyId
        ? {babyId: value.babyId}
        : {}),
    };
  } catch {
    await Storage.removeItem(SESSION_KEY);
    return undefined;
  }
}

async function refreshAccessSession(
  stored: StoredSession,
): Promise<AccessSession> {
  const response = await fetch(
    `https://securetoken.googleapis.com/v1/token?key=${requireApiKey()}`,
    {
      method: 'POST',
      headers: {'Content-Type': 'application/x-www-form-urlencoded'},
      body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(
        stored.refreshToken,
      )}`,
    },
  );
  const body = record(await jsonResponse(response), 'token refresh');
  const session: AccessSession = {
    idToken: text(body.id_token, 'ID token'),
    refreshToken: text(body.refresh_token, 'refresh token'),
    uid: text(body.user_id, '사용자'),
    ...(stored.groupId ? {groupId: stored.groupId} : {}),
    ...(stored.babyId ? {babyId: stored.babyId} : {}),
  };
  if (session.uid !== stored.uid) {
    throw new Error('저장된 사용자와 인증 사용자가 일치하지 않아요.');
  }
  await saveStoredSession(session);
  return session;
}

async function createAccessSession(): Promise<AccessSession> {
  const appCheckToken = await currentAitAppCheckToken();
  const platformResponse = await fetch(
    `${PLATFORM_URL}/v1/auth/firebase-custom-token`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Seori-App': 'babycare',
        'X-Firebase-AppCheck': appCheckToken,
      },
      body: JSON.stringify({appId: 'babycare'}),
    },
  );
  const platformBody = record(await jsonResponse(platformResponse), '인증');
  if (platformBody.ok !== true) {
    throw new Error('인증 서버에 연결하지 못했어요.');
  }
  const platformResult = record(platformBody.result, '인증');
  const customToken = text(
    platformResult.firebaseCustomToken,
    'Firebase custom token',
  );
  const appUserId = text(platformResult.appUserId, '사용자');

  const authResponse = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${requireApiKey()}`,
    {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({token: customToken, returnSecureToken: true}),
    },
  );
  const authBody = record(await jsonResponse(authResponse), 'Firebase 인증');
  const session: AccessSession = {
    idToken: text(authBody.idToken, 'ID token'),
    refreshToken: text(authBody.refreshToken, 'refresh token'),
    uid: appUserId,
  };
  await saveStoredSession(session);
  return session;
}

async function accessSession(): Promise<AccessSession> {
  const stored = await loadStoredSession();
  if (!stored) {
    return createAccessSession();
  }
  try {
    return await refreshAccessSession(stored);
  } catch {
    await Storage.removeItem(SESSION_KEY);
    return createAccessSession();
  }
}

async function firestoreRawRequest(
  session: AccessSession,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const appCheckToken = await currentAitAppCheckToken();
  return fetch(`${FIRESTORE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${session.idToken}`,
      'Content-Type': 'application/json',
      'X-Firebase-AppCheck': appCheckToken,
      ...init.headers,
    },
  });
}

async function firestoreRequest(
  session: AccessSession,
  path: string,
  init: RequestInit = {},
): Promise<unknown> {
  const response = await firestoreRawRequest(session, path, init);
  return jsonResponse(response);
}

async function getDocument(
  session: AccessSession,
  path: string,
): Promise<FirestoreDocument> {
  return (await firestoreRequest(session, `/${path}`)) as FirestoreDocument;
}

async function getOptionalDocument(
  session: AccessSession,
  path: string,
): Promise<FirestoreDocument | undefined> {
  const response = await firestoreRawRequest(session, `/${path}`);
  if (response.status === 404) {
    return undefined;
  }
  return (await jsonResponse(response)) as FirestoreDocument;
}

async function discoverGroupId(
  session: AccessSession,
): Promise<string | undefined> {
  const response = await firestoreRequest(session, ':runQuery', {
    method: 'POST',
    body: JSON.stringify({
      structuredQuery: {
        from: [{collectionId: 'members', allDescendants: true}],
        where: {
          fieldFilter: {
            field: {fieldPath: 'userId'},
            op: 'EQUAL',
            value: {stringValue: session.uid},
          },
        },
        limit: 2,
      },
    }),
  });
  const rows = Array.isArray(response) ? response : [];
  const names = rows
    .map(row =>
      row && typeof row === 'object' && 'document' in row
        ? (row.document as FirestoreDocument).name
        : undefined,
    )
    .filter((name): name is string => Boolean(name));
  if (names.length > 1) {
    throw new Error('여러 돌봄 그룹 중 사용할 그룹을 선택해야 해요.');
  }
  return names[0]?.split('/').at(-3);
}

function decodeGroup(data: Record<string, unknown>): CareGroup {
  return {
    id: groupId(text(data.id, '그룹')),
    name: text(data.name, '그룹 이름'),
    ownerId: userId(text(data.ownerId, '그룹 소유자')),
    babyIds: (data.babyIds as string[]).map(value => babyId(value)),
    createdAt: Number(data.createdAt),
    updatedAt: Number(data.updatedAt),
  };
}

function decodeBaby(data: Record<string, unknown>): Baby {
  return {
    id: babyId(text(data.id, '아기')),
    groupId: groupId(text(data.groupId, '그룹')),
    name: text(data.name, '아기 이름'),
    birthDate: text(data.birthDate, '생년월일'),
    sex: data.sex === 'female' || data.sex === 'male' ? data.sex : 'unspecified',
    ...(typeof data.dueDate === 'string' ? {dueDate: data.dueDate} : {}),
    ...(typeof data.avatarStoragePath === 'string'
      ? {avatarStoragePath: data.avatarStoragePath}
      : {}),
    createdAt: Number(data.createdAt),
    updatedAt: Number(data.updatedAt),
  };
}

function decodeMembership(data: Record<string, unknown>): Membership {
  return {
    userId: userId(text(data.userId, '사용자')),
    groupId: groupId(text(data.groupId, '그룹')),
    caregiverRole:
      data.caregiverRole === 'parent' ||
      data.caregiverRole === 'grandparent' ||
      data.caregiverRole === 'sitter' ||
      data.caregiverRole === 'teacher'
        ? data.caregiverRole
        : 'other',
    membershipRole: data.membershipRole === 'owner' ? 'owner' : 'member',
    displayName: text(data.displayName, '양육자 이름'),
    color: text(data.color, '양육자 색상'),
    joinedAt: Number(data.joinedAt),
  };
}

function decodeEvent(data: Record<string, unknown>): CareEvent {
  const common = {
    id: eventId(text(data.id, '기록')),
    groupId: groupId(text(data.groupId, '그룹')),
    babyId: babyId(text(data.babyId, '아기')),
    caregiverId: userId(text(data.caregiverId, '기록자')),
    occurredAt: Number(data.occurredAt),
    createdAt: Number(data.createdAt),
    updatedAt: Number(data.updatedAt),
    revision: Number(data.revision),
    ...(typeof data.note === 'string' ? {note: data.note} : {}),
    ...(typeof data.deletedAt === 'number' ? {deletedAt: data.deletedAt} : {}),
  };
  if (data.kind === 'feeding') {
    return {
      ...common,
      kind: 'feeding',
      feedingType:
        data.feedingType === 'breast' ||
        data.feedingType === 'bottle_breastmilk' ||
        data.feedingType === 'solid'
          ? data.feedingType
          : 'formula',
      ...(typeof data.volumeMl === 'number' ? {volumeMl: data.volumeMl} : {}),
      ...(typeof data.leftDurationSeconds === 'number'
        ? {leftDurationSeconds: data.leftDurationSeconds}
        : {}),
      ...(typeof data.rightDurationSeconds === 'number'
        ? {rightDurationSeconds: data.rightDurationSeconds}
        : {}),
    };
  }
  if (data.kind === 'diaper') {
    return {
      ...common,
      kind: 'diaper',
      diaperType:
        data.diaperType === 'dirty' || data.diaperType === 'mixed'
          ? data.diaperType
          : 'wet',
    };
  }
  if (data.kind === 'temperature') {
    const temperatureCelsius = finiteNumber(data.temperatureCelsius, '체온');
    const measurementSite = enumValue<TemperatureMeasurementSite>(
      data.measurementSite,
      ['armpit', 'ear', 'forehead', 'oral', 'rectal', 'other'],
      '체온 측정부위',
    );
    const validated = createCareEvent(
      {
        groupId: common.groupId,
        babyId: common.babyId,
        caregiverId: common.caregiverId,
        kind: 'temperature',
        temperatureCelsius,
        measurementSite,
        occurredAt: common.occurredAt,
        ...(common.note !== undefined ? {note: common.note} : {}),
      },
      {id: common.id, now: common.createdAt},
    );
    if (validated.kind !== 'temperature') {
      throw new Error('체온 기록 응답을 확인하지 못했어요.');
    }
    return {
      ...common,
      kind: 'temperature',
      temperatureCelsius: validated.temperatureCelsius,
      measurementSite: validated.measurementSite,
    };
  }
  if (data.kind === 'medication') {
    const medicationCategory = enumValue<MedicationCategory>(
      data.medicationCategory,
      ['antipyretic', 'antibiotic', 'other'],
      '약 분류',
    );
    const activeIngredient = enumValue<MedicationActiveIngredient>(
      data.activeIngredient,
      ['acetaminophen', 'ibuprofen', 'other'],
      '약 주성분',
    );
    const doseUnit = enumValue<MedicationDoseUnit>(
      data.doseUnit,
      ['ml', 'mg', 'tablet', 'drop'],
      '복약 단위',
    );
    const validated = createCareEvent(
      {
        groupId: common.groupId,
        babyId: common.babyId,
        caregiverId: common.caregiverId,
        kind: 'medication',
        medicationName: text(data.medicationName, '약 이름'),
        medicationCategory,
        activeIngredient,
        doseAmount: finiteNumber(data.doseAmount, '복약 양'),
        doseUnit,
        minimumIntervalMinutes: finiteNumber(
          data.minimumIntervalMinutes,
          '복약 간격',
        ),
        occurredAt: common.occurredAt,
        ...(common.note !== undefined ? {note: common.note} : {}),
      },
      {id: common.id, now: common.createdAt},
    );
    if (validated.kind !== 'medication') {
      throw new Error('복약 기록 응답을 확인하지 못했어요.');
    }
    return {
      ...common,
      kind: 'medication',
      medicationName: validated.medicationName,
      medicationCategory: validated.medicationCategory,
      activeIngredient: validated.activeIngredient,
      doseAmount: validated.doseAmount,
      doseUnit: validated.doseUnit,
      minimumIntervalMinutes: validated.minimumIntervalMinutes,
    };
  }
  return {
    ...common,
    kind: 'sleep',
    sleepType: data.sleepType === 'night' ? 'night' : 'nap',
    startedAt: Number(data.startedAt),
    ...(typeof data.endedAt === 'number' ? {endedAt: data.endedAt} : {}),
  };
}

const MAX_EVENT_PAGES = 10;

async function listCollectionDocuments(
  session: AccessSession,
  collectionPath: string,
  options: {readonly orderBy?: string; readonly maxPages?: number} = {},
): Promise<readonly FirestoreDocument[]> {
  const documents: FirestoreDocument[] = [];
  let pageToken: string | undefined;
  const maxPages = options.maxPages ?? 1;
  for (let page = 0; page < maxPages; page += 1) {
    const query = new URLSearchParams({pageSize: '100'});
    if (options.orderBy) {
      query.set('orderBy', options.orderBy);
    }
    if (pageToken) {
      query.set('pageToken', pageToken);
    }
    const value = (await firestoreRequest(
      session,
      `/${collectionPath}?${query.toString()}`,
    )) as FirestoreListResponse;
    documents.push(...(value.documents ?? []));
    pageToken = value.nextPageToken;
    if (!pageToken) {
      break;
    }
  }
  return documents;
}

async function loadAllEvents(
  session: AccessSession,
  groupValue: string,
  babyValue: string,
): Promise<readonly CareEvent[]> {
  const documents = await listCollectionDocuments(
    session,
    `groups/${groupValue}/events`,
    {orderBy: 'occurredAt desc', maxPages: MAX_EVENT_PAGES},
  );
  return documents
    .map(document => decodeEvent(fromFirestoreDocument(document)))
    .filter(event => event.babyId === babyValue)
    .sort(
      (left, right) =>
        right.occurredAt - left.occurredAt ||
        right.id.localeCompare(left.id),
    );
}

async function loadMemberships(
  session: AccessSession,
  group: CareGroup,
): Promise<readonly Membership[]> {
  const documents = await listCollectionDocuments(
    session,
    `groups/${group.id}/members`,
  );
  return documents
    .map(document => decodeMembership(fromFirestoreDocument(document)))
    .sort((left, right) => left.joinedAt - right.joinedAt);
}

function isGroupAccessLostError(error: unknown): boolean {
  const status =
    error && typeof error === 'object' && 'status' in error
      ? Number((error as {status?: unknown}).status)
      : undefined;
  return status === 403 || status === 404;
}

async function purgeRevokedCareRecords(session: StoredSession): Promise<void> {
  if (!session.groupId || !session.babyId) {
    return;
  }
  await Storage.removeItem(
    careEventSyncStorageKey({
      userId: userId(session.uid),
      groupId: groupId(session.groupId),
      babyId: babyId(session.babyId),
    }),
  );
}

async function loadGroupSession(
  session: AccessSession,
  foundGroupId: string,
): Promise<ReadyCareSession> {
  const groupDocument = await getDocument(session, `groups/${foundGroupId}`);
  const group = decodeGroup(fromFirestoreDocument(groupDocument));
  const [membershipDocument, babyDocument, memberships] = await Promise.all([
    getDocument(session, `groups/${group.id}/members/${session.uid}`),
    getDocument(session, `groups/${group.id}/babies/${group.babyIds[0]}`),
    loadMemberships(session, group),
  ]);
  const membership = decodeMembership(
    fromFirestoreDocument(membershipDocument),
  );
  const baby = decodeBaby(fromFirestoreDocument(babyDocument));
  if (session.groupId !== group.id || session.babyId !== baby.id) {
    await saveStoredSession({...session, groupId: group.id, babyId: baby.id});
  }
  const events = (await loadAllEvents(session, group.id, baby.id)).filter(
    event => event.deletedAt === undefined,
  );
  return {uid: session.uid, group, baby, membership, memberships, events};
}

async function readySession(
  session: AccessSession,
): Promise<ReadyCareSession | undefined> {
  const cachedGroupId = session.groupId;
  if (!cachedGroupId) {
    const foundGroupId = await discoverGroupId(session);
    return foundGroupId ? loadGroupSession(session, foundGroupId) : undefined;
  }
  try {
    return await loadGroupSession(session, cachedGroupId);
  } catch (error) {
    if (!isGroupAccessLostError(error)) {
      throw error;
    }
    // 그룹이 삭제됐거나 멤버십이 사라진 경우에만 404/403이 확정된다. 남은
    // 멤버십을 서버에서 재판정하고, 이 재판정이 일시 오류로 실패하면 캐시를
    // 보존한 채 부팅 실패로 되돌린다.
    const rediscoveredGroupId = await discoverGroupId(session);
    if (rediscoveredGroupId === cachedGroupId) {
      throw error;
    }
    await purgeRevokedCareRecords(session);
    if (rediscoveredGroupId) {
      return loadGroupSession(
        {
          idToken: session.idToken,
          refreshToken: session.refreshToken,
          uid: session.uid,
        },
        rediscoveredGroupId,
      );
    }
    await saveStoredSession({
      refreshToken: session.refreshToken,
      uid: session.uid,
    });
    return undefined;
  }
}

export async function bootstrapCareSession(): Promise<ReadyCareSession | undefined> {
  return readySession(await accessSession());
}

export async function createCareGroup(input: {
  readonly caregiverName: string;
  readonly babyName: string;
  readonly birthDate: string;
}): Promise<ReadyCareSession> {
  const session = await accessSession();
  const now = Date.now();
  const nextGroupId = randomId('group');
  const nextBabyId = randomId('baby');
  const group: CareGroup = {
    id: groupId(nextGroupId),
    name: input.babyName.trim(),
    ownerId: userId(session.uid),
    babyIds: [babyId(nextBabyId)],
    createdAt: now,
    updatedAt: now,
  };
  const membership: Membership = {
    userId: userId(session.uid),
    groupId: group.id,
    caregiverRole: 'other',
    membershipRole: 'owner',
    displayName: input.caregiverName.trim(),
    color: '#5FB49C',
    joinedAt: now,
  };
  const baby: Baby = {
    id: babyId(nextBabyId),
    groupId: group.id,
    name: input.babyName.trim(),
    birthDate: input.birthDate.trim(),
    sex: 'unspecified',
    createdAt: now,
    updatedAt: now,
  };
  const documentRoot = `${FIRESTORE_DOCUMENT_ROOT}/groups/${group.id}`;
  await firestoreRequest(session, ':commit', {
    method: 'POST',
    body: JSON.stringify({
      writes: [
        {
          update: {name: documentRoot, fields: toFirestoreFields(group)},
          currentDocument: {exists: false},
        },
        {
          update: {
            name: `${documentRoot}/members/${session.uid}`,
            fields: toFirestoreFields(membership),
          },
          currentDocument: {exists: false},
        },
        {
          update: {
            name: `${documentRoot}/babies/${baby.id}`,
            fields: toFirestoreFields(baby),
          },
          currentDocument: {exists: false},
        },
      ],
    }),
  });
  await saveStoredSession({...session, groupId: group.id, babyId: baby.id});
  return {
    uid: session.uid,
    group,
    baby,
    membership,
    memberships: [membership],
    events: [],
  };
}

async function callFunction(
  session: AccessSession,
  name:
    | 'createInvite'
    | 'acceptInvite'
    | 'deleteAccount'
    | 'logAnalyticsEvents',
  data: Readonly<Record<string, unknown>>,
): Promise<Record<string, unknown>> {
  const appCheckToken = await currentAitAppCheckToken();
  const response = await fetch(`${FUNCTIONS_URL}/${name}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.idToken}`,
      'Content-Type': 'application/json',
      'X-Firebase-AppCheck': appCheckToken,
    },
    body: JSON.stringify({data}),
  });
  const body = record(await jsonResponse(response), name);
  return record(body.result, name);
}

export async function sendAnalyticsEventsToGa4(input: {
  readonly clientId: string;
  readonly events: readonly {
    readonly name: string;
    readonly params: Readonly<Record<string, string | number | boolean>>;
    readonly timestamp_micros: number;
  }[];
}): Promise<void> {
  const session = await accessSession();
  await callFunction(session, 'logAnalyticsEvents', input);
}

export async function currentFirebaseIdToken(): Promise<string> {
  return (await accessSession()).idToken;
}

export async function joinCareGroup(input: {
  readonly caregiverName: string;
  readonly code: string;
}): Promise<ReadyCareSession> {
  const session = await accessSession();
  const membership = await callFunction(session, 'acceptInvite', {
    code: input.code.replace(/\s/g, '').toUpperCase(),
    displayName: input.caregiverName.trim(),
  });
  const nextSession = {
    ...session,
    groupId: text(membership.groupId, '초대 그룹'),
  };
  await saveStoredSession(nextSession);
  const ready = await readySession(nextSession);
  if (!ready) {
    throw new Error('초대된 돌봄 그룹을 불러오지 못했어요.');
  }
  return ready;
}

export async function createInviteCode(
  ready: ReadyCareSession,
): Promise<CareGroupInvite> {
  const session = await accessSession();
  if (session.uid !== ready.uid) {
    throw new Error('현재 사용자를 다시 확인해 주세요.');
  }
  const result = await callFunction(session, 'createInvite', {
    groupId: ready.group.id,
  });
  const createdAt = finiteNumber(result.createdAt, '초대 생성 시각');
  const expiresAt = finiteNumber(result.expiresAt, '초대 만료 시각');
  if (!Number.isSafeInteger(createdAt) || !Number.isSafeInteger(expiresAt)) {
    throw new Error('초대 코드 시각을 확인하지 못했어요.');
  }
  return {
    id: inviteId(text(result.inviteId, '초대')),
    groupId: ready.group.id,
    invitedBy: userId(ready.uid),
    code: inviteCode(text(result.code, '초대 코드')),
    createdAt,
    expiresAt,
  };
}

function encodedEvent(event: CareEvent): Record<string, unknown> {
  const payloadHash = careEventPayloadHash(event);
  return {
    ...event,
    isDeleted: event.deletedAt !== undefined,
    lastMutationId: careEventMutationId(event),
    payloadHash,
  };
}

function remoteFailure(error: unknown): {
  readonly remoteError: {
    readonly code:
      | 'retryable'
      | 'unauthenticated'
      | 'permission_denied'
      | 'invalid';
    readonly cause: unknown;
  };
} {
  const status =
    error && typeof error === 'object' && 'status' in error
      ? Number(error.status)
      : undefined;
  const code =
    status === 401
      ? 'unauthenticated'
      : status === 403
        ? 'permission_denied'
        : status === 400 || status === 422
          ? 'invalid'
          : 'retryable';
  return {remoteError: {code, cause: error}};
}

function eventMatchesQuery(event: CareEvent, query: CareEventQuery): boolean {
  return (
    event.groupId === query.groupId &&
    event.babyId === query.babyId &&
    (query.includeDeleted === true || event.deletedAt === undefined) &&
    (query.from === undefined || event.occurredAt >= query.from) &&
    (query.to === undefined || event.occurredAt < query.to) &&
    (!query.kinds || query.kinds.includes(event.kind))
  );
}

function sortedEvents(events: readonly CareEvent[]): readonly CareEvent[] {
  return [...events].sort(
    (left, right) =>
      right.occurredAt - left.occurredAt ||
      right.id.localeCompare(left.id),
  );
}

function receiptMatches(
  document: FirestoreDocument,
  mutation: CareEventMutation,
  actorUid: string,
): boolean {
  const data = fromFirestoreDocument(document);
  return (
    data.id === mutation.id &&
    data.groupId === mutation.event.groupId &&
    data.babyId === mutation.event.babyId &&
    data.eventId === mutation.event.id &&
    data.revision === mutation.event.revision &&
    data.payloadHash === mutation.payloadHash &&
    data.kind === mutation.kind &&
    data.actorUid === actorUid
  );
}

async function activeSleepFromLock(
  session: AccessSession,
  groupValue: GroupId,
  babyValue: string,
): Promise<CareEvent | undefined> {
  const lock = await getOptionalDocument(
    session,
    `groups/${groupValue}/activeSleeps/${babyValue}`,
  );
  if (!lock) {
    return undefined;
  }
  const lockData = fromFirestoreDocument(lock);
  const lockedEventId = text(lockData.eventId, '활성 수면 기록');
  const document = await getOptionalDocument(
    session,
    `groups/${groupValue}/events/${lockedEventId}`,
  );
  return document
    ? decodeEvent(fromFirestoreDocument(document))
    : undefined;
}

/**
 * AppsInToss Firestore REST transport. UI writes are placed behind the shared
 * durable local outbox; this class only owns server acknowledgement and polling.
 */
export class AitFirestoreCareEventRemoteStore
  implements CareEventRemoteStorePort, CareEventProjectionRemotePort
{
  readonly #actorUid: string;

  constructor(actorUid: string) {
    this.#actorUid = actorUid;
  }

  async push(mutation: CareEventMutation): Promise<CareEventPushResult> {
    const event = mutation.event;
    if (
      (event.caregiverId !== this.#actorUid && mutation.kind !== 'end_sleep') ||
      mutation.id !== careEventMutationId(event) ||
      mutation.payloadHash !== careEventPayloadHash(event) ||
      mutation.baseRevision !== event.revision - 1
    ) {
      throw remoteFailure(new Error('돌봄 기록 변경 요청이 올바르지 않아요.'));
    }
    try {
      const session = await accessSession();
      if (session.uid !== this.#actorUid) {
        throw Object.assign(new Error('현재 사용자를 다시 확인해 주세요.'), {
          status: 401,
        });
      }
      const root = `${FIRESTORE_DOCUMENT_ROOT}/groups/${event.groupId}`;
      const eventPath = `groups/${event.groupId}/events/${event.id}`;
      const receiptPath =
        `groups/${event.groupId}/eventMutationReceipts/${mutation.id}`;
      const [source, receipt] = await Promise.all([
        getOptionalDocument(session, eventPath),
        getOptionalDocument(session, receiptPath),
      ]);
      const remote = source
        ? decodeEvent(fromFirestoreDocument(source))
        : undefined;
      if (receipt) {
        if (!receiptMatches(receipt, mutation, session.uid) || !remote) {
          throw Object.assign(new Error('동기화 확인 정보가 올바르지 않아요.'), {
            status: 422,
          });
        }
        return remote.revision === event.revision && careEventsEqual(remote, event)
          ? {kind: 'already_applied', remote}
          : {kind: 'revision_conflict', remote};
      }
      if (mutation.kind === 'create') {
        if (remote) {
          return {kind: 'revision_conflict', remote};
        }
      } else if (!remote || remote.revision !== mutation.baseRevision) {
        if (remote) {
          return {kind: 'revision_conflict', remote};
        }
        throw Object.assign(new Error('서버 돌봄 기록을 찾지 못했어요.'), {
          status: 422,
        });
      }

      const lockEvent =
        event.kind === 'sleep'
          ? await activeSleepFromLock(session, event.groupId, event.babyId)
          : undefined;
      if (
        mutation.kind === 'create' &&
        event.kind === 'sleep' &&
        event.endedAt === undefined &&
        lockEvent &&
        lockEvent.id !== event.id &&
        lockEvent.kind === 'sleep' &&
        lockEvent.endedAt === undefined
      ) {
        return {kind: 'active_sleep_conflict', remoteActiveSleep: lockEvent};
      }

      const payload = encodedEvent(event);
      const writes: Record<string, unknown>[] = [
        {
          update: {
            name: `${root}/events/${event.id}`,
            fields: toFirestoreFields(payload),
          },
          currentDocument:
            mutation.kind === 'create'
              ? {exists: false}
              : {updateTime: source?.updateTime},
        },
      ];
      if (
        mutation.kind === 'create' &&
        event.kind === 'sleep' &&
        event.endedAt === undefined
      ) {
        writes.push({
          update: {
            name: `${root}/activeSleeps/${event.babyId}`,
            fields: toFirestoreFields({
              groupId: event.groupId,
              babyId: event.babyId,
              eventId: event.id,
              caregiverId: event.caregiverId,
              startedAt: event.startedAt,
              createdAt: event.createdAt,
            }),
          },
          currentDocument: {exists: false},
        });
      } else if (lockEvent?.id === event.id) {
        writes.push({
          delete: `${root}/activeSleeps/${event.babyId}`,
          currentDocument: {exists: true},
        });
      }
      writes.push({
        update: {
          name: `${root}/eventMutationReceipts/${mutation.id}`,
          fields: toFirestoreFields({
            id: mutation.id,
            groupId: event.groupId,
            babyId: event.babyId,
            eventId: event.id,
            revision: event.revision,
            payloadHash: mutation.payloadHash,
            kind: mutation.kind,
            actorUid: session.uid,
            payload,
          }),
        },
        updateTransforms: [
          {fieldPath: 'appliedAt', setToServerValue: 'REQUEST_TIME'},
        ],
        currentDocument: {exists: false},
      });
      await firestoreRequest(session, ':commit', {
        method: 'POST',
        body: JSON.stringify({writes}),
      });
      return {kind: 'applied', remote: event};
    } catch (error) {
      if (error && typeof error === 'object' && 'remoteError' in error) {
        throw error;
      }
      const status =
        error && typeof error === 'object' && 'status' in error
          ? Number(error.status)
          : undefined;
      if (status === 409 || status === 412) {
        try {
          const session = await accessSession();
          const [source, receipt] = await Promise.all([
            getOptionalDocument(
              session,
              `groups/${event.groupId}/events/${event.id}`,
            ),
            getOptionalDocument(
              session,
              `groups/${event.groupId}/eventMutationReceipts/${mutation.id}`,
            ),
          ]);
          const remote = source
            ? decodeEvent(fromFirestoreDocument(source))
            : undefined;
          if (receipt && remote && receiptMatches(receipt, mutation, session.uid)) {
            return remote.revision === event.revision &&
              careEventsEqual(remote, event)
              ? {kind: 'already_applied', remote}
              : {kind: 'revision_conflict', remote};
          }
          const active =
            event.kind === 'sleep'
              ? await activeSleepFromLock(
                  session,
                  event.groupId,
                  event.babyId,
                )
              : undefined;
          if (
            mutation.kind === 'create' &&
            event.kind === 'sleep' &&
            event.endedAt === undefined &&
            active?.kind === 'sleep' &&
            active.endedAt === undefined &&
            active.id !== event.id
          ) {
            return {kind: 'active_sleep_conflict', remoteActiveSleep: active};
          }
          if (remote) {
            return {kind: 'revision_conflict', remote};
          }
        } catch {
          // Preserve the original precondition failure when reconciliation fails.
        }
      }
      throw remoteFailure(error);
    }
  }

  async findById(
    groupValue: GroupId,
    targetEventId: EventId,
  ): Promise<CareEvent | undefined> {
    try {
      const session = await accessSession();
      const document = await getOptionalDocument(
        session,
        `groups/${groupValue}/events/${targetEventId}`,
      );
      return document
        ? decodeEvent(fromFirestoreDocument(document))
        : undefined;
    } catch (error) {
      throw remoteFailure(error);
    }
  }

  async list(query: CareEventQuery): Promise<readonly CareEvent[]> {
    try {
      const session = await accessSession();
      const all = await loadAllEvents(session, query.groupId, query.babyId);
      const matching = sortedEvents(all.filter(event => eventMatchesQuery(event, query)));
      return query.limit === undefined
        ? matching
        : matching.slice(0, query.limit);
    } catch (error) {
      throw remoteFailure(error);
    }
  }

  async fetchPage(request: CareEventPageRequest): Promise<CareEventRemotePage> {
    const all = await this.list({
      groupId: request.groupId,
      babyId: request.babyId,
      includeDeleted: true,
      ...(request.from !== undefined ? {from: request.from} : {}),
      ...(request.to !== undefined ? {to: request.to} : {}),
      ...(request.kinds ? {kinds: request.kinds} : {}),
    });
    const after = request.after
      ? all.filter(
          event =>
            event.occurredAt < request.after!.occurredAt ||
            (event.occurredAt === request.after!.occurredAt &&
              event.id.localeCompare(request.after!.eventId) < 0),
        )
      : all;
    const events = after.slice(0, request.pageSize);
    const last = events.at(-1);
    return {
      events,
      hasMore: after.length > request.pageSize,
      ...(last
        ? {endCursor: {occurredAt: last.occurredAt, eventId: last.id}}
        : {}),
    };
  }

  async fetchWindow(request: CareEventWindowRequest): Promise<readonly CareEvent[]> {
    return this.list({
      groupId: request.groupId,
      babyId: request.babyId,
      from: request.from,
      ...(request.to !== undefined ? {to: request.to} : {}),
      ...(request.kinds ? {kinds: request.kinds} : {}),
    });
  }

  observeWindow(
    request: CareEventWindowRequest,
    listener: (observation: CareEventWindowObservation) => void,
  ): () => void {
    return this.observeProjection(
      () => this.fetchWindow(request),
      events => ({kind: 'server_value' as const, events}),
      listener,
    );
  }

  async fetchLatest(request: LatestCareEventRequest): Promise<CareEvent | undefined> {
    return (
      await this.list({
        groupId: request.groupId,
        babyId: request.babyId,
        kinds: [request.kind],
        limit: 1,
      })
    )[0];
  }

  observeLatest(
    request: LatestCareEventRequest,
    listener: (observation: LatestCareEventObservation) => void,
  ): () => void {
    return this.observeProjection(
      () => this.fetchLatest(request),
      event => ({kind: 'server_value' as const, ...(event ? {event} : {})}),
      listener,
    );
  }

  async fetchActiveSleep(scope: CareEventProjectionScope): Promise<SleepEvent | undefined> {
    const events = await this.list({
      groupId: scope.groupId,
      babyId: scope.babyId,
      kinds: ['sleep'],
    });
    return events.find(
      (event): event is SleepEvent =>
        event.kind === 'sleep' &&
        event.endedAt === undefined &&
        event.deletedAt === undefined,
    );
  }

  observeActiveSleep(
    scope: CareEventProjectionScope,
    listener: (observation: ActiveSleepObservation) => void,
  ): () => void {
    return this.observeProjection(
      () => this.fetchActiveSleep(scope),
      event => ({kind: 'server_value' as const, ...(event ? {event} : {})}),
      listener,
    );
  }

  private observeProjection<T, O>(
    load: () => Promise<T>,
    success: (value: T) => O,
    listener: (observation: O | {readonly kind: 'error'; readonly error: ReturnType<typeof remoteFailure>['remoteError']}) => void,
  ): () => void {
    let active = true;
    let running = false;
    const poll = async () => {
      if (!active || running) return;
      running = true;
      try {
        listener(success(await load()));
      } catch (error) {
        listener({kind: 'error', error: remoteFailure(error).remoteError});
      } finally {
        running = false;
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), 15_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }

  observe(
    query: CareEventQuery,
    listener: (observation: CareEventRemoteObservation) => void,
  ): () => void {
    let active = true;
    let running = false;
    const poll = async () => {
      if (!active || running) {
        return;
      }
      running = true;
      try {
        listener({kind: 'server_snapshot', events: await this.list(query)});
      } catch (error) {
        const failure = remoteFailure(error).remoteError;
        listener({kind: 'error', error: failure});
      } finally {
        running = false;
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), 15_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }

  observePage(
    request: CareEventPageRequest,
    listener: (observation: CareEventRemotePageObservation) => void,
  ): () => void {
    let active = true;
    let running = false;
    const poll = async () => {
      if (!active || running) {
        return;
      }
      running = true;
      try {
        listener({kind: 'server_page', page: await this.fetchPage(request)});
      } catch (error) {
        listener({kind: 'error', error: remoteFailure(error).remoteError});
      } finally {
        running = false;
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), 15_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }
}

export async function reloadCareSession(
  ready: ReadyCareSession,
): Promise<ReadyCareSession> {
  const session = await accessSession();
  const latest = await readySession({...session, groupId: ready.group.id});
  if (!latest || latest.group.id !== ready.group.id) {
    throw new Error('돌봄 그룹을 다시 불러오지 못했어요.');
  }
  return latest;
}

export async function updateCareBaby(
  ready: ReadyCareSession,
  input: {readonly name: string; readonly birthDate: string},
): Promise<Baby> {
  const session = await accessSession();
  if (session.uid !== ready.uid) {
    throw new Error('현재 사용자를 다시 확인해 주세요.');
  }
  const updateBabyProfile = createUpdateBabyProfile({
    groups: {
      findMembership: async (group, member) => {
        const document = await getOptionalDocument(
          session,
          `groups/${group}/members/${member}`,
        );
        return document
          ? decodeMembership(fromFirestoreDocument(document))
          : undefined;
      },
    },
    babies: {
      findById: async (group, baby) => {
        const document = await getOptionalDocument(
          session,
          `groups/${group}/babies/${baby}`,
        );
        return document ? decodeBaby(fromFirestoreDocument(document)) : undefined;
      },
      updateProfile: async baby => {
        const query = new URLSearchParams();
        for (const field of ['name', 'birthDate', 'updatedAt']) {
          query.append('updateMask.fieldPaths', field);
        }
        await firestoreRequest(
          session,
          `/groups/${baby.groupId}/babies/${baby.id}?${query.toString()}`,
          {
            method: 'PATCH',
            body: JSON.stringify({
              fields: toFirestoreFields({
                name: baby.name,
                birthDate: baby.birthDate,
                updatedAt: baby.updatedAt,
              }),
            }),
          },
        );
      },
    },
    clock: {now: () => Date.now()},
  });
  return updateBabyProfile({
    groupId: ready.group.id,
    babyId: ready.baby.id,
    actorId: userId(session.uid),
    ...input,
  });
}

export async function removeCareMember(
  ready: ReadyCareSession,
  target: {readonly userId: string},
): Promise<void> {
  const session = await accessSession();
  if (session.uid !== ready.uid) {
    throw new Error('현재 사용자를 다시 확인해 주세요.');
  }
  // 권한 판정은 product-core use case(canPerformGroupAction)가 담당하고,
  // 이 함수는 Firestore REST 어댑터만 제공한다.
  const removeGroupMember = createRemoveGroupMember({
    findMembership: async (group, member) => {
      const document = await getOptionalDocument(
        session,
        `groups/${group}/members/${member}`,
      );
      return document
        ? decodeMembership(fromFirestoreDocument(document))
        : undefined;
    },
    removeMembership: async (group, member) => {
      const response = await firestoreRawRequest(
        session,
        `/groups/${group}/members/${member}`,
        {method: 'DELETE'},
      );
      await jsonResponse(response);
    },
  });
  await removeGroupMember({
    groupId: ready.group.id,
    actorId: userId(session.uid),
    targetId: userId(target.userId),
  });
}

export async function deleteCareAccount(ready: ReadyCareSession): Promise<void> {
  const session = await accessSession();
  if (session.uid !== ready.uid) {
    throw new Error('현재 사용자를 다시 확인해 주세요.');
  }
  const appCheckToken = await currentAitAppCheckToken();
  const platformResponse = await fetch(`${PLATFORM_URL}/v1/auth/firebase-account`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      'X-Seori-App': 'babycare',
      'X-Firebase-AppCheck': appCheckToken,
    },
    body: JSON.stringify({
      appId: 'babycare',
      firebaseIdToken: session.idToken,
    }),
  });
  await jsonResponse(platformResponse);
  await callFunction(session, 'deleteAccount', {confirmation: 'DELETE'});
  await Storage.removeItem(SESSION_KEY);
}
