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

export class LocalSessionHydrationError extends Error {
  constructor(reason: 'invalid-json' | 'invalid-schema') {
    super(
      reason === 'invalid-json'
        ? 'Saved local session is not valid JSON'
        : 'Saved local session does not match the current schema',
    );
    this.name = 'LocalSessionHydrationError';
  }
}

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
    if (!isSession(value)) {
      await discardInvalidSession();
      throw new LocalSessionHydrationError('invalid-schema');
    }
    return value;
  }

  async save(session: LocalSession): Promise<void> {
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }

  async clear(): Promise<void> {
    await AsyncStorage.removeItem(SESSION_KEY);
  }
}
