import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  babyId,
  groupId,
  inviteCode,
  normalizeDisplayName,
  userId,
} from '@babycare/product-core';

import {isValidBirthDate, type LocalSession} from '../../app/session';

const SESSION_KEY = '@babycare/session/v1';
const SESSION_FIELD_SET = {
  groupId: true,
  babyId: true,
  caregiverId: true,
  caregiverName: true,
  babyName: true,
  birthDate: true,
  inviteCode: true,
} as const satisfies Record<keyof LocalSession, true>;
const SESSION_FIELDS = Object.keys(SESSION_FIELD_SET);

export class LocalSessionHydrationError extends Error {
  constructor(reason: 'invalid-json' | 'invalid-schema', detail?: string) {
    const summary =
      reason === 'invalid-json'
        ? '저장된 로컬 정보가 손상되었습니다'
        : '저장된 로컬 정보가 현재 형식과 맞지 않습니다';
    super(detail ? `${summary}: ${detail}` : summary);
    this.name = 'LocalSessionHydrationError';
  }
}

function sessionText(
  data: Record<string, unknown>,
  key: keyof LocalSession,
  label: string,
): string {
  const value = data[key];
  if (typeof value !== 'string') {
    throw new Error(`${label} 값이 문자열이 아닙니다`);
  }
  return value;
}

function decodeSession(value: unknown): LocalSession {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('세션 값이 객체가 아닙니다');
  }
  const candidate = value as Record<string, unknown>;
  if (Object.keys(candidate).some(key => !SESSION_FIELDS.includes(key))) {
    throw new Error('세션에 알 수 없는 필드가 있습니다');
  }
  const group = sessionText(candidate, 'groupId', '그룹 식별자');
  const baby = sessionText(candidate, 'babyId', '아기 식별자');
  const caregiver = sessionText(candidate, 'caregiverId', '양육자 식별자');
  const caregiverName = sessionText(candidate, 'caregiverName', '양육자 이름');
  const babyName = sessionText(candidate, 'babyName', '아기 이름');
  const birthDate = sessionText(candidate, 'birthDate', '생년월일');
  const code = sessionText(candidate, 'inviteCode', '초대 코드');

  if (groupId(group) !== group || babyId(baby) !== baby || userId(caregiver) !== caregiver) {
    throw new Error('식별자가 canonical 형식이 아닙니다');
  }
  if (normalizeDisplayName(caregiverName, '양육자 이름') !== caregiverName) {
    throw new Error('양육자 이름이 canonical 형식이 아닙니다');
  }
  if (normalizeDisplayName(babyName, '아기 이름') !== babyName) {
    throw new Error('아기 이름이 canonical 형식이 아닙니다');
  }
  if (!isValidBirthDate(birthDate)) {
    throw new Error('생년월일이 실제 과거 ISO 날짜가 아닙니다');
  }
  if (inviteCode(code) !== code) {
    throw new Error('초대 코드가 canonical 형식이 아닙니다');
  }
  return {
    groupId: group,
    babyId: baby,
    caregiverId: caregiver,
    caregiverName,
    babyName,
    birthDate,
    inviteCode: code,
  };
}

async function discardInvalidSession(): Promise<void> {
  try {
    await AsyncStorage.removeItem(SESSION_KEY);
  } catch {
    // The original validation error remains the actionable recovery signal.
  }
}

export class LocalSessionRepository {
  async load(): Promise<LocalSession | undefined> {
    const raw = await AsyncStorage.getItem(SESSION_KEY);
    if (!raw) {
      return undefined;
    }
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      await discardInvalidSession();
      throw new LocalSessionHydrationError('invalid-json');
    }
    try {
      return decodeSession(value);
    } catch (error) {
      await discardInvalidSession();
      throw new LocalSessionHydrationError(
        'invalid-schema',
        error instanceof Error ? error.message : undefined,
      );
    }
  }

  async save(session: LocalSession): Promise<void> {
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }

  async clear(): Promise<void> {
    await AsyncStorage.removeItem(SESSION_KEY);
  }
}
