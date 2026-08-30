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

function record(unlockedAt: number, expiresAt: number): string {
  return JSON.stringify({unlockedAt, expiresAt});
}

test('reward completion unlocks stats detail for exactly 24 hours', async () => {
  const storage = new MemoryStorage();
  const now = 1_000;
  const expiry = await unlockStatsDetail(storage, now);
  assert.equal(expiry, now + STATS_DETAIL_UNLOCK_DURATION_MS);
  assert.equal(storage.values.get(STATS_DETAIL_UNLOCK_STORAGE_KEY), record(now, expiry));
  assert.equal(await statsDetailUnlockedUntil(storage, now), expiry);
});

for (const [name, raw, now] of [
  ['expired record', record(1_000, 1_000 + STATS_DETAIL_UNLOCK_DURATION_MS), 1_000 + STATS_DETAIL_UNLOCK_DURATION_MS],
  ['clock rollback', record(2_000, 2_000 + STATS_DETAIL_UNLOCK_DURATION_MS), 1_999],
  ['future expiry extension', record(1_000, 1_000 + STATS_DETAIL_UNLOCK_DURATION_MS + 1), 1_000],
  ['legacy numeric value', '123456', 1_000],
  ['corrupt value', 'not-json', 1_000],
] as const) {
  test(`${name} fails closed and removes persisted state`, async () => {
    const storage = new MemoryStorage();
    storage.values.set(STATS_DETAIL_UNLOCK_STORAGE_KEY, raw);
    assert.equal(await statsDetailUnlockedUntil(storage, now), undefined);
    assert.equal(storage.values.has(STATS_DETAIL_UNLOCK_STORAGE_KEY), false);
  });
}
