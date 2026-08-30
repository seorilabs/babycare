import type {StringStoragePort} from '../ports/string-storage.ts';

export const STATS_DETAIL_UNLOCK_DURATION_MS = 24 * 60 * 60 * 1_000;
export const STATS_DETAIL_UNLOCK_STORAGE_KEY =
  'babycare/stats-detail/unlocked-until/v1';

interface StatsDetailAccessRecord {
  readonly unlockedAt: number;
  readonly expiresAt: number;
}

function validAccessRecord(
  raw: string | null,
  now: number,
): StatsDetailAccessRecord | undefined {
  if (!raw) {
    return undefined;
  }
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  if (
    !Number.isSafeInteger(record.unlockedAt) ||
    !Number.isSafeInteger(record.expiresAt)
  ) {
    return undefined;
  }
  const unlockedAt = Number(record.unlockedAt);
  const expiresAt = Number(record.expiresAt);
  if (
    unlockedAt <= 0 ||
    expiresAt - unlockedAt !== STATS_DETAIL_UNLOCK_DURATION_MS ||
    now < unlockedAt ||
    expiresAt > now + STATS_DETAIL_UNLOCK_DURATION_MS
  ) {
    return undefined;
  }
  return {unlockedAt, expiresAt};
}

export async function statsDetailUnlockedUntil(
  storage: StringStoragePort,
  now: number,
): Promise<number | undefined> {
  const raw = await storage.getItem(STATS_DETAIL_UNLOCK_STORAGE_KEY);
  const record = validAccessRecord(raw, now);
  if (record === undefined || record.expiresAt <= now) {
    if (raw !== null) {
      await storage.removeItem(STATS_DETAIL_UNLOCK_STORAGE_KEY);
    }
    return undefined;
  }
  return record.expiresAt;
}

export async function unlockStatsDetail(
  storage: StringStoragePort,
  now: number,
): Promise<number> {
  if (!Number.isSafeInteger(now) || now <= 0) {
    throw new Error('Stats detail unlock time must be a valid timestamp');
  }
  const expiry = now + STATS_DETAIL_UNLOCK_DURATION_MS;
  if (!Number.isSafeInteger(expiry)) {
    throw new Error('Stats detail unlock expiry is outside the safe range');
  }
  await storage.setItem(
    STATS_DETAIL_UNLOCK_STORAGE_KEY,
    JSON.stringify({unlockedAt: now, expiresAt: expiry}),
  );
  return expiry;
}
