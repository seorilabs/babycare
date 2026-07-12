import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  CareEvent,
  CareEventQuery,
  CareEventRepositoryPort,
  EventId,
  GroupId,
} from '@babycare/product-core';
import {isPersistedCareEvent} from '@babycare/product-data';

const STORAGE_KEY = '@babycare/care-events/v1';

export {isPersistedCareEvent} from '@babycare/product-data';

export class PersistentCareEventRepository implements CareEventRepositoryPort {
  readonly #events = new Map<EventId, CareEvent>();
  readonly #subscriptions = new Set<{
    readonly query: CareEventQuery;
    readonly listener: (events: readonly CareEvent[]) => void;
  }>();
  readonly #ready: Promise<void>;

  constructor() {
    this.#ready = this.#hydrate();
  }

  async #hydrate(): Promise<void> {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return;
    }
    try {
      const values: unknown = JSON.parse(raw);
      if (!Array.isArray(values)) {
        return;
      }
      for (const value of values) {
        if (isPersistedCareEvent(value)) {
          this.#events.set(value.id, value);
        }
      }
    } catch {
      // Corrupt local cache is ignored. Cloud sync will refill it once configured.
    }
  }

  async #persist(): Promise<void> {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([...this.#events.values()]));
  }

  async #emit(): Promise<void> {
    for (const subscription of this.#subscriptions) {
      subscription.listener(await this.list(subscription.query));
    }
  }

  async save(event: CareEvent): Promise<void> {
    await this.#ready;
    this.#events.set(event.id, event);
    await this.#persist();
    await this.#emit();
  }

  async clear(): Promise<void> {
    await this.#ready;
    this.#events.clear();
    await AsyncStorage.removeItem(STORAGE_KEY);
    await this.#emit();
  }

  async findById(group: GroupId, id: EventId): Promise<CareEvent | undefined> {
    await this.#ready;
    const event = this.#events.get(id);
    return event?.groupId === group ? event : undefined;
  }

  async list(query: CareEventQuery): Promise<readonly CareEvent[]> {
    await this.#ready;
    const events = [...this.#events.values()]
      .filter(event => event.groupId === query.groupId && event.babyId === query.babyId)
      .filter(event => query.includeDeleted || event.deletedAt === undefined)
      .filter(event => query.from === undefined || event.occurredAt >= query.from)
      .filter(event => query.to === undefined || event.occurredAt < query.to)
      .filter(event => !query.kinds || query.kinds.includes(event.kind))
      .sort((left, right) => right.occurredAt - left.occurredAt);
    return query.limit === undefined ? events : events.slice(0, query.limit);
  }

  observe(
    query: CareEventQuery,
    listener: (events: readonly CareEvent[]) => void,
  ): () => void {
    const subscription = {query, listener};
    this.#subscriptions.add(subscription);
    this.list(query).then(listener).catch(() => listener([]));
    return () => this.#subscriptions.delete(subscription);
  }
}
