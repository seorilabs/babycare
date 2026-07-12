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

function isSession(value: unknown): value is LocalSession {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.groupId !== 'string' ||
    typeof candidate.babyId !== 'string' ||
    typeof candidate.caregiverId !== 'string' ||
    typeof candidate.caregiverName !== 'string' ||
    typeof candidate.babyName !== 'string' ||
    typeof candidate.birthDate !== 'string' ||
    typeof candidate.inviteCode !== 'string'
  ) {
    return false;
  }

  try {
    return (
      groupId(candidate.groupId) === candidate.groupId &&
      babyId(candidate.babyId) === candidate.babyId &&
      userId(candidate.caregiverId) === candidate.caregiverId &&
      normalizeDisplayName(candidate.caregiverName, 'Caregiver name') ===
        candidate.caregiverName &&
      normalizeDisplayName(candidate.babyName, 'Baby name') === candidate.babyName &&
      isValidBirthDate(candidate.birthDate) &&
      inviteCode(candidate.inviteCode) === candidate.inviteCode
    );
  } catch {
    return false;
  }
}

export class LocalSessionRepository {
  async load(): Promise<LocalSession | undefined> {
    const raw = await AsyncStorage.getItem(SESSION_KEY);
    if (!raw) {
      return undefined;
    }
    try {
      const value: unknown = JSON.parse(raw);
      return isSession(value) ? value : undefined;
    } catch {
      return undefined;
    }
  }

  async save(session: LocalSession): Promise<void> {
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }

  async clear(): Promise<void> {
    await AsyncStorage.removeItem(SESSION_KEY);
  }
}
