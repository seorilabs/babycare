import {
  babyId,
  groupId,
  userId,
  type AuthIdentity,
  type AuthPort,
  type Baby,
  type BabyRepositoryPort,
  type CareGroup,
  type CareGroupRepositoryPort,
  type InviteServicePort,
  type Membership,
} from '@babycare/product-core';

import {
  createOwnerFirebaseSession,
  firebaseSessionView,
  joinFirebaseSession,
  restoreFirebaseSession,
  type CareDocumentIdFactory,
  type FirebaseSessionServices,
} from '../src/app/firebase-session';

const now = Date.UTC(2026, 6, 14, 3);
const identity: AuthIdentity = {
  userId: userId('caregiver-1'),
  displayName: 'Firebase 사용자',
  isAnonymous: false,
};
const group: CareGroup = {
  id: groupId('group-1'),
  name: '하루',
  ownerId: identity.userId,
  babyIds: [babyId('baby-1')],
  createdAt: now,
  updatedAt: now,
};
const membership: Membership = {
  userId: identity.userId,
  groupId: group.id,
  caregiverRole: 'other',
  membershipRole: 'owner',
  displayName: '엄마',
  color: '#5FB49C',
  joinedAt: now,
};
const baby: Baby = {
  id: group.babyIds[0]!,
  groupId: group.id,
  name: '하루',
  birthDate: '2026-07-13',
  sex: 'unspecified',
  createdAt: now,
  updatedAt: now,
};

function setup(overrides: {
  readonly currentIdentity?: AuthIdentity;
  readonly groups?: readonly CareGroup[];
  readonly selectedMembership?: Membership;
  readonly babies?: readonly Baby[];
  readonly memberships?: readonly Membership[];
} = {}) {
  const currentUser = jest.fn(async () => overrides.currentIdentity);
  const signInWithoutAccount = jest.fn(async () => identity);
  const auth: AuthPort = {
    currentUser,
    verifyCurrentUser: jest.fn(async () => overrides.currentIdentity),
    signInWithoutAccount,
    signOut: jest.fn(async () => undefined),
    observe: jest.fn(() => () => undefined),
  };

  const createOwnerGroup = jest.fn(async () => undefined);
  const findById = jest.fn(async () => group);
  const listForUser = jest.fn(async () => overrides.groups ?? []);
  const findMembership = jest.fn(
    async () => overrides.selectedMembership ?? membership,
  );
  const listMemberships = jest.fn(
    async () => overrides.memberships ?? [membership],
  );
  const groups: CareGroupRepositoryPort = {
    createOwnerGroup,
    findById,
    listForUser,
    findMembership,
    observeMembership: jest.fn(() => () => undefined),
    listMemberships,
  };

  const listBabies = jest.fn(async () => overrides.babies ?? [baby]);
  const babies: BabyRepositoryPort = {
    list: listBabies,
    findById: jest.fn(async () => baby),
    save: jest.fn(async () => undefined),
  };

  const acceptInvite = jest.fn(async () => membership);
  const invites: InviteServicePort = {
    createInvite: jest.fn(async () => {
      throw new Error('not used');
    }),
    acceptInvite,
  };
  const nextDocumentId = jest.fn((prefix: 'group' | 'baby') =>
    prefix === 'group' ? 'created-group' : 'created-baby',
  );
  const documentIds: CareDocumentIdFactory = {next: nextDocumentId};
  const services: FirebaseSessionServices = {
    auth,
    groups,
    babies,
    invites,
    clock: {now: () => now},
    documentIds,
  };

  return {
    acceptInvite,
    createOwnerGroup,
    currentUser,
    findById,
    findMembership,
    listBabies,
    listForUser,
    nextDocumentId,
    services,
    signInWithoutAccount,
  };
}

describe('Firebase session bootstrap', () => {
  it('restores signed-out and group-setup states without inventing a session', async () => {
    const signedOut = setup();
    await expect(restoreFirebaseSession(signedOut.services)).resolves.toEqual({
      kind: 'signed_out',
    });
    expect(signedOut.listForUser).not.toHaveBeenCalled();

    const needsGroup = setup({currentIdentity: identity});
    await expect(restoreFirebaseSession(needsGroup.services)).resolves.toEqual({
      kind: 'needs_group',
      identity,
    });
    expect(needsGroup.listForUser).toHaveBeenCalledWith(identity.userId);
  });

  it('migrates a legacy anonymous Firebase uid through the auth bridge before restore', async () => {
    const legacyIdentity: AuthIdentity = {...identity, isAnonymous: true};
    const state = setup({currentIdentity: legacyIdentity});

    await expect(restoreFirebaseSession(state.services)).resolves.toEqual({
      kind: 'needs_group',
      identity,
    });
    expect(state.signInWithoutAccount).toHaveBeenCalledTimes(1);
    expect(state.listForUser).toHaveBeenCalledWith(identity.userId);
  });

  it('restores one authoritative group with its membership, baby, and caregivers', async () => {
    const state = setup({
      currentIdentity: identity,
      groups: [group],
      memberships: [membership],
    });

    await expect(restoreFirebaseSession(state.services)).resolves.toEqual({
      kind: 'ready',
      context: {identity, group, membership, baby},
      memberships: [membership],
    });
    expect(state.findMembership).toHaveBeenCalledWith(group.id, identity.userId);
    expect(state.listBabies).toHaveBeenCalledWith(group.id);
  });

  it('fails closed instead of silently choosing between multiple groups', async () => {
    const secondGroup: CareGroup = {
      ...group,
      id: groupId('group-2'),
      babyIds: [babyId('baby-2')],
    };
    const state = setup({currentIdentity: identity, groups: [group, secondGroup]});

    await expect(restoreFirebaseSession(state.services)).rejects.toThrow(
      '여러 돌봄 그룹 중 사용할 그룹을 선택해야 해요',
    );
    expect(state.findMembership).not.toHaveBeenCalled();
  });

  it('rejects an incomplete group/baby projection during restore', async () => {
    const unrelatedBaby: Baby = {
      ...baby,
      id: babyId('baby-outside-group'),
    };
    const state = setup({
      currentIdentity: identity,
      groups: [group],
      babies: [unrelatedBaby],
    });

    await expect(restoreFirebaseSession(state.services)).rejects.toThrow(
      '돌봄 그룹 정보를 완전하게 불러오지 못했어요',
    );
  });
});

