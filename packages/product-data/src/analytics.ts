import type {
  AnalyticsPort,
  BabyCareAnalyticsEvent,
} from '@babycare/product-core';

const PLATFORM_APP_ID = 'babycare';
const MAX_BATCH = 20;
const MAX_BUFFER = 200;
const DEFAULT_FLUSH_INTERVAL_MS = 10_000;
const PLATFORM_TOKEN_MARGIN_MS = 60_000;
const ANALYTICS_SESSION_TIMEOUT_MS = 30 * 60 * 1_000;
const CROCKFORD_BASE32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const SDK_VERSION = 'babycare-analytics/1';

type AnalyticsSink = AnalyticsPort & {
  flush?: () => Promise<void>;
  stop?: () => void | Promise<void>;
};

export class FanOutAnalytics implements AnalyticsPort {
  readonly #sinks: readonly AnalyticsSink[];

  constructor(sinks: readonly AnalyticsSink[]) {
    this.#sinks = sinks;
  }

  async track(event: BabyCareAnalyticsEvent): Promise<void> {
    for (const sink of this.#sinks) {
      void sink.track(event).catch(() => undefined);
    }
  }

  async flush(): Promise<void> {
    await Promise.all(
      this.#sinks.map(sink => sink.flush?.().catch(() => undefined)),
    );
  }

  async stop(): Promise<void> {
    await this.flush();
    await Promise.all(
      this.#sinks.map(sink => Promise.resolve(sink.stop?.()).catch(() => undefined)),
    );
  }

  setForeground(foreground: boolean): void {
    for (const sink of this.#sinks) {
      try {
        sink.setForeground?.(foreground);
      } catch {
        // Analytics lifecycle must never escape into the product flow.
      }
    }
  }
}

export interface PlatformAnalyticsContext {
  readonly platform: 'android' | 'ios' | 'ait';
  readonly appVersion: string;
  readonly locale?: string;
  readonly ga4ClientId?: string;
  readonly analyticsConsent?: boolean;
}

export function canonicalAnalyticsDimensions(
  context: PlatformAnalyticsContext,
): Readonly<{
  app_market: 'google_play' | 'app_store' | 'apps_in_toss';
  runtime_platform: 'android' | 'ios' | 'web';
  release_version: string;
}> {
  const releaseVersion = context.appVersion.trim();
  if (!releaseVersion) {
    throw new Error('Analytics appVersion is required');
  }
  return {
    app_market:
      context.platform === 'ait'
        ? 'apps_in_toss'
        : context.platform === 'ios'
          ? 'app_store'
          : 'google_play',
    runtime_platform: context.platform === 'ait' ? 'web' : context.platform,
    release_version: releaseVersion,
  };
}

interface PlatformAnalyticsOptions {
  readonly baseUrl: string;
  readonly eventsBaseUrl?: string;
  readonly firebaseIdToken?: () => Promise<string | undefined>;
  readonly context: PlatformAnalyticsContext | (() => PlatformAnalyticsContext);
  readonly ga4ClientId?: () => Promise<string | undefined>;
  readonly fetchImpl?: typeof fetch;
  readonly now?: () => number;
  readonly flushIntervalMs?: number;
}

interface BufferedPlatformEvent {
  readonly eventId: string;
  readonly name: string;
  readonly sessionId: string;
  readonly params: Readonly<Record<string, string | number>>;
  readonly tsUnixMs: number;
}

interface StoredPlatformEvent {
  readonly event: BufferedPlatformEvent;
  readonly retryProtected: boolean;
}

interface PlatformSession {
  readonly token: string;
  readonly expiresAt: number;
}

function ulid(now = Date.now()): string {
  let timestamp = Math.max(0, Math.min(now, 0xffffffffffff));
  let encodedTime = '';
  for (let index = 0; index < 10; index += 1) {
    encodedTime = CROCKFORD_BASE32[timestamp % 32]! + encodedTime;
    timestamp = Math.floor(timestamp / 32);
  }
  let entropy = '';
  for (let index = 0; index < 16; index += 1) {
    entropy += CROCKFORD_BASE32[Math.floor(Math.random() * 32)]!;
  }
  return encodedTime + entropy;
}

