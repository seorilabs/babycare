import type { CareEvent, CareEventKind } from '../domain/care-event.ts';

export interface DashboardSummary {
  readonly latest: Readonly<Partial<Record<CareEventKind, CareEvent>>>;
  readonly feedingCount: number;
  readonly feedingVolumeMl: number;
  readonly diaperCount: number;
  readonly sleepCount: number;
  readonly sleepDurationSeconds: number;
}

export function buildDashboardSummary(
  events: readonly CareEvent[],
  range: { readonly from: number; readonly to: number },
  now: number,
): DashboardSummary {
  if (range.to <= range.from) {
    throw new Error('Dashboard range must have a positive duration');
  }

  const active = events
    .filter((event) => event.deletedAt === undefined)
    .slice()
    .sort((left, right) => right.occurredAt - left.occurredAt);
  const latest: Partial<Record<CareEventKind, CareEvent>> = {};
  for (const event of active) {
    latest[event.kind] ??= event;
  }

  const inRange = active.filter(
    (event) => event.occurredAt >= range.from && event.occurredAt < range.to,
  );
  let feedingVolumeMl = 0;
  let sleepDurationSeconds = 0;

  for (const event of inRange) {
    if (event.kind === 'feeding') {
      feedingVolumeMl += event.volumeMl ?? 0;
    }
  }

  for (const event of active) {
    if (event.kind !== 'sleep') {
      continue;
    }
    const endedAt = Math.min(event.endedAt ?? now, range.to);
    const startedAt = Math.max(event.startedAt, range.from);
    sleepDurationSeconds += Math.max(0, endedAt - startedAt) / 1_000;
  }

  return {
    latest,
    feedingCount: inRange.filter((event) => event.kind === 'feeding').length,
    feedingVolumeMl,
    diaperCount: inRange.filter((event) => event.kind === 'diaper').length,
    sleepCount: inRange.filter((event) => event.kind === 'sleep').length,
    sleepDurationSeconds,
  };
}
