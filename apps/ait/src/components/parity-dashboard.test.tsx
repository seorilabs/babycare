import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import {
  babyId,
  groupId,
  userId,
  type Baby,
  type CareGroup,
  type Membership,
} from '../../../../packages/product-core/src/index.ts';

import {ParityDashboard} from './parity-dashboard';
import {MoreScreen} from '../parity/MoreScreen';
import {TabBar} from '../parity/TabBar';
import {
  reloadCareSession,
  updateCareBaby,
  type ReadyCareSession,
} from '../services/babycare-backend';
import {createAitCareEventRuntime} from '../services/care-event-runtime';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({bottom: 0, left: 0, right: 0, top: 0}),
}));

jest.mock('@apps-in-toss/framework', () => ({
  Storage: {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => undefined),
    removeItem: jest.fn(async () => undefined),
  },
}));

jest.mock('../services/babycare-backend', () => ({
  createInviteCode: jest.fn(),
  deleteCareAccount: jest.fn(),
  reloadCareSession: jest.fn(),
  removeCareMember: jest.fn(),
  updateCareBaby: jest.fn(),
}));

jest.mock('../services/care-event-runtime', () => ({
  createAitCareEventRuntime: jest.fn(),
}));

jest.mock('../services/analytics', () => ({
  babycareAnalytics: {track: jest.fn(async () => undefined)},
}));

jest.mock('../services/rewarded-ad', () => ({
  appsInTossRewardedAd: {
    preload: jest.fn(async () => undefined),
    show: jest.fn(async () => ({status: 'unavailable'})),
  },
}));

jest.mock('../services/device-locale', () => ({
  deviceAppLocale: () => 'ko',
}));

const createRuntime = jest.mocked(createAitCareEventRuntime);

function readySessionFixture(now: number): ReadyCareSession {
  const uid = userId('owner-1');
  const group: CareGroup = {
    id: groupId('group-1'),
    name: '하루',
    ownerId: uid,
    babyIds: [babyId('baby-1')],
    createdAt: now,
    updatedAt: now,
  };
  const baby: Baby = {
    id: group.babyIds[0]!,
    groupId: group.id,
    name: '하루',
    birthDate: '2026-01-01',
    sex: 'unspecified',
    createdAt: now,
    updatedAt: now,
  };
  const membership: Membership = {
    userId: uid,
    groupId: group.id,
    caregiverRole: 'other',
    membershipRole: 'owner',
    displayName: '엄마',
    color: '#5FB49C',
    joinedAt: now,
  };
  return {uid, group, baby, membership, memberships: [membership], events: []};
}

describe('ParityDashboard ready session updates', () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    createRuntime.mockResolvedValue({
      observeTimeline: jest.fn(() => jest.fn()),
      observeOverview: jest.fn(observe => {
        observe({events: [], activeSleep: undefined, status: 'server_confirmed'});
        return jest.fn();
      }),
      observeSyncState: jest.fn(() => jest.fn()),
      syncNow: jest.fn(async () => undefined),
      close: jest.fn(async () => undefined),
    } as never);
  });

  afterEach(() => {
    if (renderer) {
      ReactTestRenderer.act(() => renderer?.unmount());
      renderer = undefined;
    }
  });

  it('serializes membership refresh and profile save against the latest session', async () => {
    const now = new Date('2026-09-08T14:00:00+09:00').getTime();
    const initial = readySessionFixture(now);
    const caregiver: Membership = {
      userId: userId('caregiver-2'),
      groupId: initial.group.id,
      caregiverRole: 'other',
      membershipRole: 'member',
      displayName: '아빠',
      color: '#4B8FCC',
      joinedAt: now,
    };
    let releaseRefresh:
      | ((session: ReadyCareSession) => void)
      | undefined;
    jest.mocked(reloadCareSession).mockReturnValue(
      new Promise(resolve => {
        releaseRefresh = resolve;
      }),
    );
    jest.mocked(updateCareBaby).mockImplementation(async (session, input) => ({
      ...session.baby,
      name: input.name,
      birthDate: input.birthDate,
      updatedAt: now + 1,
    }));

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <ParityDashboard initialReady={initial} onDeleted={jest.fn()} />,
      );
      await Promise.resolve();
      await Promise.resolve();
    });
    if (!renderer || !releaseRefresh) {
      throw new Error('AppsInToss 공동 기록 화면을 준비하지 못했어요');
    }

    ReactTestRenderer.act(() => {
      renderer?.root.findByType(TabBar).props.onChange('more');
    });
    const more = renderer.root.findByType(MoreScreen);
    let refreshPromise: Promise<void> | undefined;
    let profilePromise: Promise<void> | undefined;
    ReactTestRenderer.act(() => {
      refreshPromise = more.props.onRefreshMembers();
      profilePromise = more.props.onUpdateBabyProfile({
        name: '새 하루',
        birthDate: '2026-01-02',
      });
    });
    expect(updateCareBaby).not.toHaveBeenCalled();

    await ReactTestRenderer.act(async () => {
      releaseRefresh?.({...initial, memberships: [initial.membership, caregiver]});
      await refreshPromise;
      await profilePromise;
    });

    expect(updateCareBaby).toHaveBeenCalledWith(
      expect.objectContaining({
        memberships: [initial.membership, caregiver],
      }),
      {name: '새 하루', birthDate: '2026-01-02'},
    );
    const updatedMore = renderer.root.findByType(MoreScreen);
    expect(updatedMore.props.memberships).toEqual([
      initial.membership,
      caregiver,
    ]);
    expect(updatedMore.props.session).toMatchObject({
      babyName: '새 하루',
      birthDate: '2026-01-02',
    });
  });
});
