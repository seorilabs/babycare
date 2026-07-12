import { generateSafeInviteCode, hashInviteCode } from './invite-crypto.js';
import { InviteServiceError, isInviteServiceError } from './invite-error.js';
import type {
  Clock,
  InviteCodeGenerator,
  InviteRecord,
  InviteRepository,
  MembershipRecord,
} from './types.js';
import {
  normalizeInviteCode,
  requireAuthenticatedUid,
  requirePositiveInteger,
  validateCaregiverRole,
  validateColor,
  validateDisplayName,
  validateGroupId,
} from './validation.js';

const MAX_CODE_GENERATION_ATTEMPTS = 8;

export interface InviteServiceConfig {
  readonly hmacSecret: string;
  readonly inviteTtlMs: number;
  readonly rateLimitWindowMs: number;
  readonly createLimitPerWindow: number;
  readonly acceptLimitPerWindow: number;
}

export interface CreateInviteResult {
  readonly inviteId: string;
  readonly groupId: string;
  readonly code: string;
  readonly createdAt: number;
  readonly expiresAt: number;
}

export class InviteService {
  readonly #repository: InviteRepository;
  readonly #clock: Clock;
  readonly #codeGenerator: InviteCodeGenerator;
  readonly #config: InviteServiceConfig;

  constructor(input: {
    readonly repository: InviteRepository;
    readonly clock: Clock;
    readonly config: InviteServiceConfig;
    readonly codeGenerator?: InviteCodeGenerator;
  }) {
    this.#repository = input.repository;
    this.#clock = input.clock;
    this.#config = {
      ...input.config,
      inviteTtlMs: requirePositiveInteger(input.config.inviteTtlMs, 'inviteTtlMs'),
      rateLimitWindowMs: requirePositiveInteger(
        input.config.rateLimitWindowMs,
        'rateLimitWindowMs',
      ),
      createLimitPerWindow: requirePositiveInteger(
        input.config.createLimitPerWindow,
        'createLimitPerWindow',
      ),
      acceptLimitPerWindow: requirePositiveInteger(
        input.config.acceptLimitPerWindow,
        'acceptLimitPerWindow',
      ),
    };
    hashInviteCode('AAAAAA', this.#config.hmacSecret);
    this.#codeGenerator = input.codeGenerator ?? { generate: generateSafeInviteCode };
  }

  async createInvite(input: {
    readonly groupId: unknown;
    readonly requestedByUid: string;
  }): Promise<CreateInviteResult> {
    const groupId = validateGroupId(input.groupId);
    const requestedByUid = requireAuthenticatedUid(input.requestedByUid);
    const now = this.#clock.now();

    await this.#repository.consumeRateLimit({
      uid: requestedByUid,
      action: 'invite-create',
      now,
      limit: this.#config.createLimitPerWindow,
      windowMs: this.#config.rateLimitWindowMs,
    });

    for (let attempt = 0; attempt < MAX_CODE_GENERATION_ATTEMPTS; attempt += 1) {
      const code = normalizeInviteCode(this.#codeGenerator.generate());
      const codeHash = hashInviteCode(code, this.#config.hmacSecret);
      const record: InviteRecord = {
        inviteId: codeHash,
        codeHash,
        groupId,
        createdByUid: requestedByUid,
        createdAt: now,
        expiresAt: now + this.#config.inviteTtlMs,
        status: 'active',
      };

      try {
        await this.#repository.createInvite({
          requestedByUid,
          record,
        });
        return {
          inviteId: record.inviteId,
          groupId,
          code,
          createdAt: record.createdAt,
          expiresAt: record.expiresAt,
        };
      } catch (error) {
        if (isInviteServiceError(error) && error.code === 'code-collision') {
          continue;
        }
        throw error;
      }
    }

    throw new InviteServiceError(
      'resource-exhausted',
      'Could not allocate a unique invite code',
    );
  }

  async acceptInvite(input: {
    readonly code: unknown;
    readonly acceptedByUid: string;
    readonly displayName: unknown;
    readonly caregiverRole?: unknown;
    readonly color?: unknown;
  }): Promise<MembershipRecord> {
    const acceptedByUid = requireAuthenticatedUid(input.acceptedByUid);
    const code = normalizeInviteCode(input.code);
    const displayName = validateDisplayName(input.displayName);
    const caregiverRole = validateCaregiverRole(input.caregiverRole);
    const color = validateColor(input.color);
    const now = this.#clock.now();

    await this.#repository.consumeRateLimit({
      uid: acceptedByUid,
      action: 'invite-accept',
      now,
      limit: this.#config.acceptLimitPerWindow,
      windowMs: this.#config.rateLimitWindowMs,
    });

    return this.#repository.acceptInvite({
      codeHash: hashInviteCode(code, this.#config.hmacSecret),
      acceptedByUid,
      displayName,
      caregiverRole,
      color,
      now,
    });
  }
}
