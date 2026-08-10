import {Storage} from '@apps-in-toss/framework';
import {type Baby} from '../../../../packages/product-core/src/domain/baby.ts';
import {
  createCareEvent,
  type CareEvent,
  type MedicationActiveIngredient,
  type MedicationCategory,
  type MedicationDoseUnit,
  type TemperatureMeasurementSite,
} from '../../../../packages/product-core/src/domain/care-event.ts';
import {
  type CareGroup,
  type Membership,
} from '../../../../packages/product-core/src/domain/care-group.ts';
import {
  babyId,
  eventId,
  groupId,
  userId,
} from '../../../../packages/product-core/src/domain/ids.ts';
import {buildDashboardSummary} from '../../../../packages/product-core/src/use_cases/dashboard.ts';
import {
  careEventMutationId,
  careEventPayloadHash,
} from '../../../../packages/product-data/src/care-event-revision.ts';

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
}

interface AccessSession extends StoredSession {
  readonly idToken: string;
}

export interface ReadyCareSession {
  readonly uid: string;
  readonly group: CareGroup;
  readonly baby: Baby;
  readonly membership: Membership;
  readonly events: readonly CareEvent[];
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '알 수 없는 오류';
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
    const error = body.error;
    const message =
      error && typeof error === 'object' && 'message' in error
        ? String(error.message)
        : '서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.';
    throw new Error(message);
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
  };
  if (session.uid !== stored.uid) {
    throw new Error('저장된 사용자와 인증 사용자가 일치하지 않아요.');
  }
  await saveStoredSession(session);
  return session;
}