function normalizeParams(
  input: Readonly<Record<string, unknown>>,
  limit = 25,
): Readonly<Record<string, string | number>> {
  return Object.fromEntries(
    Object.entries(input)
      .filter(([key]) =>
        key.length > 0 &&
        key.length <= 40 &&
        !/^(e_?mail|mail|phone|phone_number|tel|mobile|name|full_name|first_name|last_name|real_name|address|addr|zipcode|postal_code|birth|birthday|birthdate|ssn|passport|card_number|credit_card|ip|ip_address)$/i.test(
          key,
        ),
      )
      .map(([key, value]) => {
        if (typeof value === 'boolean') {
          return [key, value ? 1 : 0] as const;
        }
        if (typeof value === 'number') {
          return [key, Number.isFinite(value) ? value : 0] as const;
        }
        return [key, String(value).slice(0, 100)] as const;
      })
      .slice(0, limit),
  );
}

function canonicalParams(
  context: PlatformAnalyticsContext,
  sessionId: string,
  engagementTimeMsec: number,
): Readonly<Record<string, string | number>> {
  return {
    ...canonicalAnalyticsDimensions(context),
    session_id: sessionId,
    engagement_time_msec: Math.max(1, Math.round(engagementTimeMsec)),
  };
}

function envelopeResult(value: unknown): Record<string, unknown> {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    !('ok' in value) ||
    value.ok !== true ||
    !('result' in value) ||
    typeof value.result !== 'object' ||
    value.result === null ||
    Array.isArray(value.result)
  ) {
    throw new Error('Invalid Platform response');
  }
  return value.result as Record<string, unknown>;
}

/**
 * Babycare용 최소 Platform Events 어댑터다. UI 경로를 막지 않으며,
 * Firebase ID token을 Platform session으로 교환해 식별 가능한 이벤트를
 * 20개 단위로 전송한다. 실패 배치는 메모리에서 제한적으로 재시도한다.
 */
export class PlatformAnalytics implements AnalyticsPort {
  readonly #baseUrl: string;
  readonly #eventsBaseUrl: string;
  readonly #firebaseIdToken: (() => Promise<string | undefined>) | undefined;
  readonly #context:
    | PlatformAnalyticsContext
    | (() => PlatformAnalyticsContext);
  readonly #ga4ClientId: (() => Promise<string | undefined>) | undefined;
  readonly #fetch: typeof fetch;
  readonly #now: () => number;
  #sessionId: string;
  #lastEventAt: number;
  #backgroundAt: number | undefined;
  readonly #timer: ReturnType<typeof setInterval> | undefined;
  #buffer: StoredPlatformEvent[] = [];
  #session: PlatformSession | undefined;
  #sessionRequest: Promise<PlatformSession | undefined> | undefined;
  #flushRequest: Promise<void> | undefined;
  #droppedCount = 0;

  constructor(options: PlatformAnalyticsOptions) {
    this.#baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.#eventsBaseUrl = (options.eventsBaseUrl ?? options.baseUrl).replace(
      /\/+$/,
      '',
    );
    this.#firebaseIdToken = options.firebaseIdToken;
    this.#context = options.context;
    this.#ga4ClientId = options.ga4ClientId;
    this.#fetch = options.fetchImpl ?? globalThis.fetch;
    this.#now = options.now ?? Date.now;
    const startedAt = this.#now();
    this.#sessionId = String(startedAt);
    this.#lastEventAt = startedAt;
    const interval = options.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS;
    if (interval > 0) {
      this.#timer = setInterval(() => void this.flush(), interval);
      (this.#timer as unknown as {unref?: () => void}).unref?.();
    }
    this.#enqueue('seori_session_start', {});
  }

  async track(event: BabyCareAnalyticsEvent): Promise<void> {
    this.#enqueue(event.name, event.params);
    if (this.#buffer.length >= MAX_BATCH) {
      void this.flush();
    }
  }

  setForeground(foreground: boolean): void {
    const now = this.#now();
    if (!foreground) {
      this.#backgroundAt ??= now;
      return;
    }
    if (
      this.#backgroundAt !== undefined &&
      now - this.#backgroundAt >= ANALYTICS_SESSION_TIMEOUT_MS
    ) {
      this.#sessionId = String(now);
      this.#lastEventAt = now;
      this.#enqueue('seori_session_start', {});
    } else {
      // Background time is not user engagement.
      this.#lastEventAt = now;
    }
    this.#backgroundAt = undefined;
  }

