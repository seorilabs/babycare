import {Storage} from '@apps-in-toss/framework';
import type {
  AnalyticsPort,
  BabyCareAnalyticsEvent,
} from '../../../../packages/product-core/src/index.ts';
import {
  FanOutAnalytics,
  PlatformAnalytics,
} from '../../../../packages/product-data/src/analytics.ts';

import {
  currentFirebaseIdToken,
  sendAnalyticsEventsToGa4,
} from './babycare-backend';

const PLATFORM_URL =
  'https://platform-api-306278488979.asia-northeast3.run.app';
const PLATFORM_EVENTS_URL =
  'https://platform-ingest-306278488979.asia-northeast3.run.app';
const CLIENT_ID_KEY = 'babynest.analytics-client-id.v1';
const MAX_BATCH = 20;
const MAX_BUFFER = 100;

interface AitGa4Event {
  readonly name: string;
  readonly params: Readonly<Record<string, string | number | boolean>>;
  readonly timestamp_micros: number;
}

interface StoredAitGa4Event {
  readonly event: AitGa4Event;
  readonly retryProtected: boolean;
}

function randomId(): string {
  return `ait-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 14)}`;
}

let clientIdPromise: Promise<string> | undefined;

async function analyticsClientId(): Promise<string> {
  clientIdPromise ??= (async () => {
    const stored = await Storage.getItem(CLIENT_ID_KEY);
    if (stored && /^[A-Za-z0-9._-]{8,64}$/.test(stored)) {
      return stored;
    }
    const created = randomId();
    await Storage.setItem(CLIENT_ID_KEY, created);
    return created;
  })();
  return clientIdPromise;
}

export interface AitGa4AnalyticsOptions {
  readonly send?: typeof sendAnalyticsEventsToGa4;
  readonly clientId?: () => Promise<string>;
  readonly now?: () => number;
}

export class AitGa4Analytics implements AnalyticsPort {
  readonly #send: typeof sendAnalyticsEventsToGa4;
  readonly #clientId: () => Promise<string>;
  readonly #now: () => number;
  #events: StoredAitGa4Event[] = [];
  #timer: ReturnType<typeof setTimeout> | undefined;
  #flushRequest: Promise<void> | undefined;
  #droppedCount = 0;
  #stopped = false;

  constructor(options: AitGa4AnalyticsOptions = {}) {
    this.#send = options.send ?? sendAnalyticsEventsToGa4;
    this.#clientId = options.clientId ?? analyticsClientId;
    this.#now = options.now ?? Date.now;
  }

  async track(event: BabyCareAnalyticsEvent): Promise<void> {
    this.#events.push({
      event: this.#event(event.name, event.params),
      retryProtected: false,
    });
    this.#trimBuffer();
    if (this.#events.length >= MAX_BATCH) {
      void this.flush();
    } else if (!this.#timer) {
      this.#timer = setTimeout(() => void this.flush(), 5_000);
    }
  }

  #clearTimer(): void {
    if (this.#timer) {
      clearTimeout(this.#timer);
      this.#timer = undefined;
    }
  }

  async stop(): Promise<void> {
    this.#stopped = true;
    this.#clearTimer();
    if (this.#flushRequest) {
      await this.#flushRequest;
    }
    while (this.#events.length > 0) {
      const before = this.#events.length;
      await this.flush();
      if (this.#events.length >= before) {
        break;
      }
    }
  }

  async flush(): Promise<void> {
    if (this.#flushRequest) {
      return this.#flushRequest;
    }
    if (this.#events.length === 0) {
      return;
    }
    this.#clearTimer();
    this.#flushRequest = this.#flushOnce().finally(() => {
      this.#flushRequest = undefined;
      if (!this.#stopped && this.#events.length > 0 && !this.#timer) {
        this.#timer = setTimeout(() => void this.flush(), 10_000);
      }
    });
    return this.#flushRequest;
  }

  async #flushOnce(): Promise<void> {
    const droppedSnapshot = this.#droppedCount;
    const retryBatch = this.#events[0]?.retryProtected === true;
    const includeDropped = droppedSnapshot > 0 && !retryBatch;
    const dataLimit = includeDropped ? MAX_BATCH - 1 : MAX_BATCH;
    const batch = this.#events.splice(0, dataLimit);
    try {
      const events = batch.map(item => item.event);
      if (includeDropped) {
        events.push(this.#event('seori_analytics_dropped', {count: droppedSnapshot}));
      }
      await this.#send({
        clientId: await this.#clientId(),
        events,
      });
      if (includeDropped) {
        this.#droppedCount = Math.max(0, this.#droppedCount - droppedSnapshot);
      }
    } catch {
      this.#events = [
        ...batch.map(item => ({...item, retryProtected: true})),
        ...this.#events,
      ];
      this.#trimBuffer();
    }
  }

  #event(
    name: string,
    params: Readonly<Record<string, string | number | boolean>>,
  ): AitGa4Event {
    return {name, params, timestamp_micros: this.#now() * 1_000};
  }

  #trimBuffer(): void {
    while (this.#events.length > MAX_BUFFER) {
      const unprotected = this.#events.findIndex(item => !item.retryProtected);
      this.#events.splice(unprotected >= 0 ? unprotected : 0, 1);
      this.#droppedCount += 1;
    }
  }
}

export function createBabycareAnalytics(fetchImpl?: typeof fetch): FanOutAnalytics {
  return new FanOutAnalytics([
    new AitGa4Analytics(),
    new PlatformAnalytics({
      baseUrl: PLATFORM_URL,
      eventsBaseUrl: PLATFORM_EVENTS_URL,
      firebaseIdToken: currentFirebaseIdToken,
      context: {platform: 'ait'},
      ...(fetchImpl ? {fetchImpl} : {}),
    }),
  ]);
}

export const babycareAnalytics = createBabycareAnalytics();
