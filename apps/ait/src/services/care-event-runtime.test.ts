const mockStored = new Map<string, string>();

jest.mock('@apps-in-toss/framework', () => ({
  Storage: {
    getItem: jest.fn(async (key: string) => mockStored.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      mockStored.set(key, value);
    }),
    removeItem: jest.fn(async (key: string) => {
      mockStored.delete(key);
    }),
  },
}));

jest.mock('./analytics', () => ({
  babycareAnalytics: { track: jest.fn(async () => undefined) },
}));

jest.mock('./babycare-backend', () => ({
  AitFirestoreCareEventRemoteStore: class {
    async push() {
      throw {
        remoteError: {
          code: 'retryable',
          cause: new Error('offline'),
        },
      };
    }

    async findById() {
      return undefined;
    }

    async fetchPage() {
      return { events: [], hasMore: false };
    }

    async fetchWindow() {
      return [];
    }

    observeWindow(_request: unknown, listener: (value: unknown) => void) {
      listener({ kind: 'server_value', events: [] });
      return () => undefined;
    }

    async fetchLatest() {
      return undefined;
    }

    observeLatest(_request: unknown, listener: (value: unknown) => void) {
      listener({ kind: 'server_value' });
      return () => undefined;
    }

    async fetchActiveSleep() {
      return undefined;
    }

    observeActiveSleep(_request: unknown, listener: (value: unknown) => void) {
      listener({ kind: 'server_value' });
      return () => undefined;
    }

    observePage() {
      return () => undefined;
    }

    async list() {
      return [];
    }

    observe(_query: unknown, listener: (value: unknown) => void) {
      listener({ kind: 'server_snapshot', events: [] });
      return () => undefined;
    }
  },
}));

import {
  babyId,
  groupId,
  userId,
  type Baby,
  type CareGroup,
  type Membership,
} from '../../../../packages/product-core/src/index.ts';
import { createStrings } from '@babycare/product-ui';
import { createAitCareEventRuntime } from './care-event-runtime';

describe('AppsInToss local-first care event runtime', () => {
  beforeEach(() => {
    mockStored.clear();
  });

  it('keeps a record locally and returns before an offline remote retry', async () => {
    const now = Date.now();
    const group: CareGroup = {
      id: groupId('group-runtime'),
      name: '지안',
      ownerId: userId('user-runtime'),
      babyIds: [babyId('baby-runtime')],
      createdAt: now,
      updatedAt: now,
    };
    const baby: Baby = {
      id: babyId('baby-runtime'),
      groupId: group.id,
      name: '지안',
      birthDate: '2026-08-01',
      sex: 'unspecified',
      createdAt: now,
      updatedAt: now,
    };
    const membership: Membership = {
      userId: userId('user-runtime'),
      groupId: group.id,
      caregiverRole: 'parent',
      membershipRole: 'owner',
      displayName: '엄마',
      color: '#5FB49C',
      joinedAt: now,
    };
    const runtime = await createAitCareEventRuntime(
      {
        uid: membership.userId,
        group,
        baby,
        membership,
        memberships: [membership],
        events: [],
      },
      jest.fn(),
      createStrings('ko')
    );
    await runtime.record({
      groupId: group.id,
      babyId: baby.id,
      caregiverId: membership.userId,
      kind: 'feeding',
      feedingType: 'formula',
      volumeMl: 120,
      occurredAt: now,
      note: '오프라인 기록',
    });
    await runtime.syncNow();
    expect([...mockStored.keys()].some((key) => key.includes('care-event-sync'))).toBe(true);
    expect([...mockStored.values()].join(' ')).toContain('오프라인 기록');

    await runtime.close();
  });
});
