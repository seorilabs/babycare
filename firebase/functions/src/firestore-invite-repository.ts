import type { Firestore, Transaction } from 'firebase-admin/firestore';

import { InviteServiceError } from './invite-error.js';
import type {
  InviteRecord,
  InviteRepository,
  MembershipRecord,
} from './types.js';

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isFiniteTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function parseInviteRecord(
  value: FirebaseFirestore.DocumentData,
  expectedCodeHash: string,
): InviteRecord {
  if (
    value.inviteId !== expectedCodeHash
    || value.codeHash !== expectedCodeHash
    || !isNonEmptyString(value.groupId)
    || !isNonEmptyString(value.createdByUid)
    || !isFiniteTimestamp(value.createdAt)
    || !isFiniteTimestamp(value.expiresAt)
    || (value.status !== 'active' && value.status !== 'accepted')
  ) {
    throw new InviteServiceError('internal', 'Stored invite is invalid');
  }

  if (value.status === 'accepted') {
    if (
      !isFiniteTimestamp(value.acceptedAt)
      || !isNonEmptyString(value.acceptedByUid)
    ) {
      throw new InviteServiceError('internal', 'Accepted invite audit data is invalid');
    }
    return {
      inviteId: value.inviteId,
      codeHash: value.codeHash,
      groupId: value.groupId,
      createdByUid: value.createdByUid,
      createdAt: value.createdAt,
      expiresAt: value.expiresAt,
      status: 'accepted',
      acceptedAt: value.acceptedAt,
      acceptedByUid: value.acceptedByUid,
    };
  }

  return {
    inviteId: value.inviteId,
    codeHash: value.codeHash,
    groupId: value.groupId,
    createdByUid: value.createdByUid,
    createdAt: value.createdAt,
    expiresAt: value.expiresAt,
    status: 'active',
  };
}

function parseMembershipRecord(
  value: FirebaseFirestore.DocumentData,
): MembershipRecord {
  if (
    !isNonEmptyString(value.userId)
    || !isNonEmptyString(value.groupId)
    || !isNonEmptyString(value.displayName)
    || !isNonEmptyString(value.color)
    || !isFiniteTimestamp(value.joinedAt)
    || value.membershipRole !== 'member'
    || !['parent', 'grandparent', 'sitter', 'teacher', 'other'].includes(
      value.caregiverRole,
    )
  ) {
    throw new InviteServiceError('internal', 'Stored membership is invalid');
  }

  return value as MembershipRecord;
}

function assertCurrentOwner(
  group: FirebaseFirestore.DocumentData | undefined,
  membership: FirebaseFirestore.DocumentData | undefined,
  uid: string,
  groupId: string,
): void {
  if (
    group?.id !== groupId
    || group?.ownerId !== uid
    || membership?.userId !== uid
    || membership?.groupId !== groupId
    || membership?.membershipRole !== 'owner'
  ) {
    throw new InviteServiceError(
      'permission-denied',
      'Only the current group owner can create invites',
    );
  }
}

export class FirestoreInviteRepository implements InviteRepository {
  constructor(private readonly firestore: Firestore) {}

