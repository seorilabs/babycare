const ALLOWED_EVENT_NAMES = new Set([
  'core_screen_view',
  'core_ad_request',
  'core_ad_impression',
  'core_ad_reward',
  'bc_onboarding_complete',
  'bc_group_created',
  'bc_invite_created',
  'bc_invite_shared',
  'bc_invite_joined',
  'bc_first_log',
  'bc_log_create',
  'bc_log_update',
  'bc_log_delete',
]);

const PII_KEYS = /^(e_?mail|mail|phone|phone_number|tel|mobile|name|full_name|first_name|last_name|real_name|address|addr|zipcode|postal_code|birth|birthday|birthdate|ssn|passport|card_number|credit_card|ip|ip_address)$/i;

export interface AnalyticsRelayEvent {
  readonly name: string;
  readonly params: Readonly<Record<string, string | number>>;
  readonly timestamp_micros?: number;
}

export function parseAnalyticsEvents(value: unknown): readonly AnalyticsRelayEvent[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 20) {
    throw new Error('events must contain between 1 and 20 items');
  }
  return value.map(item => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      throw new Error('event must be an object');
    }
    const source = item as Record<string, unknown>;
    if (typeof source.name !== 'string' || !ALLOWED_EVENT_NAMES.has(source.name)) {
      throw new Error('event name is not allowed');
    }
    if (
      typeof source.params !== 'object' ||
      source.params === null ||
      Array.isArray(source.params)
    ) {
      throw new Error('event params must be an object');
    }
    const entries = Object.entries(source.params);
    if (entries.length > 25) {
      throw new Error('event has too many params');
    }
    const params: Record<string, string | number> = {};
    for (const [key, raw] of entries) {
      if (!key || key.length > 40 || PII_KEYS.test(key)) {
        throw new Error('event param key is not allowed');
      }
      if (typeof raw === 'boolean') {
        params[key] = raw ? 1 : 0;
      } else if (typeof raw === 'number' && Number.isFinite(raw)) {
        params[key] = raw;
      } else if (typeof raw === 'string') {
        params[key] = raw.slice(0, 100);
      } else {
        throw new Error('event param value is not allowed');
      }
    }
    const timestamp = source.timestamp_micros;
    if (
      timestamp !== undefined &&
      (!Number.isSafeInteger(timestamp) || Number(timestamp) <= 0)
    ) {
      throw new Error('event timestamp is invalid');
    }
    return {
      name: source.name,
      params,
      ...(timestamp === undefined
        ? {}
        : {timestamp_micros: Number(timestamp)}),
    };
  });
}

export function parseAnalyticsClientId(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length < 8 ||
    value.length > 64 ||
    !/^[A-Za-z0-9._-]+$/.test(value)
  ) {
    throw new Error('clientId is invalid');
  }
  return value;
}

export async function relayAnalyticsToGa4(input: {
  readonly measurementId: string;
  readonly apiSecret: string;
  readonly clientId: string;
  readonly userId: string;
  readonly events: readonly AnalyticsRelayEvent[];
  readonly fetchImpl?: typeof fetch;
}): Promise<void> {
  const response = await (input.fetchImpl ?? fetch)(
    `https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(
      input.measurementId,
    )}&api_secret=${encodeURIComponent(input.apiSecret)}`,
    {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        client_id: input.clientId,
        user_id: input.userId,
        events: input.events,
      }),
    },
  );
  if (!response.ok) {
    throw new Error(`GA4 Measurement Protocol failed: ${response.status}`);
  }
}
