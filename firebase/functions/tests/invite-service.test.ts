import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  generateSafeInviteCode,
  hashInviteCode,
  SAFE_INVITE_CODE_PATTERN,
} from '../src/invite-crypto.js';
import { InviteServiceError } from '../src/invite-error.js';
import { toInviteHttpsError } from '../src/https-error.js';
import { InviteService } from '../src/invite-service.js';
import type {
  InviteCodeGenerator,
  InviteRecord,
  InviteRepository,
  MembershipRecord,
} from '../src/types.js';
import {
  requireAuthenticatedUid,
  validateDisplayName,
} from '../src/validation.js';

const HMAC_SECRET = 'test-only-hmac-key-with-at-least-32-bytes';

class SequenceCodeGenerator implements InviteCodeGenerator {
  #index = 0;

  constructor(private readonly codes: readonly string[]) {}

  generate(): string {
    const code = this.codes[this.#index];
    if (!code) {
      throw new Error('No invite code remains in test sequence');
    }
    this.#index += 1;
    return code;
  }
}

class FakeInviteRepository implements InviteRepository {
  readonly rateCalls: Array<Parameters<InviteRepository['consumeRateLimit']>[0]> = [];
  readonly createCalls: Array<Parameters<InviteRepository['createInvite']>[0]> = [];
  readonly acceptCalls: Array<Parameters<InviteRepository['acceptInvite']>[0]> = [];
  collisionsRemaining = 0;
  rateError?: InviteServiceError;

  async consumeRateLimit(
    input: Parameters<InviteRepository['consumeRateLimit']>[0],
  ): Promise<void> {
    this.rateCalls.push(input);
    if (this.rateError) {
      throw this.rateError;
    }
  }

  async createInvite(
    input: Parameters<InviteRepository['createInvite']>[0],
  ): Promise<void> {
    this.createCalls.push(input);
    if (this.collisionsRemaining > 0) {
      this.collisionsRemaining -= 1;
      throw new InviteServiceError('code-collision', 'collision');
    }
  }

