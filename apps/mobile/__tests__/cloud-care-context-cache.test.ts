import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  babyId,
  groupId,
  userId,
  type StringStoragePort,
} from '@babycare/product-core';

import {
  CLOUD_CARE_CONTEXT_KEY,
  CloudCareContextCache,
  CloudCareContextHydrationError,
  CloudCareContextSessionStore,
  type CloudCareContextSnapshot,
} from '../src/adapters/local/cloud-care-context-cache';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

class MemoryStringStorage implements StringStoragePort {
  readonly values = new Map<string, string>();
  readonly removed: string[] = [];

  async getItem(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }

  async removeItem(key: string): Promise<void> {
    this.removed.push(key);
    this.values.delete(key);
  }
}

class DeferredSetStorage extends MemoryStringStorage {
  readonly setStarted: Promise<void>;
  readonly releaseSet: Promise<void>;
  resolveSetStarted!: () => void;
  resolveReleaseSet!: () => void;

  constructor() {
    super();
    this.setStarted = new Promise(resolve => {
      this.resolveSetStarted = resolve;
    });
    this.releaseSet = new Promise(resolve => {
      this.resolveReleaseSet = resolve;
    });
  }

  override async setItem(key: string, value: string): Promise<void> {
    this.resolveSetStarted();
    await this.releaseSet;
    await super.setItem(key, value);
  }
}

const ownerId = userId('owner-1');
const memberId = userId('member-1');
const selectedGroupId = groupId('group-1');
const selectedBabyId = babyId('baby-1');
const createdAt = 2_000_000_000_000;

const ownerMembership = {
  userId: ownerId,
  groupId: selectedGroupId,
  caregiverRole: 'parent' as const,
  membershipRole: 'owner' as const,
  displayName: '엄마',
  color: '#5FB49C',
  joinedAt: createdAt,
};
const memberMembership = {
  userId: memberId,
  groupId: selectedGroupId,
  caregiverRole: 'grandparent' as const,
  membershipRole: 'member' as const,
  displayName: '할머니',
  color: '#8A77CC',
  joinedAt: createdAt + 1,
};

const snapshot: CloudCareContextSnapshot = {
  context: {
    identity: {
      userId: memberId,
      displayName: '양육자',
      isAnonymous: true,
    },
    membership: memberMembership,
    group: {
      id: selectedGroupId,
      name: '하루',
      ownerId,
      babyIds: [selectedBabyId],
      createdAt,
      updatedAt: createdAt,
    },
    baby: {
      id: selectedBabyId,
      groupId: selectedGroupId,
      name: '하루',
      birthDate: '2026-01-01',
      sex: 'unspecified',
      createdAt,
      updatedAt: createdAt,
    },
  },
  memberships: [ownerMembership, memberMembership],
};

async function persistedEnvelope(storage: MemoryStringStorage) {
  await new CloudCareContextCache(storage).save(snapshot);
  return JSON.parse(storage.values.get(CLOUD_CARE_CONTEXT_KEY)!);
}

