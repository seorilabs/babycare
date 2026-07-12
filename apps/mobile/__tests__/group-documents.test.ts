import {
  decodeBaby,
  decodeCareGroup,
  decodeMembership,
} from '../src/adapters/firebase/group-documents';

describe('Firebase group document decoders', () => {
  it('rejects poisoned babyIds and path identity mismatches', () => {
    const group = {
      id: 'group-1',
      name: '지안이네',
      ownerId: 'user-1',
      babyIds: ['baby-1'],
      createdAt: 1,
      updatedAt: 1,
    };
    expect(decodeCareGroup('group-1', group).babyIds).toEqual(['baby-1']);
    expect(() => decodeCareGroup('group-1', {...group, babyIds: ['']})).toThrow(/babyIds/);
    expect(() =>
      decodeCareGroup('group-1', {...group, babyIds: ['baby-1', 'baby-2']}),
    ).toThrow(/babyIds/);
    expect(() => decodeCareGroup('group-2', group)).toThrow(/identity/);
    expect(() => decodeCareGroup('group-1', {...group, poisoned: true})).toThrow(/unexpected/);
    expect(() => decodeCareGroup('group-1', {...group, name: '가족\u2066'})).toThrow(
      /control/,
    );
  });

  it('validates membership and baby domain fields', () => {
    const membership = {
      userId: 'user-1',
      groupId: 'group-1',
      caregiverRole: 'parent',
      membershipRole: 'owner',
      displayName: '엄마',
      color: '#4D9F87',
      joinedAt: 1,
    };
    expect(decodeMembership('group-1', 'user-1', membership).membershipRole).toBe('owner');
    expect(() => decodeMembership('group-1', 'user-1', {...membership, color: 'mint'})).toThrow(/color/);
    expect(() =>
      decodeMembership('group-1', 'user-1', {...membership, displayName: '엄마\n'}),
    ).toThrow(/control/);

    const baby = {
      id: 'baby-1',
      groupId: 'group-1',
      name: '지안',
      birthDate: '2026-04-19',
      sex: 'unspecified',
      createdAt: Date.UTC(2026, 3, 20),
      updatedAt: Date.UTC(2026, 3, 20),
    };
    expect(decodeBaby('group-1', 'baby-1', baby).name).toBe('지안');
    expect(() => decodeBaby('group-1', 'baby-1', {...baby, birthDate: 'April'})).toThrow(/birthDate/);
    expect(() => decodeBaby('group-1', 'baby-1', {...baby, dueDate: 20260419})).toThrow(
      /dueDate/,
    );
    expect(() => decodeBaby('group-1', 'baby-1', {...baby, poisoned: true})).toThrow(
      /unexpected/,
    );
    expect(() =>
      decodeBaby('group-1', 'baby-1', {...baby, birthDate: '2026-02-29'}),
    ).toThrow(/birthDate/);
    expect(() => decodeBaby('group-1', 'baby-1', {...baby, name: '지안\u202E'})).toThrow(
      /control/,
    );
    expect(() =>
      decodeBaby('group-1', 'baby-1', {
        ...baby,
        avatarStoragePath: 'https://example.com/public.png',
      }),
    ).toThrow(/avatarStoragePath/);
    expect(() =>
      decodeBaby('group-1', 'baby-1', {
        ...baby,
        avatarStoragePath: 'groups/group-1/babies/baby-2/avatar.png',
      }),
    ).toThrow(/avatarStoragePath/);
    expect(() =>
      decodeBaby('group-1', 'baby-1', {
        ...baby,
        avatarStoragePath: 'groups/group-1/babies/baby-1/../baby-2/avatar.png',
      }),
    ).toThrow(/avatarStoragePath/);
  });
});
