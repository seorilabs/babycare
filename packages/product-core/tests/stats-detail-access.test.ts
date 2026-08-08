import assert from 'node:assert/strict';
import test from 'node:test';

import {
  STATS_DETAIL_UNLOCK_DURATION_MS,
  STATS_DETAIL_UNLOCK_STORAGE_KEY,
  statsDetailUnlockedUntil,
  unlockStatsDetail,
  type StringStoragePort,
} from '../src/index.ts';

class MemoryStorage implements StringStoragePort {
  readonly values = new Map<string, string>();

  async getItem(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }

  async removeItem(key: string): Promise<void> {
    this.values.delete(key);
  }
}

test('reward completion unlocks stats detail for 24 hours', async () => {
  const storage = new MemoryStorage();
  const now = 1_000;

  const expiry = await unlockStatsDetail(storage, now);

  assert.equal(expiry, now + STATS_DETAIL_UNLOCK_DURATION_MS);
  assert.equal(await statsDetailUnlockedUntil(storage, now), expiry);
});

test('expired unlock is removed and does not grant access', async () => {
  const storage = new MemoryStorage();
  storage.values.set(STATS_DETAIL_UNLOCK_STORAGE_KEY, '999');

  assert.equal(await statsDetailUnlockedUntil(storage, 1_000), undefined);
  assert.equal(storage.values.has(STATS_DETAIL_UNLOCK_STORAGE_KEY), false);
});

test('invalid persisted values fail closed', async () => {
  const storage = new MemoryStorage();
  storage.values.set(STATS_DETAIL_UNLOCK_STORAGE_KEY, 'not-a-number');

  assert.equal(await statsDetailUnlockedUntil(storage, 1_000), undefined);
});
