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
import type {StringStoragePort} from '../ports/string-storage.ts';
import type {MembershipRole} from '../domain/care-group.ts';

const FIRST_LOG_MARKER_PREFIX = 'babycare/first-log-recorded/v1/';

export interface RecordCareEventDependencies {
  readonly repository: CareEventRepositoryPort;
  readonly clock: ClockPort;
  readonly idGenerator: IdGeneratorPort;
  readonly analytics: AnalyticsPort;
  readonly firstLogStorage: StringStoragePort;
  readonly groupRole: MembershipRole;
}

export function createRecordCareEvent(dependencies: RecordCareEventDependencies) {
  let queue: Promise<void> = Promise.resolve();

  const record = async (input: CreateCareEventInput): Promise<CareEvent> => {
    const event = createCareEvent(input, {
      id: dependencies.idGenerator.nextEventId(),
      now: dependencies.clock.now(),
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
    const markerKey = `${FIRST_LOG_MARKER_PREFIX}${event.caregiverId}`;
    let isFirst = false;
    try {
      isFirst = (await dependencies.firstLogStorage.getItem(markerKey)) === null;
      if (isFirst) {
        await dependencies.firstLogStorage.setItem(markerKey, '1');
      }
    } catch {
      // Analytics metadata must never turn a successful care write into a failure.
      isFirst = false;
    }
    await dependencies.analytics
      .track({
        name: 'bc_log_create',
        params: {
          type: event.kind,
          is_first: isFirst,
          group_role: dependencies.groupRole,
        },
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