  async consumeRateLimit(input: {
    readonly uid: string;
    readonly action: 'invite-create' | 'invite-accept';
    readonly now: number;
    readonly limit: number;
    readonly windowMs: number;
  }): Promise<void> {
    const rateLimitRef = this.firestore.doc(
      `functionRateLimits/${input.uid}/actions/${input.action}`,
    );

    await this.firestore.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(rateLimitRef);
      const current = snapshot.data();
      const currentWindowStartedAt = current?.windowStartedAt;
      const currentCount = current?.count;
      const inCurrentWindow = isFiniteTimestamp(currentWindowStartedAt)
        && input.now - currentWindowStartedAt < input.windowMs;

      if (
        inCurrentWindow
        && typeof currentCount === 'number'
        && currentCount >= input.limit
      ) {
        throw new InviteServiceError(
          'resource-exhausted',
          'Invite request rate limit exceeded',
        );
      }

      const windowStartedAt = inCurrentWindow
        ? currentWindowStartedAt
        : input.now;
      const count = inCurrentWindow && Number.isSafeInteger(currentCount)
        ? currentCount + 1
        : 1;

      transaction.set(rateLimitRef, {
        uid: input.uid,
        action: input.action,
        windowStartedAt,
        count,
        updatedAt: input.now,
      });
    });
  }

  async createInvite(input: {
    readonly requestedByUid: string;
    readonly record: InviteRecord;
  }): Promise<void> {
    const groupRef = this.firestore.doc(`groups/${input.record.groupId}`);
    const ownerMemberRef = groupRef.collection('members').doc(input.requestedByUid);
    const inviteRef = this.firestore.doc(`invites/${input.record.inviteId}`);
    const auditRef = this.firestore.doc(
      `auditLogs/invite_create_${input.record.inviteId}`,
    );

    await this.firestore.runTransaction(async (transaction) => {
      const [groupSnapshot, ownerSnapshot, inviteSnapshot] = await Promise.all([
        transaction.get(groupRef),
        transaction.get(ownerMemberRef),
        transaction.get(inviteRef),
      ]);

      assertCurrentOwner(
        groupSnapshot.data(),
        ownerSnapshot.data(),
        input.requestedByUid,
        input.record.groupId,
      );
      if (inviteSnapshot.exists) {
        throw new InviteServiceError('code-collision', 'Invite code hash already exists');
      }

      transaction.create(inviteRef, input.record);
      transaction.create(auditRef, {
        id: auditRef.id,
        action: 'invite.create',
        actorUid: input.requestedByUid,
        groupId: input.record.groupId,
        inviteId: input.record.inviteId,
        occurredAt: input.record.createdAt,
      });
    });
  }

  async acceptInvite(input: {
    readonly codeHash: string;
    readonly acceptedByUid: string;
    readonly displayName: string;
    readonly caregiverRole: MembershipRecord['caregiverRole'];
    readonly color: string;
    readonly now: number;
  }): Promise<MembershipRecord> {
    const inviteRef = this.firestore.doc(`invites/${input.codeHash}`);

    return this.firestore.runTransaction(async (transaction) => {
      const inviteSnapshot = await transaction.get(inviteRef);
      if (!inviteSnapshot.exists) {
        throw new InviteServiceError('not-found', 'Invite is invalid or unavailable');
      }

      const invite = parseInviteRecord(
        inviteSnapshot.data() ?? {},
        input.codeHash,
      );
      const memberRef = this.firestore.doc(
        `groups/${invite.groupId}/members/${input.acceptedByUid}`,
      );

      if (invite.status === 'accepted') {
        if (invite.acceptedByUid !== input.acceptedByUid) {
          throw new InviteServiceError(
            'failed-precondition',
            'Invite is invalid or unavailable',
          );
        }
        const acceptedMembership = await transaction.get(memberRef);
        if (!acceptedMembership.exists) {
          throw new InviteServiceError(
            'failed-precondition',
            'Accepted invite membership is unavailable',
          );
        }
        return parseMembershipRecord(acceptedMembership.data() ?? {});
      }

      if (invite.expiresAt <= input.now) {
        throw new InviteServiceError(
          'failed-precondition',
          'Invite is invalid or unavailable',
        );
      }

      const groupRef = this.firestore.doc(`groups/${invite.groupId}`);
      const groupSnapshot = await transaction.get(groupRef);
      if (!groupSnapshot.exists) {
        throw new InviteServiceError(
          'failed-precondition',
          'Invite is invalid or unavailable',
        );
      }

      const currentOwnerUid = groupSnapshot.data()?.ownerId;
      if (!isNonEmptyString(currentOwnerUid) || currentOwnerUid !== invite.createdByUid) {
        throw new InviteServiceError(
          'failed-precondition',
          'Invite is invalid or unavailable',
        );
      }

      const currentOwnerRef = groupRef.collection('members').doc(currentOwnerUid);
      const [currentOwnerSnapshot, existingMemberSnapshot] = await Promise.all([
        transaction.get(currentOwnerRef),
        transaction.get(memberRef),
      ]);
      assertCurrentOwner(
        groupSnapshot.data(),
        currentOwnerSnapshot.data(),
        currentOwnerUid,
        invite.groupId,
      );
      if (existingMemberSnapshot.exists) {
        throw new InviteServiceError(
          'already-exists',
          'User already belongs to this group',
        );
      }

      const membership: MembershipRecord = {
        userId: input.acceptedByUid,
        groupId: invite.groupId,
        caregiverRole: input.caregiverRole,
        membershipRole: 'member',
        displayName: input.displayName,
        color: input.color,
        joinedAt: input.now,
      };
      const auditRef = this.firestore.doc(
        `auditLogs/invite_accept_${invite.inviteId}`,
      );

      transaction.create(memberRef, membership);
      transaction.update(inviteRef, {
        status: 'accepted',
        acceptedAt: input.now,
        acceptedByUid: input.acceptedByUid,
      });
      transaction.create(auditRef, {
        id: auditRef.id,
        action: 'invite.accept',
        actorUid: input.acceptedByUid,
        invitedByUid: invite.createdByUid,
        targetUid: input.acceptedByUid,
        groupId: invite.groupId,
        inviteId: invite.inviteId,
        occurredAt: input.now,
      });

      return membership;
    });
  }
}
