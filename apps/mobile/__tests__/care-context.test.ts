import {
  babyId,
  groupId,
  userId,
  type AuthIdentity,
  type Baby,
  type CareGroup,
  type Membership,
} from '@babycare/product-core';

import {
  assertAuthenticatedCareContext,
  type AuthenticatedCareContext,
} from '../src/app/care-context';

const identity: AuthIdentity = {
  userId: userId('user-1'),
  displayName: '엄마',
  isAnonymous: false,
};
const group: CareGroup = {
  id: groupId('group-1'),
  name: '하루 돌봄',
  ownerId: identity.userId,
  babyIds: [babyId('baby-1')],
  createdAt: 1_000,
  updatedAt: 1_000,
};
const membership: Membership = {
  userId: identity.userId,
  groupId: group.id,
  caregiverRole: 'parent',
  membershipRole: 'owner',
  displayName: identity.displayName,
  color: '#5FB49C',
  joinedAt: 1_000,
};
const baby: Baby = {
  id: group.babyIds[0],
  groupId: group.id,
  name: '하루',
  birthDate: '2026-01-01',
  sex: 'unspecified',
  createdAt: 2_000_000_000_000,
  updatedAt: 2_000_000_000_000,
};
const context: AuthenticatedCareContext = {
  identity,
  group,
  membership,
  baby,
};

describe('authenticated care context', () => {
  it('accepts one identity, membership, group, and baby boundary', () => {
    expect(() => assertAuthenticatedCareContext(context)).not.toThrow();
  });

  it('fails closed on identity, group, and selected-baby mismatches', () => {
    const cases: AuthenticatedCareContext[] = [
      {
        ...context,
        identity: {...identity, userId: userId('user-2')},
      },
      {
        ...context,
        membership: {...membership, groupId: groupId('group-2')},
      },
      {
        ...context,
        baby: {...baby, id: babyId('baby-2')},
      },
    ];

    for (const invalid of cases) {
      expect(() => assertAuthenticatedCareContext(invalid)).toThrow();
    }
  });
});
