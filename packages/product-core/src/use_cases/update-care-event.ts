import type { CareEvent } from '../domain/care-event.ts';
import type { EventId, GroupId, UserId } from '../domain/ids.ts';
import type { AnalyticsPort } from '../ports/analytics.ts';
import type { CareEventRepositoryPort } from '../ports/care-event-repository.ts';
import type { ClockPort } from '../ports/clock.ts';

export interface UpdateCareEventDependencies {
  readonly repository: CareEventRepositoryPort;
  readonly clock: ClockPort;
  readonly analytics: AnalyticsPort;
}

export function createSoftDeleteCareEvent(dependencies: UpdateCareEventDependencies) {
  return async (input: {
    readonly groupId: GroupId;
    readonly eventId: EventId;
    readonly requestedBy: UserId;
  }): Promise<CareEvent> => {
    const event = await dependencies.repository.findById(input.groupId, input.eventId);
    if (!event || event.deletedAt !== undefined) {
      throw new Error('Care event was not found');
    }
    if (event.caregiverId !== input.requestedBy) {
      throw new Error('Only the original caregiver can delete this event');
    }
    const now = dependencies.clock.now();
    const deleted = {
      ...event,
      deletedAt: now,
      updatedAt: now,
      revision: event.revision + 1,
    } satisfies CareEvent;
    await dependencies.repository.save(deleted);
    await dependencies.analytics
      .track({
        name: 'bc_log_delete',
        params: {type: event.kind},
      })
      .catch(() => undefined);
    return deleted;
  };
}
