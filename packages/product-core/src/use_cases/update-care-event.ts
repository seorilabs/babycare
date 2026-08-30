import {
  createCareEvent,
  type CareEvent,
  type CreateCareEventInput,
} from '../domain/care-event.ts';
import type { EventId, GroupId, UserId } from '../domain/ids.ts';
import type { AnalyticsPort } from '../ports/analytics.ts';
import type { CareEventRepositoryPort } from '../ports/care-event-repository.ts';
import type { ClockPort } from '../ports/clock.ts';

export interface UpdateCareEventDependencies {
  readonly repository: CareEventRepositoryPort;
  readonly clock: ClockPort;
  readonly analytics: AnalyticsPort;
}

export interface UpdateCareEventInput {
  readonly groupId: GroupId;
  readonly eventId: EventId;
  readonly requestedBy: UserId;
  readonly update: CreateCareEventInput;
}

function hasForbiddenUpdateMetadata(input: CreateCareEventInput): boolean {
  const value = input as CreateCareEventInput & Record<string, unknown>;
  return ['id', 'createdAt', 'updatedAt', 'revision', 'deletedAt'].some(
    key => Object.prototype.hasOwnProperty.call(value, key),
  );
}

export function createUpdateCareEvent(dependencies: UpdateCareEventDependencies) {
  return async (input: UpdateCareEventInput): Promise<CareEvent> => {
    const event = await dependencies.repository.findById(
      input.groupId,
      input.eventId,
    );
    if (!event || event.deletedAt !== undefined) {
      throw new Error('Care event was not found');
    }
    if (!input.requestedBy) {
      throw new Error('The requesting caregiver is required');
    }
    if (hasForbiddenUpdateMetadata(input.update)) {
      throw new Error('Care event update contains immutable metadata');
    }
    if (
      input.update.groupId !== event.groupId ||
      input.update.babyId !== event.babyId ||
      input.update.caregiverId !== event.caregiverId ||
      input.update.kind !== event.kind
    ) {
      throw new Error('Care event identity cannot be changed');
    }
    const now = dependencies.clock.now();
    if (now < event.updatedAt) {
      throw new Error('System clock moved behind the last care event update');
    }

    // Reuse the canonical creation path so field limits, normalization and
    // discriminated-union validation cannot drift between create and update.
    const validated = createCareEvent(input.update, {id: event.id, now});
    const updated = {
      ...validated,
      createdAt: event.createdAt,
      updatedAt: now,
      revision: event.revision + 1,
    } satisfies CareEvent;
    await dependencies.repository.save(updated);
    await dependencies.analytics
      .track({name: 'bc_log_update', params: {type: event.kind}})
      .catch(() => undefined);
    return updated;
  };
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
    if (!input.requestedBy) {
      throw new Error('The requesting caregiver is required');
    }
    const now = dependencies.clock.now();
    if (now < event.updatedAt) {
      throw new Error('System clock moved behind the last care event update');
    }
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