  async stop(): Promise<void> {
    if (this.#timer) {
      clearInterval(this.#timer);
    }
    if (this.#flushRequest) {
      await this.#flushRequest;
    }
    while (this.#buffer.length > 0) {
      const before = this.#buffer.length;
      await this.flush();
      if (this.#buffer.length >= before) {
        break;
      }
    }
  }

  async flush(): Promise<void> {
    if (this.#flushRequest) {
      return this.#flushRequest;
    }
    if (this.#buffer.length === 0) {
      return;
    }
    this.#flushRequest = this.#flushOnce().finally(() => {
      this.#flushRequest = undefined;
    });
    return this.#flushRequest;
  }

  async #flushOnce(): Promise<void> {
    const droppedSnapshot = this.#droppedCount;
    const retryBatch = this.#buffer[0]?.retryProtected === true;
    const includeDropped = droppedSnapshot > 0 && !retryBatch;
    const dataLimit = includeDropped ? MAX_BATCH - 1 : MAX_BATCH;
    const batch = this.#buffer.splice(0, dataLimit);
    try {
      const token = await this.#platformToken();
      const context =
        typeof this.#context === 'function' ? this.#context() : this.#context;
      let ga4ClientId = context.ga4ClientId;
      if (!ga4ClientId && this.#ga4ClientId) {
        try {
          ga4ClientId = await this.#ga4ClientId();
        } catch {
          // Platform ledger collection remains available without GA4 relay.
        }
      }
      const events = batch.map(item => item.event);
      if (includeDropped) {
        events.push(this.#event('seori_analytics_dropped', {count: droppedSnapshot}));
      }
      const response = await this.#fetch(`${this.#eventsBaseUrl}/v1/events`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Seori-App': PLATFORM_APP_ID,
          'X-Seori-Sdk': SDK_VERSION,
          ...(token ? {Authorization: `Bearer ${token}`} : {}),
        },
        body: JSON.stringify({
          events,
          context: {
            ...context,
            ...(ga4ClientId ? {ga4ClientId} : {}),
            sdkVersion: SDK_VERSION,
          },
        }),
      });
      if (!response.ok) {
        throw new Error(`Platform events failed: ${response.status}`);
      }
      if (includeDropped) {
        this.#droppedCount = Math.max(0, this.#droppedCount - droppedSnapshot);
      }
    } catch {
      this.#buffer = [
        ...batch.map(item => ({...item, retryProtected: true})),
        ...this.#buffer,
      ];
      this.#trimBuffer();
    }
  }

  #enqueue(name: string, params: Readonly<Record<string, unknown>>): void {
    this.#buffer.push({event: this.#event(name, params), retryProtected: false});
    this.#trimBuffer();
  }

  #event(
    name: string,
    params: Readonly<Record<string, unknown>>,
  ): BufferedPlatformEvent {
    const now = this.#now();
    const context =
      typeof this.#context === 'function' ? this.#context() : this.#context;
    const paramsWithCanonicalValues = {
      ...normalizeParams(params, 20),
      ...canonicalParams(context, this.#sessionId, now - this.#lastEventAt),
    };
    this.#lastEventAt = now;
    return {
      eventId: ulid(now),
      name,
      sessionId: this.#sessionId,
      params: paramsWithCanonicalValues,
      tsUnixMs: now,
    };
  }

  #trimBuffer(): void {
    while (this.#buffer.length > MAX_BUFFER) {
      const unprotected = this.#buffer.findIndex(item => !item.retryProtected);
      this.#buffer.splice(unprotected >= 0 ? unprotected : 0, 1);
      this.#droppedCount += 1;
    }
  }

  async #platformToken(): Promise<string | undefined> {
    if (
      this.#session &&
      this.#session.expiresAt > this.#now() + PLATFORM_TOKEN_MARGIN_MS
    ) {
      return this.#session.token;
    }
    if (!this.#firebaseIdToken) {
      return undefined;
    }
    this.#sessionRequest ??= this.#createPlatformSession().finally(() => {
      this.#sessionRequest = undefined;
    });
    this.#session = await this.#sessionRequest;
    return this.#session?.token;
  }

  async #createPlatformSession(): Promise<PlatformSession | undefined> {
    const idToken = await this.#firebaseIdToken?.();
    if (!idToken) {
      return undefined;
    }
    const response = await this.#fetch(`${this.#baseUrl}/v1/auth/session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Seori-App': PLATFORM_APP_ID,
      },
      body: JSON.stringify({
        credential: {kind: 'firebase-id-token', value: idToken},
      }),
    });
    const result = envelopeResult(await response.json());
    if (!response.ok) {
      throw new Error(`Platform session failed: ${response.status}`);
    }
    const token = result.platformToken;
    const expiresIn = result.expiresIn;
    if (
      typeof token !== 'string' ||
      !token ||
      typeof expiresIn !== 'number' ||
      expiresIn <= 0
    ) {
      throw new Error('Invalid Platform session');
    }
    return {token, expiresAt: this.#now() + expiresIn * 1_000};
  }
}
