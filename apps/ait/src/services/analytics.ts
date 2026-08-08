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
const CLIENT_ID_KEY = 'babynest.analytics-client-id.v1';
const MAX_BATCH = 20;

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

class AitGa4Analytics implements AnalyticsPort {
  #events: Array<{
    readonly name: string;
    readonly params: Readonly<Record<string, string | number | boolean>>;
    readonly timestamp_micros: number;
  }> = [];
  #timer: ReturnType<typeof setTimeout> | undefined;
  #flushing = false;

  async track(event: BabyCareAnalyticsEvent): Promise<void> {
    this.#events.push({
      name: event.name,
      params: event.params,
      timestamp_micros: Date.now() * 1_000,
    });
    if (this.#events.length >= MAX_BATCH) {
      void this.flush();
    } else if (!this.#timer) {
      this.#timer = setTimeout(() => void this.flush(), 5_000);
    }
  }

  stop(): void {
    if (this.#timer) {
      clearTimeout(this.#timer);
      this.#timer = undefined;
    }
  }

  async flush(): Promise<void> {
    if (this.#flushing || this.#events.length === 0) {
      return;
    }
    this.stop();
    this.#flushing = true;
    const batch = this.#events.splice(0, MAX_BATCH);
    try {
      await sendAnalyticsEventsToGa4({
        clientId: await analyticsClientId(),
        events: batch,
      });
    } catch {
      this.#events = [...batch, ...this.#events].slice(0, 100);
    } finally {
      this.#flushing = false;
      if (this.#events.length > 0 && !this.#timer) {
        this.#timer = setTimeout(() => void this.flush(), 10_000);
      }
    }
  }
}

export function createBabycareAnalytics(fetchImpl?: typeof fetch): FanOutAnalytics {
  return new FanOutAnalytics([
    new AitGa4Analytics(),
    new PlatformAnalytics({
      baseUrl: PLATFORM_URL,
      firebaseIdToken: currentFirebaseIdToken,
      context: {platform: 'ait'},
      ...(fetchImpl ? {fetchImpl} : {}),
    }),
  ]);
}

export const babycareAnalytics = createBabycareAnalytics();