  async acceptInvite(
    input: Parameters<InviteRepository['acceptInvite']>[0],
  ): Promise<MembershipRecord> {
    this.acceptCalls.push(input);
    return {
      userId: input.acceptedByUid,
      groupId: 'group-alpha',
      caregiverRole: input.caregiverRole,
      membershipRole: 'member',
      displayName: input.displayName,
      color: input.color,
      joinedAt: input.now,
    };
  }
}

function createService(input: {
  repository?: FakeInviteRepository;
  codes?: readonly string[];
  now?: number;
} = {}) {
  const repository = input.repository ?? new FakeInviteRepository();
  const service = new InviteService({
    repository,
    clock: { now: () => input.now ?? 1_720_000_000_000 },
    codeGenerator: new SequenceCodeGenerator(input.codes ?? ['ABCDEF']),
    config: {
      hmacSecret: HMAC_SECRET,
      inviteTtlMs: 24 * 60 * 60 * 1_000,
      rateLimitWindowMs: 60 * 60 * 1_000,
      createLimitPerWindow: 10,
      acceptLimitPerWindow: 20,
    },
  });
  return { repository, service };
}

describe('invite crypto and auth boundary', () => {
  it('generates ambiguity-safe six-character codes and hashes with domain separation', () => {
    for (let index = 0; index < 100; index += 1) {
      assert.match(generateSafeInviteCode(), SAFE_INVITE_CODE_PATTERN);
    }

    const hash = hashInviteCode('ABCDEF', HMAC_SECRET);
    assert.match(hash, /^[0-9a-f]{64}$/);
    assert.notEqual(hash, 'ABCDEF');
    assert.equal(hash, hashInviteCode('ABCDEF', HMAC_SECRET));
  });

  it('requires a valid authenticated uid', () => {
    assert.equal(requireAuthenticatedUid('owner-1'), 'owner-1');
    assert.throws(
      () => requireAuthenticatedUid(undefined),
      (error) => error instanceof InviteServiceError && error.code === 'unauthenticated',
    );
  });

  it('rejects C0, C1, and bidi control characters in display names', () => {
    for (const unsafeCharacter of [
      '\u0000',
      '\u001F',
      '\u007F',
      '\u009F',
      '\u061C',
      '\u200E',
      '\u200F',
      '\u202A',
      '\u202E',
      '\u2066',
      '\u2069',
    ]) {
      assert.throws(
        () => validateDisplayName(`보호자${unsafeCharacter}위장`),
        (error) => error instanceof InviteServiceError
          && error.code === 'invalid-argument',
      );
    }
  });
});

describe('InviteService', () => {
  it('returns the raw code once but never passes it to persistence', async () => {
    const { repository, service } = createService();

    const result = await service.createInvite({
      groupId: 'group-alpha',
      requestedByUid: 'owner-1',
    });

    assert.equal(result.code, 'ABCDEF');
    assert.equal(result.createdAt, 1_720_000_000_000);
    assert.equal(result.expiresAt, result.createdAt + 24 * 60 * 60 * 1_000);
    assert.equal(repository.rateCalls[0]?.action, 'invite-create');
    const persisted = repository.createCalls[0]?.record;
    assert.ok(persisted);
    assert.equal(persisted.inviteId, hashInviteCode('ABCDEF', HMAC_SECRET));
    assert.equal(persisted.codeHash, persisted.inviteId);
    assert.equal('code' in (persisted as InviteRecord & { code?: string }), false);
  });

  it('retries a code hash collision without consuming the uid rate limit twice', async () => {
    const repository = new FakeInviteRepository();
    repository.collisionsRemaining = 1;
    const { service } = createService({
      repository,
      codes: ['ABCDEF', 'BCDEFG'],
    });

    const result = await service.createInvite({
      groupId: 'group-alpha',
      requestedByUid: 'owner-1',
    });

    assert.equal(result.code, 'BCDEFG');
    assert.equal(repository.rateCalls.length, 1);
    assert.equal(repository.createCalls.length, 2);
  });

  it('normalizes accept input and delegates only the HMAC hash', async () => {
    const { repository, service } = createService();

    const membership = await service.acceptInvite({
      code: ' abcdef ',
      acceptedByUid: 'member-1',
      displayName: '  할머니  ',
      caregiverRole: 'grandparent',
      color: '#4a90e2',
    });

    assert.equal(repository.rateCalls[0]?.action, 'invite-accept');
    assert.equal(repository.acceptCalls[0]?.codeHash, hashInviteCode('ABCDEF', HMAC_SECRET));
    assert.equal(repository.acceptCalls[0]?.displayName, '할머니');
    assert.equal(membership.color, '#4A90E2');
  });

  it('rejects ambiguous codes and propagates per-uid rate limits', async () => {
    const { service } = createService();
    await assert.rejects(
      service.acceptInvite({
        code: 'O0I1AA',
        acceptedByUid: 'member-1',
        displayName: '멤버',
      }),
      (error) => error instanceof InviteServiceError && error.code === 'invalid-argument',
    );

    const repository = new FakeInviteRepository();
    repository.rateError = new InviteServiceError(
      'resource-exhausted',
      'rate limit',
    );
    const limited = createService({ repository }).service;
    await assert.rejects(
      limited.createInvite({ groupId: 'group-alpha', requestedByUid: 'owner-1' }),
      (error) => error instanceof InviteServiceError && error.code === 'resource-exhausted',
    );
  });

  it('maps every accept-state oracle to the same callable error', () => {
    for (const code of [
      'not-found',
      'failed-precondition',
      'already-exists',
      'permission-denied',
    ] as const) {
      const mapped = toInviteHttpsError(
        new InviteServiceError(code, `hidden-${code}`),
        'accept',
      );
      assert.equal(mapped.code, 'failed-precondition');
      assert.equal(mapped.message, 'Invite is invalid or unavailable');
    }
  });
});
