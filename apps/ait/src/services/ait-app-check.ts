import {Storage, appLogin} from '@apps-in-toss/framework';

const TOKEN_ENDPOINT =
  'https://asia-northeast3-seorilabs-babycare.cloudfunctions.net/mintAitAppCheckToken';
const TOKEN_STORAGE_KEY = 'babynest.app-check-token.v1';
const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1_000;

interface StoredAppCheckToken {
  readonly token: string;
  readonly expireTimeMillis: number;
}

interface StoragePort {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

interface AitAppCheckProviderOptions {
  readonly storage: StoragePort;
  readonly login: typeof appLogin;
  readonly fetch: typeof fetch;
  readonly now: () => number;
}

function decodeToken(value: unknown): StoredAppCheckToken | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.token !== 'string' ||
    !candidate.token.trim() ||
    typeof candidate.expireTimeMillis !== 'number' ||
    !Number.isFinite(candidate.expireTimeMillis)
  ) {
    return undefined;
  }
  return {
    token: candidate.token,
    expireTimeMillis: candidate.expireTimeMillis,
  };
}

async function responseToken(response: Response): Promise<StoredAppCheckToken> {
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    throw new Error('앱 확인 서버 응답을 읽지 못했어요.');
  }
  if (!response.ok) {
    const error =
      value && typeof value === 'object' && 'error' in value
        ? (value.error as Record<string, unknown>)
        : undefined;
    throw new Error(
      typeof error?.message === 'string'
        ? error.message
        : '앱 확인을 완료하지 못했어요. 잠시 후 다시 시도해 주세요.',
    );
  }
  const token = decodeToken(value);
  if (!token) {
    throw new Error('앱 확인 서버 응답을 확인하지 못했어요.');
  }
  return token;
}

export class AitAppCheckProvider {
  readonly #storage: StoragePort;
  readonly #login: typeof appLogin;
  readonly #fetch: typeof fetch;
  readonly #now: () => number;
  #cached: StoredAppCheckToken | undefined;
  #pending: Promise<string> | undefined;

  constructor(options: AitAppCheckProviderOptions) {
    this.#storage = options.storage;
    this.#login = options.login;
    this.#fetch = options.fetch;
    this.#now = options.now;
  }

  async getToken(): Promise<string> {
    const cached = this.#cached ?? (await this.#storedToken());
    if (cached && cached.expireTimeMillis > this.#now() + TOKEN_REFRESH_MARGIN_MS) {
      this.#cached = cached;
      return cached.token;
    }
    this.#pending ??= this.#mintToken().finally(() => {
      this.#pending = undefined;
    });
    return this.#pending;
  }

  async #storedToken(): Promise<StoredAppCheckToken | undefined> {
    const raw = await this.#storage.getItem(TOKEN_STORAGE_KEY);
    if (!raw) {
      return undefined;
    }
    try {
      const token = decodeToken(JSON.parse(raw));
      if (token) {
        return token;
      }
    } catch {
      // 손상된 token cache는 아래에서 제거하고 Toss 검증을 다시 수행한다.
    }
    await this.#storage.removeItem(TOKEN_STORAGE_KEY);
    return undefined;
  }

  async #mintToken(): Promise<string> {
    const {authorizationCode, referrer} = await this.#login();
    const response = await this.#fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({authorizationCode, referrer}),
    });
    const token = await responseToken(response);
    if (token.expireTimeMillis <= this.#now() + TOKEN_REFRESH_MARGIN_MS) {
      throw new Error('앱 확인 token의 유효시간이 너무 짧아요.');
    }
    await this.#storage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(token));
    this.#cached = token;
    return token.token;
  }
}

const provider = new AitAppCheckProvider({
  storage: Storage,
  login: appLogin,
  fetch: (...arguments_) => fetch(...arguments_),
  now: Date.now,
});

export function currentAitAppCheckToken(): Promise<string> {
  return provider.getToken();
}

