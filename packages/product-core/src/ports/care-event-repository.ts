import type { CareEvent, CareEventKind } from '../domain/care-event.ts';
import type { BabyId, EventId, GroupId } from '../domain/ids.ts';

export interface CareEventQuery {
  readonly groupId: GroupId;
  readonly babyId: BabyId;
  readonly from?: number;
  readonly to?: number;
  readonly kinds?: readonly CareEventKind[];
  readonly includeDeleted?: boolean;
  readonly limit?: number;
}

export interface CareEventRepositoryPort {
  save(event: CareEvent): Promise<void>;
  findById(groupId: GroupId, eventId: EventId): Promise<CareEvent | undefined>;
  list(query: CareEventQuery): Promise<readonly CareEvent[]>;
  observe(
    query: CareEventQuery,
    listener: (events: readonly CareEvent[]) => void,
  ): () => void;
}