describe('CloudCareContextCache', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('round-trips an authenticated context and its membership directory', async () => {
    const storage = new MemoryStringStorage();
    const cache = new CloudCareContextCache(storage);

    await cache.save(snapshot);

    await expect(cache.load(memberId)).resolves.toEqual(snapshot);
    expect(
      JSON.parse(storage.values.get(CLOUD_CARE_CONTEXT_KEY)!),
    ).toMatchObject({
      version: 1,
    });
  });

  it('uses AsyncStorage by default while accepting an injected StringStoragePort', async () => {
    const cache = new CloudCareContextCache();

    await cache.save(snapshot);

    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      CLOUD_CARE_CONTEXT_KEY,
      expect.any(String),
    );
  });

  it('serializes an allowlist and never persists a raw invite code', async () => {
    const storage = new MemoryStringStorage();
    const unsafeSnapshot = {
      ...snapshot,
      inviteCode: 'AB23CD',
      context: { ...snapshot.context, inviteCode: 'AB23CD' },
    } as CloudCareContextSnapshot;

    await new CloudCareContextCache(storage).save(unsafeSnapshot);

    const raw = storage.values.get(CLOUD_CARE_CONTEXT_KEY)!;
    expect(raw).not.toContain('inviteCode');
    expect(raw).not.toContain('AB23CD');
  });

  it('purges a context belonging to a different authenticated uid', async () => {
    const storage = new MemoryStringStorage();
    const cache = new CloudCareContextCache(storage);
    await cache.save(snapshot);

    await expect(cache.load(userId('member-2'))).resolves.toBeUndefined();
    expect(storage.values.has(CLOUD_CARE_CONTEXT_KEY)).toBe(false);
    expect(storage.removed).toEqual([CLOUD_CARE_CONTEXT_KEY]);
  });

  it.each([
    ['envelope', (value: any) => ({ ...value, unexpected: true })],
    [
      'context',
      (value: any) => ({
        ...value,
        context: { ...value.context, unexpected: true },
      }),
    ],
    [
      'identity',
      (value: any) => ({
        ...value,
        context: {
          ...value.context,
          identity: { ...value.context.identity, inviteCode: 'AB23CD' },
        },
      }),
    ],
    [
      'membership',
      (value: any) => ({
        ...value,
        memberships: [{ ...value.memberships[0], unexpected: true }],
      }),
    ],
  ])('purges and rejects an extra field in the %s', async (_label, mutate) => {
    const storage = new MemoryStringStorage();
    const envelope = mutate(await persistedEnvelope(storage));
    storage.values.set(CLOUD_CARE_CONTEXT_KEY, JSON.stringify(envelope));

    await expect(
      new CloudCareContextCache(storage).load(memberId),
    ).rejects.toBeInstanceOf(CloudCareContextHydrationError);
    expect(storage.values.has(CLOUD_CARE_CONTEXT_KEY)).toBe(false);
    expect(storage.removed).toEqual([CLOUD_CARE_CONTEXT_KEY]);
  });

  it('purges and rejects malformed JSON', async () => {
    const storage = new MemoryStringStorage();
    storage.values.set(CLOUD_CARE_CONTEXT_KEY, '{');

    await expect(
      new CloudCareContextCache(storage).load(memberId),
    ).rejects.toBeInstanceOf(CloudCareContextHydrationError);
    expect(storage.values.has(CLOUD_CARE_CONTEXT_KEY)).toBe(false);
    expect(storage.removed).toEqual([CLOUD_CARE_CONTEXT_KEY]);
  });

  it('purges a structurally valid cache whose selected membership disagrees', async () => {
    const storage = new MemoryStringStorage();
    const envelope = await persistedEnvelope(storage);
    envelope.context.membership.displayName = '다른 이름';
    storage.values.set(CLOUD_CARE_CONTEXT_KEY, JSON.stringify(envelope));

    await expect(
      new CloudCareContextCache(storage).load(memberId),
    ).rejects.toThrow(/현재 사용자의 멤버십/);
    expect(storage.values.has(CLOUD_CARE_CONTEXT_KEY)).toBe(false);
  });

  it('clears the versioned cache key', async () => {
    const storage = new MemoryStringStorage();
    const cache = new CloudCareContextCache(storage);
    await cache.save(snapshot);

    await cache.clear();

    expect(storage.values.has(CLOUD_CARE_CONTEXT_KEY)).toBe(false);
    expect(storage.removed).toEqual([CLOUD_CARE_CONTEXT_KEY]);
  });
});

describe('CloudCareContextSessionStore', () => {
  it('orders a revocation clear after an in-flight save', async () => {
    const storage = new DeferredSetStorage();
    const sessions = new CloudCareContextSessionStore(
      new CloudCareContextCache(storage),
    );
    const token = sessions.begin();
    const save = sessions.save(token, snapshot);
    await storage.setStarted;

    const clear = sessions.clear(token);
    storage.resolveReleaseSet();

    await expect(save).resolves.toBe(false);
    await expect(clear).resolves.toBe(true);
    expect(storage.values.has(CLOUD_CARE_CONTEXT_KEY)).toBe(false);
  });

  it('rejects late writes and stale clears from an invalidated session', async () => {
    const storage = new MemoryStringStorage();
    const sessions = new CloudCareContextSessionStore(
      new CloudCareContextCache(storage),
    );
    const stale = sessions.begin();
    const current = sessions.begin();

    await expect(sessions.clear(stale)).resolves.toBe(false);
    await expect(sessions.save(stale, snapshot)).resolves.toBe(false);
    await expect(sessions.save(current, snapshot)).resolves.toBe(true);
    expect(storage.values.has(CLOUD_CARE_CONTEXT_KEY)).toBe(true);
  });
});
