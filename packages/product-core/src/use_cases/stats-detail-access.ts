import type {StringStoragePort} from '../ports/string-storage.ts';

export const STATS_DETAIL_UNLOCK_DURATION_MS = 24 * 60 * 60 * 1_000;
export const STATS_DETAIL_UNLOCK_STORAGE_KEY =
  'babycare/stats-detail/unlocked-until/v1';

function validExpiry(raw: string | null): number | undefined {
  if (raw === null) {
    return undefined;
  }
  const value = Number(raw);
  return Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

export async function statsDetailUnlockedUntil(
  storage: StringStoragePort,
  now: number,
): Promise<number | undefined> {
  const expiry = validExpiry(
    await storage.getItem(STATS_DETAIL_UNLOCK_STORAGE_KEY),
  );
  if (expiry === undefined || expiry <= now) {
    if (expiry !== undefined) {
      await storage.removeItem(STATS_DETAIL_UNLOCK_STORAGE_KEY);
    }
    return undefined;
  }
  return expiry;
}

export async function unlockStatsDetail(
  storage: StringStoragePort,
  now: number,
): Promise<number> {
  const expiry = now + STATS_DETAIL_UNLOCK_DURATION_MS;
  await storage.setItem(STATS_DETAIL_UNLOCK_STORAGE_KEY, String(expiry));
  return expiry;
}