describe('Firebase owner and invite session creation', () => {
  it('signs in, creates one owner/group/baby boundary, and exposes a Firebase view', async () => {
    const state = setup();

    const ready = await createOwnerFirebaseSession(state.services, {
      caregiverName: '  엄마  ',
      babyName: '  하루  ',
      birthDate: '2026-07-13',
    });

    expect(state.signInWithoutAccount).toHaveBeenCalledTimes(1);
    expect(state.listForUser).toHaveBeenCalledWith(identity.userId);
    expect(state.nextDocumentId.mock.calls).toEqual([['group'], ['baby']]);
    expect(state.createOwnerGroup).toHaveBeenCalledWith({
      group: {
        id: groupId('created-group'),
        name: '하루',
        ownerId: identity.userId,
        babyIds: [babyId('created-baby')],
        createdAt: now,
        updatedAt: now,
      },
      ownerMembership: {
        userId: identity.userId,
        groupId: groupId('created-group'),
        caregiverRole: 'other',
        membershipRole: 'owner',
        displayName: '엄마',
        color: '#5FB49C',
        joinedAt: now,
      },
      baby: {
        id: babyId('created-baby'),
        groupId: groupId('created-group'),
        name: '하루',
        birthDate: '2026-07-13',
        sex: 'unspecified',
        createdAt: now,
        updatedAt: now,
      },
    });
    expect(firebaseSessionView(ready)).toMatchObject({
      groupId: groupId('created-group'),
      babyId: babyId('created-baby'),
      caregiverId: identity.userId,
      caregiverName: '엄마',
      babyName: '하루',
      runtimeMode: 'firebase',
      membershipRole: 'owner',
    });
  });

  it('restores a remotely created group instead of duplicating it on retry', async () => {
    const state = setup({currentIdentity: identity, groups: [group]});

    await expect(
      createOwnerFirebaseSession(state.services, {
        caregiverName: '엄마',
        babyName: '하루',
        birthDate: '2026-07-13',
      }),
    ).resolves.toEqual({
      context: {identity, group, membership, baby},
      memberships: [membership],
    });
    expect(state.createOwnerGroup).not.toHaveBeenCalled();
    expect(state.nextDocumentId).not.toHaveBeenCalled();
  });

  it('rejects an invalid birth date before authenticating or writing', async () => {
    const state = setup();

    await expect(
      createOwnerFirebaseSession(state.services, {
        caregiverName: '엄마',
        babyName: '하루',
        birthDate: '2026-02-30',
      }),
    ).rejects.toThrow('아기 생년월일을 YYYY-MM-DD 형식으로 확인해 주세요');
    expect(state.signInWithoutAccount).not.toHaveBeenCalled();
    expect(state.createOwnerGroup).not.toHaveBeenCalled();
  });

  it('normalizes an invite code and resolves the accepted group authoritatively', async () => {
    const ownerIdentity = userId('owner-1');
    const joinedGroup: CareGroup = {...group, ownerId: ownerIdentity};
    const joinedMembership: Membership = {
      ...membership,
      membershipRole: 'member',
      displayName: '아빠',
    };
    const ownerMembership: Membership = {
      ...membership,
      userId: ownerIdentity,
      membershipRole: 'owner',
    };
    const state = setup({
      currentIdentity: identity,
      selectedMembership: joinedMembership,
      memberships: [ownerMembership, joinedMembership],
    });
    state.findById.mockResolvedValueOnce(joinedGroup);
    state.acceptInvite.mockResolvedValueOnce(joinedMembership);

    const ready = await joinFirebaseSession(state.services, {
      caregiverName: '  아빠 ',
      code: 'abc234',
    });

    expect(state.signInWithoutAccount).not.toHaveBeenCalled();
    expect(state.acceptInvite).toHaveBeenCalledWith({
      code: 'ABC234',
      userId: identity.userId,
      displayName: '아빠',
    });
    expect(state.findById).toHaveBeenCalledWith(joinedMembership.groupId);
    expect(ready).toEqual({
      context: {
        identity,
        group: joinedGroup,
        membership: joinedMembership,
        baby,
      },
      memberships: [ownerMembership, joinedMembership],
    });
  });
});
