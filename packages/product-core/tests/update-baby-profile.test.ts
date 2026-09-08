import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import {
  babyId,
  createUpdateBabyProfile,
  groupId,
  UpdateBabyProfileError,
  userId,
  type Baby,
  type Membership,
} from '../src/index.ts';

const GROUP = groupId('group-1');
const BABY = babyId('baby-1');
const OWNER = userId('owner-1');
const MEMBER = userId('member-1');
const NOW = new Date('2026-09-08T12:00:00Z').getTime();

function membership(
  id: ReturnType<typeof userId>,
  role: Membership['membershipRole'],
): Membership {
  return {
    userId: id,
    groupId: GROUP,
    caregiverRole: 'parent',
    membershipRole: role,
    displayName: '보호자',
    color: '#5FB49C',
    joinedAt: NOW,
  };
}

const existing: Baby = {
  id: BABY,
  groupId: GROUP,
  name: '하루',
  birthDate: '2026-01-01',
  sex: 'unspecified',
  createdAt: NOW - 1_000,
  updatedAt: NOW - 1_000,
};

function dependencies(options: {
  readonly actor?: Membership;
  readonly baby?: Baby;
  readonly failSave?: boolean;
} = {}) {
  let persisted = options.baby ?? existing;
  const saves: Baby[] = [];
  return {
    get persisted() {
      return persisted;
    },
    saves,
    groups: {
      findMembership: async () => options.actor ?? membership(OWNER, 'owner'),
    },
    babies: {
      findById: async () => options.baby ?? existing,
      save: async (baby: Baby) => {
        saves.push(baby);
        if (options.failSave) {
          throw new Error('persistence unavailable');
        }
        persisted = baby;
      },
    },
    clock: {now: () => NOW},
  };
}

describe('updateBabyProfile', () => {
  it('소유자는 이름과 생년월일을 함께 저장한다', async () => {
    const deps = dependencies();
    const updateBabyProfile = createUpdateBabyProfile(deps);

    const updated = await updateBabyProfile({
      groupId: GROUP,
      babyId: BABY,
      actorId: OWNER,
      name: ' 새봄 ',
      birthDate: '2024-02-29',
    });

    assert.equal(updated.name, '새봄');
    assert.equal(updated.birthDate, '2024-02-29');
    assert.equal(deps.persisted, updated);
  });

  it('비소유자는 직접 호출해도 저장할 수 없다', async () => {
    const deps = dependencies({actor: membership(MEMBER, 'member')});
    const updateBabyProfile = createUpdateBabyProfile(deps);

    await assert.rejects(
      updateBabyProfile({
        groupId: GROUP,
        babyId: BABY,
        actorId: MEMBER,
        name: '새봄',
        birthDate: '2024-02-29',
      }),
      (error: unknown) =>
        error instanceof UpdateBabyProfileError && error.reason === 'not_owner',
    );
    assert.deepEqual(deps.saves, []);
  });

  for (const [name, birthDate, reason] of [
    ['', '2024-02-29', 'name_invalid'],
    ['새봄', '2026-02-29', 'birth_date_invalid'],
    ['새봄', '2026-09-09', 'birth_date_future'],
  ] as const) {
    it(`${reason} 입력을 이유와 함께 거부한다`, async () => {
      const deps = dependencies();
      const updateBabyProfile = createUpdateBabyProfile(deps);

      await assert.rejects(
        updateBabyProfile({
          groupId: GROUP,
          babyId: BABY,
          actorId: OWNER,
          name,
          birthDate,
        }),
        (error: unknown) =>
          error instanceof UpdateBabyProfileError && error.reason === reason,
      );
      assert.deepEqual(deps.saves, []);
    });
  }

  it('저장 실패 시 기존 값을 유지하고 실패를 전달한다', async () => {
    const deps = dependencies({failSave: true});
    const updateBabyProfile = createUpdateBabyProfile(deps);

    await assert.rejects(
      updateBabyProfile({
        groupId: GROUP,
        babyId: BABY,
        actorId: OWNER,
        name: '새봄',
        birthDate: '2024-02-29',
      }),
      /persistence unavailable/,
    );
    assert.equal(deps.persisted, existing);
  });

  it('저장 전에 전체 아기 도메인 불변식을 다시 검증한다', async () => {
    const deps = dependencies({
      baby: {...existing, dueDate: '2026-02-29'},
    });
    const updateBabyProfile = createUpdateBabyProfile(deps);

    await assert.rejects(
      updateBabyProfile({
        groupId: GROUP,
        babyId: BABY,
        actorId: OWNER,
        name: '새봄',
        birthDate: '2024-02-29',
      }),
      /Baby dueDate must be a real YYYY-MM-DD calendar date/,
    );
    assert.deepEqual(deps.saves, []);
  });
});
