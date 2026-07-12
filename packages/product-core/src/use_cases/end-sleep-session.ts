import {
  MAX_SLEEP_DURATION_MS,
  type SleepEvent,
} from '../domain/care-event.ts';
import type { EventId, GroupId } from '../domain/ids.ts';
import type { AnalyticsPort } from '../ports/analytics.ts';
import type { CareEventRepositoryPort } from '../ports/care-event-repository.ts';
import type { ClockPort } from '../ports/clock.ts';

export interface EndSleepSessionDependencies {
  readonly repository: CareEventRepositoryPort;
  readonly clock: ClockPort;
  readonly analytics: AnalyticsPort;
}

export function createEndSleepSession(dependencies: EndSleepSessionDependencies) {
  return async (input: {
    readonly groupId: GroupId;
    readonly eventId: EventId;
  }): Promise<SleepEvent> => {
    const event = await dependencies.repository.findById(input.groupId, input.eventId);
    if (!event || event.kind !== 'sleep' || event.deletedAt !== undefined) {
      throw new Error('Active sleep session was not found');
    }
    if (event.endedAt !== undefined) {
      throw new Error('Sleep session has already ended');
    }
    const now = dependencies.clock.now();
    if (now < event.updatedAt) {
      throw new Error('System clock moved behind the last care event update');
    }
    if (now <= event.startedAt) {
      throw new Error('Sleep session cannot end before it starts');
    }
    const endedAt = Math.min(now, event.startedAt + MAX_SLEEP_DURATION_MS);
    const ended: SleepEvent = {
      ...event,
      endedAt,
      updatedAt: now,
      revision: event.revision + 1,
    };
    await dependencies.repository.save(ended);
    await dependencies.analytics
      .track({
        name: 'bc_log_update',
        params: {type: 'sleep'},
      })
      .catch(() => undefined);
    return ended;
  };
}
