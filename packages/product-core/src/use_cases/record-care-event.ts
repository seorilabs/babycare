import {
  createCareEvent,
  isActiveSleep,
  type CareEvent,
  type CreateCareEventInput,
} from '../domain/care-event.ts';
import type { AnalyticsPort } from '../ports/analytics.ts';
import type { CareEventRepositoryPort } from '../ports/care-event-repository.ts';
import type { ClockPort } from '../ports/clock.ts';
import type { IdGeneratorPort } from '../ports/id-generator.ts';

export interface RecordCareEventDependencies {
  readonly repository: CareEventRepositoryPort;
  readonly clock: ClockPort;
  readonly idGenerator: IdGeneratorPort;
  readonly analytics: AnalyticsPort;
}

export function createRecordCareEvent(dependencies: RecordCareEventDependencies) {
  let queue: Promise<void> = Promise.resolve();

  const record = async (input: CreateCareEventInput): Promise<CareEvent> => {
    const event = createCareEvent(input, {
      id: dependencies.idGenerator.nextEventId(),
      now: dependencies.clock.now(),
    });
    const priorEvents = await dependencies.repository.list({
      groupId: event.groupId,
      babyId: event.babyId,
      includeDeleted: true,
      limit: 1,
    });
    if (isActiveSleep(event)) {
      const sleepEvents = await dependencies.repository.list({
        groupId: event.groupId,
        babyId: event.babyId,
        kinds: ['sleep'],
      });
      if (sleepEvents.some(isActiveSleep)) {
        throw new Error('An active sleep session already exists');
      }
    }

    await dependencies.repository.save(event);
    await dependencies.analytics
      .track({
        name: priorEvents.length === 0 ? 'bc_first_log' : 'bc_log_create',
        params: {type: event.kind},
      })
      .catch(() => undefined);
    return event;
  };

  return (input: CreateCareEventInput): Promise<CareEvent> => {
    const operation = queue.then(
      () => record(input),
      () => record(input),
    );
    queue = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  };
}
