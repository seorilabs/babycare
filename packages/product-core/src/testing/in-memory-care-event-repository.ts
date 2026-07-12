import type { CareEvent } from '../domain/care-event.ts';
import type { EventId, GroupId } from '../domain/ids.ts';
import type {
  CareEventQuery,
  CareEventRepositoryPort,
} from '../ports/care-event-repository.ts';

export class InMemoryCareEventRepository implements CareEventRepositoryPort {
  readonly #events = new Map<EventId, CareEvent>();
  readonly #listeners = new Set<{
    readonly query: CareEventQuery;
    readonly listener: (events: readonly CareEvent[]) => void;
  }>();

  constructor(seed: readonly CareEvent[] = []) {
    for (const event of seed) {
      this.#events.set(event.id, event);
    }
  }

  async save(event: CareEvent): Promise<void> {
    this.#events.set(event.id, event);
    for (const subscription of this.#listeners) {
      subscription.listener(await this.list(subscription.query));
    }
  }

  async findById(groupId: GroupId, eventId: EventId): Promise<CareEvent | undefined> {
    const event = this.#events.get(eventId);
    return event?.groupId === groupId ? event : undefined;
  }

  async list(query: CareEventQuery): Promise<readonly CareEvent[]> {
    const result = [...this.#events.values()]
      .filter((event) => event.groupId === query.groupId && event.babyId === query.babyId)
      .filter((event) => query.includeDeleted || event.deletedAt === undefined)
      .filter((event) => query.from === undefined || event.occurredAt >= query.from)
      .filter((event) => query.to === undefined || event.occurredAt < query.to)
      .filter((event) => !query.kinds || query.kinds.includes(event.kind))
      .sort((left, right) => right.occurredAt - left.occurredAt);
    return query.limit === undefined ? result : result.slice(0, query.limit);
  }

  observe(
    query: CareEventQuery,
    listener: (events: readonly CareEvent[]) => void,
  ): () => void {
    const subscription = { query, listener };
    this.#listeners.add(subscription);
    void this.list(query).then(listener);
    return () => this.#listeners.delete(subscription);
  }
}
