import type {CareEvent} from '../domain/care-event.ts';
import type {EventId, GroupId} from '../domain/ids.ts';
import type {CareEventQuery} from './care-event-repository.ts';

/**
 * Server-backed transport. `push` resolves only after the remote service
 * acknowledges a write; UI use cases must not use this as their local durable
 * repository because an offline write can remain pending indefinitely.
 */
export interface CareEventRemoteStorePort {
  push(event: CareEvent): Promise<void>;
  findById(groupId: GroupId, eventId: EventId): Promise<CareEvent | undefined>;
  list(query: CareEventQuery): Promise<readonly CareEvent[]>;
  observe(
    query: CareEventQuery,
    listener: (events: readonly CareEvent[]) => void,
  ): () => void;
}
