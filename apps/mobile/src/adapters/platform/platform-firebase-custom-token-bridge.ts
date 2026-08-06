export const PLATFORM_FIREBASE_AUTH_CONFIG = {
  appId: 'babycare',
  baseUrl: 'https://platform-api-306278488979.asia-northeast3.run.app',
} as const;

export interface FirebaseCustomTokenBridgeResult {
  readonly firebaseCustomToken: string;
  readonly appUserId: string;
}

export interface FirebaseCustomTokenBridge {
  createFirebaseCustomToken(input: {
    readonly existingFirebaseIdToken?: string;
  }): Promise<FirebaseCustomTokenBridgeResult>;
  deleteFirebaseAccount?(input: {
    readonly firebaseIdToken: string;
  }): Promise<void>;
}

interface PlatformErrorBody {
  readonly code?: unknown;
  readonly message?: unknown;
}

interface PlatformEnvelope {
  readonly ok?: unknown;
  readonly result?: unknown;
  readonly error?: PlatformErrorBody;
}

export class PlatformAuthBridgeError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'PlatformAuthBridgeError';
    this.code = code;
    this.status = status;
  }
}

export interface PlatformFirebaseCustomTokenBridgeOptions {
  readonly baseUrl?: string;
  readonly appId?: string;
  readonly fetch?: typeof fetch;
  readonly appCheckToken?: () => Promise<string | undefined>;
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

async function resolveAppCheckToken(
  source?: () => Promise<string | undefined>,
): Promise<string | undefined> {
  if (!source) {
    return undefined;
  }
  try {
    return nonEmptyString(await source());
  } catch {
    // App Check enforcement belongs to the server. Omitting an unavailable
    // token keeps rollout and recovery paths usable while enforcement is off;
    // an enforcing server still rejects this request.
    return undefined;
  }
}

function decodeResult(
  response: Response,
  envelope: PlatformEnvelope,
): FirebaseCustomTokenBridgeResult {
  if (!response.ok || envelope.ok !== true) {
    const code = nonEmptyString(envelope.error?.code) ?? 'platform_unavailable';
    const message =
      nonEmptyString(envelope.error?.message) ??
      '인증 서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.';
    throw new PlatformAuthBridgeError(code, message, response.status);
  }
  if (!envelope.result || typeof envelope.result !== 'object') {
    throw new PlatformAuthBridgeError(
      'platform_response_invalid',
      '인증 서버 응답을 확인하지 못했어요.',
      response.status,
    );
  }
  const result = envelope.result as Record<string, unknown>;
  const firebaseCustomToken = nonEmptyString(result.firebaseCustomToken);
  const appUserId = nonEmptyString(result.appUserId);
  if (!firebaseCustomToken || !appUserId) {
    throw new PlatformAuthBridgeError(
      'platform_response_invalid',
      '인증 서버 응답을 확인하지 못했어요.',
      response.status,
    );
  }
  return { firebaseCustomToken, appUserId };
}

function assertDeleted(
  response: Response,
  envelope: PlatformEnvelope,
): void {
  if (!response.ok || envelope.ok !== true) {
    const code = nonEmptyString(envelope.error?.code) ?? 'platform_unavailable';
    const message =
      nonEmptyString(envelope.error?.message) ??
      '인증 서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.';
    throw new PlatformAuthBridgeError(code, message, response.status);
  }
  if (
    !envelope.result ||
    typeof envelope.result !== 'object' ||
    !('deleted' in envelope.result) ||
    envelope.result.deleted !== true
  ) {
    throw new PlatformAuthBridgeError(
      'platform_response_invalid',
      '계정 삭제 응답을 확인하지 못했어요.',
      response.status,
    );
  }
}

export class PlatformFirebaseCustomTokenBridge
  implements FirebaseCustomTokenBridge
{
  readonly #baseUrl: string;
  readonly #appId: string;
  readonly #fetch: typeof fetch;
  readonly #appCheckToken?: () => Promise<string | undefined>;

  constructor(options: PlatformFirebaseCustomTokenBridgeOptions = {}) {
    this.#baseUrl = (
      options.baseUrl ?? PLATFORM_FIREBASE_AUTH_CONFIG.baseUrl
    ).replace(/\/+$/, '');
    this.#appId = options.appId ?? PLATFORM_FIREBASE_AUTH_CONFIG.appId;
    this.#fetch = options.fetch ?? fetch;
    this.#appCheckToken = options.appCheckToken;
  }

  async createFirebaseCustomToken(input: {
    readonly existingFirebaseIdToken?: string;
  }): Promise<FirebaseCustomTokenBridgeResult> {
    const existingFirebaseIdToken = nonEmptyString(
      input.existingFirebaseIdToken,
    );
    const appCheckToken = await resolveAppCheckToken(this.#appCheckToken);
    const response = await this.#fetch(
      `${this.#baseUrl}/v1/auth/firebase-custom-token`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Seori-App': this.#appId,
          ...(appCheckToken
            ? {'X-Firebase-AppCheck': appCheckToken}
            : {}),
        },
        body: JSON.stringify({
          appId: this.#appId,
          ...(existingFirebaseIdToken ? { existingFirebaseIdToken } : {}),
        }),
      },
    );

    let envelope: PlatformEnvelope;
    try {
      envelope = (await response.json()) as PlatformEnvelope;
    } catch {
      throw new PlatformAuthBridgeError(
        'platform_response_invalid',
        '인증 서버 응답을 확인하지 못했어요.',
        response.status,
      );
    }
    return decodeResult(response, envelope);
  }

  async deleteFirebaseAccount(input: {
    readonly firebaseIdToken: string;
  }): Promise<void> {
    const firebaseIdToken = nonEmptyString(input.firebaseIdToken);
    if (!firebaseIdToken) {
      throw new PlatformAuthBridgeError(
        'request_invalid',
        '계정 확인 token이 필요해요.',
        400,
      );
    }
    const appCheckToken = await resolveAppCheckToken(this.#appCheckToken);
    const response = await this.#fetch(
      `${this.#baseUrl}/v1/auth/firebase-account`,
      {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'X-Seori-App': this.#appId,
          ...(appCheckToken
            ? {'X-Firebase-AppCheck': appCheckToken}
            : {}),
        },
        body: JSON.stringify({
          appId: this.#appId,
          firebaseIdToken,
        }),
      },
    );

    let envelope: PlatformEnvelope;
    try {
      envelope = (await response.json()) as PlatformEnvelope;
    } catch {
      throw new PlatformAuthBridgeError(
        'platform_response_invalid',
        '계정 삭제 응답을 확인하지 못했어요.',
        response.status,
      );
    }
    assertDeleted(response, envelope);
  }
}