async function createAccessSession(): Promise<AccessSession> {
  const platformResponse = await fetch(
    `${PLATFORM_URL}/v1/auth/firebase-custom-token`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Seori-App': 'babycare',
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

async function firestoreRequest(
  session: AccessSession,
  path: string,
  init: RequestInit = {},
): Promise<unknown> {
  const response = await fetch(`${FIRESTORE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${session.idToken}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });
  return jsonResponse(response);
}

async function getDocument(
  session: AccessSession,
  path: string,
): Promise<FirestoreDocument> {
  return (await firestoreRequest(session, `/${path}`)) as FirestoreDocument;
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

async function loadEvents(
  session: AccessSession,
  group: CareGroup,
  baby: Baby,
): Promise<readonly CareEvent[]> {
  const body = record(
    await firestoreRequest(
    session,
    `/groups/${group.id}/events?pageSize=100&orderBy=occurredAt%20desc`,
    ),
    '돌봄 기록',
  );
  const documents = Array.isArray(body.documents)
    ? (body.documents as FirestoreDocument[])
    : [];
  return documents
    .map(document => decodeEvent(fromFirestoreDocument(document)))
    .filter(event => event.babyId === baby.id && event.deletedAt === undefined);
}

async function readySession(
  session: AccessSession,
): Promise<ReadyCareSession | undefined> {
  const foundGroupId = session.groupId ?? (await discoverGroupId(session));
  if (!foundGroupId) {
    return undefined;
  }
  if (foundGroupId !== session.groupId) {
    await saveStoredSession({...session, groupId: foundGroupId});
  }
  const groupDocument = await getDocument(session, `groups/${foundGroupId}`);
  const group = decodeGroup(fromFirestoreDocument(groupDocument));
  const [membershipDocument, babyDocument] = await Promise.all([
    getDocument(session, `groups/${group.id}/members/${session.uid}`),
    getDocument(session, `groups/${group.id}/babies/${group.babyIds[0]}`),
  ]);
  const membership = decodeMembership(
    fromFirestoreDocument(membershipDocument),
  );
  const baby = decodeBaby(fromFirestoreDocument(babyDocument));
  const events = await loadEvents(session, group, baby);
  return {uid: session.uid, group, baby, membership, events};
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
  await saveStoredSession({...session, groupId: group.id});
  return {uid: session.uid, group, baby, membership, events: []};
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
  const response = await fetch(`${FUNCTIONS_URL}/${name}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.idToken}`,
      'Content-Type': 'application/json',
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
): Promise<string> {
  const session = await accessSession();
  if (session.uid !== ready.uid) {
    throw new Error('현재 사용자를 다시 확인해 주세요.');
  }
  const result = await callFunction(session, 'createInvite', {
    groupId: ready.group.id,
  });
  return text(result.code, '초대 코드');
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

async function commitNewEvent(
  session: AccessSession,
  event: CareEvent,
): Promise<void> {
  const payloadHash = careEventPayloadHash(event);
  const mutationId = careEventMutationId(event);
  const payload = encodedEvent(event);
  const root = `${FIRESTORE_DOCUMENT_ROOT}/groups/${event.groupId}`;
  const writes: Record<string, unknown>[] = [
    {
      update: {
        name: `${root}/events/${event.id}`,
        fields: toFirestoreFields(payload),
      },
      currentDocument: {exists: false},
    },
  ];
  if (event.kind === 'sleep' && event.endedAt === undefined) {
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
  }
  writes.push({
    update: {
      name: `${root}/eventMutationReceipts/${mutationId}`,
      fields: toFirestoreFields({
        id: mutationId,
        groupId: event.groupId,
        babyId: event.babyId,
        eventId: event.id,
        revision: event.revision,
        payloadHash,
        kind: 'create',
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
}

async function endActiveSleep(
  session: AccessSession,
  event: CareEvent & {readonly kind: 'sleep'},
): Promise<CareEvent> {
  let source: FirestoreDocument;
  try {
    source = await getDocument(
      session,
      `groups/${event.groupId}/events/${event.id}`,
    );
  } catch (error) {
    throw new Error(`수면 기록을 다시 확인하지 못했어요: ${errorMessage(error)}`);
  }
  const endedAt = Math.max(Date.now(), event.startedAt + 1);
  const updated: CareEvent = {
    ...event,
    endedAt,
    updatedAt: endedAt,
    revision: event.revision + 1,
  };
  const payloadHash = careEventPayloadHash(updated);
  const mutationId = careEventMutationId(updated);
  const payload = encodedEvent(updated);
  const root = `${FIRESTORE_DOCUMENT_ROOT}/groups/${event.groupId}`;
  try {
    await firestoreRequest(session, ':commit', {
      method: 'POST',
      body: JSON.stringify({
        writes: [
        {
          update: {
            name: `${root}/events/${event.id}`,
            fields: toFirestoreFields(payload),
          },
          currentDocument: {updateTime: source.updateTime},
        },
        {
          delete: `${root}/activeSleeps/${event.babyId}`,
          currentDocument: {exists: true},
        },
        {
          update: {
            name: `${root}/eventMutationReceipts/${mutationId}`,
            fields: toFirestoreFields({
              id: mutationId,
              groupId: event.groupId,
              babyId: event.babyId,
              eventId: event.id,
              revision: updated.revision,
              payloadHash,
              kind: 'end_sleep',
              actorUid: session.uid,
              payload,
            }),
          },
          updateTransforms: [
            {fieldPath: 'appliedAt', setToServerValue: 'REQUEST_TIME'},
          ],
          currentDocument: {exists: false},
        },
        ],
      }),
    });
  } catch (error) {
    throw new Error(`수면 종료를 저장하지 못했어요: ${errorMessage(error)}`);
  }
  return updated;
}

export type AitCareRecordInput =
  | 'feeding'
  | 'diaper'
  | 'sleep'
  | {
      readonly kind: 'temperature';
      readonly temperatureCelsius: number;
      readonly measurementSite: TemperatureMeasurementSite;
    }
  | {
      readonly kind: 'medication';
      readonly medicationName: string;
      readonly medicationCategory: MedicationCategory;
      readonly activeIngredient: MedicationActiveIngredient;
      readonly doseAmount: number;
      readonly doseUnit: MedicationDoseUnit;
      readonly minimumIntervalMinutes: number;
    };

export async function recordQuickCareEvent(
  ready: ReadyCareSession,
  input: AitCareRecordInput,
): Promise<ReadyCareSession> {
  const session = await accessSession();
  const kind = typeof input === 'string' ? input : input.kind;
  const activeSleep = ready.events.find(
    (event): event is CareEvent & {readonly kind: 'sleep'} =>
      event.kind === 'sleep' && event.endedAt === undefined,
  );
  if (kind === 'sleep' && activeSleep) {
    const updated = await endActiveSleep(session, activeSleep);
    return {
      ...ready,
      events: ready.events.map(event =>
        event.id === updated.id ? updated : event,
      ),
    };
  }

  const now = Date.now();
  const id = eventId(randomId('event'));
  const common = {
    groupId: ready.group.id,
    babyId: ready.baby.id,
    caregiverId: userId(ready.uid),
  };
  let event: CareEvent;
  if (input === 'feeding') {
    event = createCareEvent(
      {
        ...common,
        kind: 'feeding',
        feedingType: 'formula',
        volumeMl: 120,
        occurredAt: now,
      },
      {id, now},
    );
  } else if (input === 'diaper') {
    event = createCareEvent(
      {...common, kind: 'diaper', diaperType: 'wet', occurredAt: now},
      {id, now},
    );
  } else if (input === 'sleep') {
    event = createCareEvent(
      {...common, kind: 'sleep', sleepType: 'nap', startedAt: now},
      {id, now},
    );
  } else if (input.kind === 'temperature') {
    event = createCareEvent(
      {
        ...common,
        ...input,
        occurredAt: now,
      },
      {id, now},
    );
  } else {
    event = createCareEvent(
      {
        ...common,
        ...input,
        occurredAt: now,
      },
      {id, now},
    );
  }
  await commitNewEvent(session, event);
  return {...ready, events: [event, ...ready.events]};
}

export async function reloadCareSession(
  ready: ReadyCareSession,
): Promise<ReadyCareSession> {
  const session = await accessSession();
  const events = await loadEvents(session, ready.group, ready.baby);
  return {...ready, events};
}

export function todaySummary(ready: ReadyCareSession) {
  const now = Date.now();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return buildDashboardSummary(
    ready.events,
    {from: start.getTime(), to: start.getTime() + 24 * 60 * 60 * 1_000},
    now,
  );
}

export async function deleteCareAccount(ready: ReadyCareSession): Promise<void> {
  const session = await accessSession();
  if (session.uid !== ready.uid) {
    throw new Error('현재 사용자를 다시 확인해 주세요.');
  }
  const platformResponse = await fetch(`${PLATFORM_URL}/v1/auth/firebase-account`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      'X-Seori-App': 'babycare',
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
