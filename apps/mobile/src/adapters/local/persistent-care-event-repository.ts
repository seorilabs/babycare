import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  CareEvent,
  CareEventQuery,
  CareEventRepositoryPort,
  EventId,
  GroupId,
} from '@babycare/product-core';

const STORAGE_KEY = '@babycare/care-events/v1';

const BASE_KEYS = [
  'id',
  'groupId',
  'babyId',
  'caregiverId',
  'kind',
  'occurredAt',
  'createdAt',
  'updatedAt',
  'revision',
  'note',
  'deletedAt',
] as const;

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every(key => allowed.includes(key));
}

function isId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.trim() === value;
}

function isTimestamp(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isPositiveNumber(value: unknown, maximum: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= maximum;
}

export function isPersistedCareEvent(value: unknown): value is CareEvent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const event = value as Record<string, unknown>;
  if (
    !isId(event.id) ||
    !isId(event.groupId) ||
    !isId(event.babyId) ||
    !isId(event.caregiverId) ||
    !isTimestamp(event.occurredAt) ||
    !isTimestamp(event.createdAt) ||
    !isTimestamp(event.updatedAt) ||
    event.updatedAt < event.createdAt ||
    event.occurredAt > event.updatedAt + 5 * 60 * 1_000 ||
    !Number.isInteger(event.revision) ||
    (event.revision as number) < 1 ||
    (event.note !== undefined &&
      (typeof event.note !== 'string' || event.note.length === 0 || event.note.length > 500)) ||
    (event.deletedAt !== undefined &&
      (!isTimestamp(event.deletedAt) || event.deletedAt !== event.updatedAt))
  ) {
    return false;
  }

  if (event.kind === 'feeding') {
    if (
      !hasOnlyKeys(event, [
        ...BASE_KEYS,
        'feedingType',
        'volumeMl',
        'leftDurationSeconds',
        'rightDurationSeconds',
      ]) ||
      !['breast', 'bottle_breastmilk', 'formula', 'solid'].includes(
        event.feedingType as string,
      )
    ) {
      return false;
    }
    const left = event.leftDurationSeconds;
    const right = event.rightDurationSeconds;
    if (event.feedingType === 'breast') {
      return (
        event.volumeMl === undefined &&
        (left === undefined || isPositiveNumber(left, 43_200)) &&
        (right === undefined || isPositiveNumber(right, 43_200)) &&
        ((left as number | undefined) ?? 0) + ((right as number | undefined) ?? 0) > 0 &&
        ((left as number | undefined) ?? 0) + ((right as number | undefined) ?? 0) <= 43_200
      );
    }
    return (
      isPositiveNumber(event.volumeMl, 2_000) &&
      left === undefined &&
      right === undefined
    );
  }

  if (event.kind === 'diaper') {
    return (
      hasOnlyKeys(event, [...BASE_KEYS, 'diaperType']) &&
      ['wet', 'dirty', 'mixed'].includes(event.diaperType as string)
    );
  }

  if (event.kind === 'sleep') {
    return (
      hasOnlyKeys(event, [...BASE_KEYS, 'sleepType', 'startedAt', 'endedAt']) &&
      ['nap', 'night'].includes(event.sleepType as string) &&
      isTimestamp(event.startedAt) &&
      event.startedAt === event.occurredAt &&
      (event.endedAt === undefined ||
        (isTimestamp(event.endedAt) &&
          event.endedAt > event.startedAt &&
          event.endedAt <= event.updatedAt &&
          event.endedAt - event.startedAt <= 48 * 60 * 60 * 1_000))
    );
  }

  return false;
}

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
