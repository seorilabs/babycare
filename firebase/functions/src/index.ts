import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import {
  defineBoolean,
  defineInt,
  defineSecret,
  defineString,
} from 'firebase-functions/params';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

import { FirestoreInviteRepository } from './firestore-invite-repository.js';
import { AccountDeletionError } from './account-deletion-error.js';
import {
  AccountDeletionService,
  requireDeletionConfirmation,
} from './account-deletion-service.js';
import { FirebaseGroupStorageDeletionRepository } from './firebase-group-storage-deletion-repository.js';
import { FirestoreAccountDeletionRepository } from './firestore-account-deletion-repository.js';
import { toInviteHttpsError } from './https-error.js';
import { InviteService } from './invite-service.js';
import { InviteServiceError } from './invite-error.js';
import { requireAuthenticatedUid } from './validation.js';
import {
  parseAnalyticsClientId,
  parseAnalyticsEvents,
  relayAnalyticsToGa4,
} from './analytics-service.js';

const FUNCTIONS_REGION = defineString('FUNCTIONS_REGION', {
  description: '확정 필요: Firebase Functions deployment region',
});
const INVITE_CODE_HMAC_KEY = defineSecret('INVITE_CODE_HMAC_KEY');
const GA4_API_SECRET = defineSecret('GA4_API_SECRET');
const GA4_MEASUREMENT_ID = defineString('GA4_MEASUREMENT_ID', {
  description: 'Babycare GA4 web stream measurement ID for AppsInToss relay',
});
const INVITE_TTL_HOURS = defineInt('INVITE_TTL_HOURS', {
  default: 24,
  description: 'Invite validity duration in hours',
});
const INVITE_CREATE_LIMIT_PER_HOUR = defineInt(
  'INVITE_CREATE_LIMIT_PER_HOUR',
  { default: 10, description: 'Per-uid invite creation limit per hour' },
);
const INVITE_ACCEPT_LIMIT_PER_HOUR = defineInt(
  'INVITE_ACCEPT_LIMIT_PER_HOUR',
  { default: 20, description: 'Per-uid invite acceptance attempts per hour' },
);
const ENFORCE_APP_CHECK = defineBoolean('ENFORCE_APP_CHECK', {
  default: false,
  description: '출시 전 AppsInToss 호환 검증 후 true 확정 필요',
});

const app = getApps()[0] ?? initializeApp();
const firestore = getFirestore(app);

function buildInviteService(): InviteService {
  return new InviteService({
    repository: new FirestoreInviteRepository(firestore),
    clock: { now: Date.now },
    config: {
      hmacSecret: INVITE_CODE_HMAC_KEY.value(),
      inviteTtlMs: INVITE_TTL_HOURS.value() * 60 * 60 * 1_000,
      rateLimitWindowMs: 60 * 60 * 1_000,
      createLimitPerWindow: INVITE_CREATE_LIMIT_PER_HOUR.value(),
      acceptLimitPerWindow: INVITE_ACCEPT_LIMIT_PER_HOUR.value(),
    },
  });
}

function buildAccountDeletionService(): AccountDeletionService {
  return new AccountDeletionService(
    new FirestoreAccountDeletionRepository(
      firestore,
      new FirebaseGroupStorageDeletionRepository(getStorage(app).bucket()),
    ),
    getAuth(app),
  );
}

function requestData(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new HttpsError('invalid-argument', 'Request data must be an object');
  }
  return value as Record<string, unknown>;
}

const callableOptions = {
  region: FUNCTIONS_REGION,
  secrets: [INVITE_CODE_HMAC_KEY],
  enforceAppCheck: ENFORCE_APP_CHECK,
  timeoutSeconds: 30,
  memory: '256MiB' as const,
};

const analyticsCallableOptions = {
  region: FUNCTIONS_REGION,
  secrets: [GA4_API_SECRET],
  enforceAppCheck: ENFORCE_APP_CHECK,
  timeoutSeconds: 15,
  memory: '256MiB' as const,
};

export const logAnalyticsEvents = onCall(
  analyticsCallableOptions,
  async request => {
    const uid = requireAuthenticatedUid(request.auth?.uid);
    const data = requestData(request.data);
    let clientId: string;
    let events;
    try {
      clientId = parseAnalyticsClientId(data.clientId);
      events = parseAnalyticsEvents(data.events);
    } catch (error) {
      throw new HttpsError(
        'invalid-argument',
        error instanceof Error ? error.message : 'Invalid analytics payload',
      );
    }
    const measurementId = GA4_MEASUREMENT_ID.value().trim();
    const apiSecret = GA4_API_SECRET.value().trim();
    if (!measurementId || !apiSecret) {
      throw new HttpsError(
        'failed-precondition',
        'GA4 relay is not configured',
      );
    }
    try {
      await relayAnalyticsToGa4({
        measurementId,
        apiSecret,
        clientId,
        userId: uid,
        events,
      });
      return {accepted: events.length};
    } catch {
      throw new HttpsError('unavailable', 'GA4 relay is unavailable');
    }
  },
);

export const createInvite = onCall(callableOptions, async (request) => {
  try {
    const uid = requireAuthenticatedUid(request.auth?.uid);
    const data = requestData(request.data);
    return await buildInviteService().createInvite({
      groupId: data.groupId,
      requestedByUid: uid,
    });
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error;
    }
    throw toInviteHttpsError(error, 'create');
  }
});

export const acceptInvite = onCall(callableOptions, async (request) => {
  try {
    const uid = requireAuthenticatedUid(request.auth?.uid);
    const data = requestData(request.data);
    return await buildInviteService().acceptInvite({
      code: data.code,
      acceptedByUid: uid,
      displayName: data.displayName,
      caregiverRole: data.caregiverRole,
      color: data.color,
    });
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error;
    }
    throw toInviteHttpsError(error, 'accept');
  }
});

export const deleteAccount = onCall(callableOptions, async (request) => {
  try {
    const uid = requireAuthenticatedUid(request.auth?.uid);
    const data = requestData(request.data);
    requireDeletionConfirmation(data.confirmation);
    return await buildAccountDeletionService().deleteAccount({
      uid,
      confirmation: data.confirmation,
    });
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error;
    }
    if (error instanceof AccountDeletionError) {
      throw new HttpsError(error.code, error.message);
    }
    if (error instanceof InviteServiceError && error.code === 'unauthenticated') {
      throw new HttpsError('unauthenticated', 'Authentication is required');
    }
    throw new HttpsError('internal', 'Account deletion failed');
  }
});
