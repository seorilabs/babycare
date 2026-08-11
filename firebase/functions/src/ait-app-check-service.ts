import { Agent, request as httpsRequest } from 'node:https';

const APPS_IN_TOSS_BASE_URL = 'https://apps-in-toss-api.toss.im';
const TOKEN_PATH = '/api-partner/v1/apps-in-toss/user/oauth2/generate-token';
const USER_PATH = '/api-partner/v1/apps-in-toss/user/oauth2/login-me';
const MAX_RESPONSE_BYTES = 64 * 1024;

export interface AitAuthorization {
  readonly authorizationCode: string;
  readonly referrer: 'DEFAULT' | 'SANDBOX';
}

interface JsonResponse {
  readonly status: number;
  readonly body: unknown;
}

export interface AitLoginTransport {
  request(input: {
    readonly method: 'GET' | 'POST';
    readonly path: string;
    readonly bearer?: string;
    readonly body?: Readonly<Record<string, string>>;
  }): Promise<JsonResponse>;
}

export class AitAppCheckError extends Error {
  constructor(
    readonly code: 'invalid-request' | 'verification-failed' | 'provider-unavailable',
    message: string,
  ) {
    super(message);
    this.name = 'AitAppCheckError';
  }
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new AitAppCheckError(
      'verification-failed',
      'AppsInToss 로그인 응답이 올바르지 않아요.',
    );
  }
  return value as Record<string, unknown>;
}

function requiredText(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new AitAppCheckError(
      'verification-failed',
      'AppsInToss 로그인 응답이 올바르지 않아요.',
    );
  }
  return value;
}

export function parseAitAuthorization(value: unknown): AitAuthorization {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new AitAppCheckError(
      'invalid-request',
      'AppsInToss 인가 요청이 올바르지 않아요.',
    );
  }
  const input = value as Record<string, unknown>;
  if (
    typeof input.authorizationCode !== 'string' ||
    !input.authorizationCode.trim()
  ) {
    throw new AitAppCheckError(
      'invalid-request',
      'AppsInToss 인가 코드가 올바르지 않아요.',
    );
  }
  const authorizationCode = input.authorizationCode.trim();
  if (authorizationCode.length > 4_096) {
    throw new AitAppCheckError(
      'invalid-request',
      'AppsInToss 인가 코드가 올바르지 않아요.',
    );
  }
  if (input.referrer !== 'DEFAULT' && input.referrer !== 'SANDBOX') {
    throw new AitAppCheckError(
      'invalid-request',
      'AppsInToss 실행 환경이 올바르지 않아요.',
    );
  }
  return { authorizationCode, referrer: input.referrer };
}

export function createAitLoginTransport(input: {
  readonly certificate: string;
  readonly privateKey: string;
  readonly baseUrl?: string;
}): AitLoginTransport {
  const certificate = input.certificate.trim();
  const privateKey = input.privateKey.trim();
  if (!certificate || !privateKey) {
    throw new AitAppCheckError(
      'provider-unavailable',
      'AppsInToss 앱 확인 서비스를 사용할 수 없어요.',
    );
  }
  const baseUrl = new URL(input.baseUrl ?? APPS_IN_TOSS_BASE_URL);
  const agent = new Agent({ cert: certificate, key: privateKey, minVersion: 'TLSv1.2' });

  return {
    request(requestInput) {
      return new Promise<JsonResponse>((resolve, reject) => {
        const serialized = requestInput.body
          ? JSON.stringify(requestInput.body)
          : undefined;
        const headers: Record<string, string> = {
          Accept: 'application/json',
        };
        if (serialized !== undefined) {
          headers['Content-Type'] = 'application/json';
          headers['Content-Length'] = String(Buffer.byteLength(serialized));
        }
        if (requestInput.bearer) {
          headers.Authorization = `Bearer ${requestInput.bearer}`;
        }

        const request = httpsRequest(
          new URL(requestInput.path, baseUrl),
          {
            method: requestInput.method,
            headers,
            agent,
            timeout: 10_000,
          },
          response => {
            const chunks: Buffer[] = [];
            let size = 0;
            response.on('data', (chunk: Buffer | string) => {
              const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
              size += buffer.length;
              if (size > MAX_RESPONSE_BYTES) {
                request.destroy(
                  new AitAppCheckError(
                    'provider-unavailable',
                    'AppsInToss 로그인 응답이 너무 커요.',
                  ),
                );
                return;
              }
              chunks.push(buffer);
            });
            response.on('end', () => {
              try {
                resolve({
                  status: response.statusCode ?? 502,
                  body: JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown,
                });
              } catch {
                reject(
                  new AitAppCheckError(
                    'provider-unavailable',
                    'AppsInToss 로그인 응답을 읽지 못했어요.',
                  ),
                );
              }
            });
          },
        );
        request.on('timeout', () => request.destroy(new Error('timeout')));
        request.on('error', () => {
          reject(
            new AitAppCheckError(
              'provider-unavailable',
              'AppsInToss 로그인 서버에 연결하지 못했어요.',
            ),
          );
        });
        if (serialized !== undefined) {
          request.write(serialized);
        }
        request.end();
      });
    },
  };
}

export async function verifyAitAuthorization(
  authorization: AitAuthorization,
  transport: AitLoginTransport,
): Promise<void> {
  const tokenResponse = await transport.request({
    method: 'POST',
    path: TOKEN_PATH,
    body: {
      authorizationCode: authorization.authorizationCode,
      referrer: authorization.referrer,
    },
  });
  if (tokenResponse.status < 200 || tokenResponse.status >= 300) {
    throw new AitAppCheckError(
      'verification-failed',
      'AppsInToss 로그인을 확인하지 못했어요.',
    );
  }
  const tokenEnvelope = record(tokenResponse.body);
  if (tokenEnvelope.resultType !== 'SUCCESS') {
    throw new AitAppCheckError(
      'verification-failed',
      'AppsInToss 로그인을 확인하지 못했어요.',
    );
  }
  const accessToken = requiredText(record(tokenEnvelope.success).accessToken);

  const userResponse = await transport.request({
    method: 'GET',
    path: USER_PATH,
    bearer: accessToken,
  });
  if (userResponse.status < 200 || userResponse.status >= 300) {
    throw new AitAppCheckError(
      'verification-failed',
      'AppsInToss 사용자를 확인하지 못했어요.',
    );
  }
  const userEnvelope = record(userResponse.body);
  const userKey = record(userEnvelope.success).userKey;
  if (
    userEnvelope.resultType !== 'SUCCESS' ||
    typeof userKey !== 'number' ||
    !Number.isSafeInteger(userKey) ||
    userKey <= 0
  ) {
    throw new AitAppCheckError(
      'verification-failed',
      'AppsInToss 사용자를 확인하지 못했어요.',
    );
  }
}
