import AsyncStorage from '@react-native-async-storage/async-storage';
import React from 'react';
import {Alert, SectionList, Text} from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import {
  babyId,
  createCareEvent,
  eventId,
  groupId,
  userId,
  type AuthIdentity,
  type Baby,
  type CareGroup,
  type Membership,
} from '@babycare/product-core';

import {
  bootstrapFirebaseRuntime,
  type FirebaseCareEventRuntimeCallbacks,
  type FirebaseRuntime,
} from '../src/app/firebase-runtime';
import type {ReadyFirebaseSession} from '../src/app/firebase-session';
import {CloudCareContextHydrationError} from '../src/adapters/local/cloud-care-context-cache';
import {
  FirebaseBabyCareApp,
  FirebaseCareDashboard,
} from '../src/app/FirebaseBabyCareApp';

jest.mock('@react-native-async-storage/async-storage', () => ({
  clear: jest.fn(async () => undefined),
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

jest.mock('react-native-safe-area-context', () => {
  const ReactModule = jest.requireActual<typeof React>('react');
  const {View} = jest.requireActual<typeof import('react-native')>(
    'react-native',
  );
  return {
    SafeAreaView: ({
      children,
      ...props
    }: React.ComponentProps<typeof View>) =>
      ReactModule.createElement(View, props, children),
    useSafeAreaInsets: () => ({bottom: 0, left: 0, right: 0, top: 0}),
  };
});

jest.mock('../src/app/firebase-runtime', () => ({
  bootstrapFirebaseRuntime: jest.fn(),
}));

const bootstrap = jest.mocked(bootstrapFirebaseRuntime);
type DashboardContainer = React.ComponentProps<
  typeof FirebaseCareDashboard
>['container'];

function visibleText(renderer: ReactTestRenderer.ReactTestRenderer): string {
  const read = (value: unknown): string =>
    Array.isArray(value)
      ? value.map(read).join('')
      : typeof value === 'string' || typeof value === 'number'
        ? String(value)
        : '';
  return renderer.root
    .findAllByType(Text)
    .map(node => read(node.props.children))
    .join(' ');
}

function readySessionFixture(now: number) {
  const identity: AuthIdentity = {
    userId: userId('owner-1'),
    displayName: '엄마',
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
    birthDate: '2026-01-01',
    sex: 'unspecified',
    createdAt: now,
    updatedAt: now,
  };
  const ready: ReadyFirebaseSession = {
    context: {identity, group, membership, baby},
    memberships: [membership],
  };
  return {baby, group, identity, membership, ready};
}

function emptyCareContainer(): DashboardContainer {
  return {
    overviewFeed: {
      start: (
        observe: Parameters<DashboardContainer['overviewFeed']['start']>[0],
      ) => {
        observe({
          events: [],
          activeSleep: undefined,
          status: 'server_confirmed',
        });
        return jest.fn();
      },
      refresh: jest.fn(async () => undefined),
    },
    timelineFeed: {
      start: (
        observe: Parameters<DashboardContainer['timelineFeed']['start']>[0],
      ) => {
        observe({
          events: [],
          hasMore: false,
          loadingMore: false,
          loadMoreError: undefined,
          capped: false,
        });
        return jest.fn();
      },
      loadMore: jest.fn(async () => undefined),
      retryLoadMore: jest.fn(async () => undefined),
      refresh: jest.fn(async () => undefined),
    },
    observeSyncState: jest.fn(() => jest.fn()),
    dispose: jest.fn(async () => undefined),
    softDeleteCareEvent: jest.fn(async () => undefined),
    endSleepSession: jest.fn(async () => undefined),
    syncNow: jest.fn(async () => undefined),
    recordCareEvent: jest.fn(),
  } as unknown as DashboardContainer;
}

describe('FirebaseBabyCareApp product copy', () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

  afterEach(() => {
    if (renderer) {
      ReactTestRenderer.act(() => renderer?.unmount());
      renderer = undefined;
    }
    bootstrap.mockReset();
  });

  it('describes loading in product language without exposing the backend', () => {
    bootstrap.mockReturnValue(new Promise(() => undefined));

    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(<FirebaseBabyCareApp />);
    });
    if (!renderer) {
      throw new Error('Firebase 제품 화면을 렌더링하지 못했어요');
    }

    expect(visibleText(renderer)).toContain('계정과 돌봄 그룹을 확인합니다');
    expect(visibleText(renderer)).not.toContain('Firebase');
  });

  it('hides technical details when startup fails', async () => {
    bootstrap.mockRejectedValue(
      new Error(
        'Firebase native client configuration is missing from this release build',
      ),
    );

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(<FirebaseBabyCareApp />);
      await Promise.resolve();
      await Promise.resolve();
    });
    if (!renderer) {
      throw new Error('Firebase 오류 화면을 렌더링하지 못했어요');
    }

    expect(visibleText(renderer)).toContain('공동 기록을 시작하지 못했어요');
    expect(visibleText(renderer)).not.toContain('native client configuration');
    expect(visibleText(renderer)).not.toContain('Firebase');
  });

  it(
    'hides cache schema details after recovering a damaged session',
    async () => {
      const now = new Date('2026-08-04T04:00:00+09:00').getTime();
      const {baby, group, identity, membership} = readySessionFixture(now);
      const container = emptyCareContainer();
      jest
        .mocked(AsyncStorage.getItem)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(
          JSON.stringify({
            version: 1,
            context: 'internal-context-schema',
            memberships: [],
          }),
        );
      const runtime = {
        kind: 'firebase',
        mode: 'cloud',
        label: 'Firebase Cloud',
        source: 'native',
        sessionServices: {
          auth: {currentUser: jest.fn(async () => identity)},
          groups: {
            listForUser: jest.fn(async () => [group]),
            findMembership: jest.fn(async () => membership),
            listMemberships: jest.fn(async () => [membership]),
          },
          babies: {list: jest.fn(async () => [baby])},
        },
        createCareContainer: jest.fn(async () => container),
        refreshMemberships: jest.fn(async () => [membership]),
      } as unknown as FirebaseRuntime;
      bootstrap.mockResolvedValue(runtime);

      await ReactTestRenderer.act(async () => {
        renderer = ReactTestRenderer.create(<FirebaseBabyCareApp />);
        for (let count = 0; count < 12; count += 1) {
          await Promise.resolve();
        }
      });
      if (!renderer) {
        throw new Error('손상된 공동 기록 세션을 복구하지 못했어요');
      }

      expect(visibleText(renderer)).toContain(
        '저장된 공동 돌봄 정보를 새로 불러왔어요',
      );
      expect(visibleText(renderer)).not.toContain('context');
      expect(visibleText(renderer)).not.toContain('현재 형식');
      expect(AsyncStorage.removeItem).toHaveBeenCalled();
      const dashboard = renderer.root.findByType(FirebaseCareDashboard);
      expect(dashboard.props.runtimeError.cause).toBeInstanceOf(
        CloudCareContextHydrationError,
      );
    },
    15_000,
  );

  it('hides technical details when session recovery or revoked-cache cleanup fails', async () => {
    const now = new Date('2026-08-04T00:00:00+09:00').getTime();
    const {baby, group, identity, membership} = readySessionFixture(now);
    const container = emptyCareContainer();
    let lifecycleCallbacks: FirebaseCareEventRuntimeCallbacks | undefined;
    const runtime = {
      kind: 'firebase',
      mode: 'cloud',
      label: 'Firebase Cloud',
      source: 'native',
      sessionServices: {
        auth: {currentUser: jest.fn(async () => identity)},
        groups: {
          listForUser: jest.fn(async () => [group]),
          findMembership: jest.fn(async () => membership),
          listMemberships: jest.fn(async () => [membership]),
        },
        babies: {list: jest.fn(async () => [baby])},
      },
      createCareContainer: jest.fn(
        async (
          _ready: ReadyFirebaseSession,
          callbacks: FirebaseCareEventRuntimeCallbacks,
        ) => {
          lifecycleCallbacks = callbacks;
          return container;
        },
      ),
      refreshMemberships: jest.fn(async () => [membership]),
    } as unknown as FirebaseRuntime;
    bootstrap.mockResolvedValue(runtime);

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(<FirebaseBabyCareApp />);
      for (let count = 0; count < 12; count += 1) {
        await Promise.resolve();
      }
    });
    if (!renderer || !lifecycleCallbacks) {
      throw new Error('공동 기록 세션 화면을 준비하지 못했어요');
    }

    const technicalError = new Error(
      '[firestore/unavailable] Membership verification failed.',
    );
    ReactTestRenderer.act(() => lifecycleCallbacks?.onError(technicalError));

    expect(visibleText(renderer)).toContain(
      '공동 기록 연결 상태를 확인하지 못했어요',
    );
    expect(visibleText(renderer)).not.toContain('firestore');
    expect(visibleText(renderer)).not.toContain('Membership verification');
    const dashboard = renderer.root.findByType(FirebaseCareDashboard);
    expect(dashboard.props.runtimeError.cause).toBe(technicalError);

    const purgeTechnicalError = new Error(
      '[storage/unavailable] Failed to remove @babycare/cloud-care-context/v1.',
    );
    jest
      .mocked(AsyncStorage.removeItem)
      .mockRejectedValueOnce(purgeTechnicalError);
    await ReactTestRenderer.act(async () => {
      lifecycleCallbacks?.onRevoked('membership_removed');
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(visibleText(renderer)).toContain(
      '해제된 공동 돌봄 정보를 기기에서 지우지 못했어요',
    );
    expect(visibleText(renderer)).not.toContain('storage/unavailable');
    expect(visibleText(renderer)).not.toContain('cloud-care-context');
  });

  it('hides technical details when runtime operations fail', async () => {
    const now = new Date('2026-08-03T16:00:00+09:00').getTime();
    const {baby, group, identity, ready} = readySessionFixture(now);
    const event = createCareEvent(
      {
        groupId: group.id,
        babyId: baby.id,
        caregiverId: identity.userId,
        kind: 'diaper',
        diaperType: 'wet',
        occurredAt: now - 60_000,
      },
      {id: eventId('event-delete-failure'), now},
    );
    const activeSleep = createCareEvent(
      {
        groupId: group.id,
        babyId: baby.id,
        caregiverId: identity.userId,
        kind: 'sleep',
        sleepType: 'night',
        startedAt: now - 30 * 60_000,
      },
      {id: eventId('sleep-stop-failure'), now},
    );
    const deleteTechnicalMessage =
      '[firestore/unavailable] The service is currently unavailable.';
    const softDeleteCareEvent = jest.fn(async () => {
      throw new Error(deleteTechnicalMessage);
    });
    const sleepTechnicalMessage =
      '[firestore/aborted] The active sleep transaction was aborted.';
    const endSleepSession = jest.fn(async () => {
      throw new Error(sleepTechnicalMessage);
    });
    const onRuntimeError = jest.fn();
    let observeOverview:
      | Parameters<DashboardContainer['overviewFeed']['start']>[0]
      | undefined;
    let observeSyncState:
      | Parameters<DashboardContainer['observeSyncState']>[0]
      | undefined;
    const refreshOverview = jest.fn(async () => undefined);
    const refreshTimeline = jest.fn(async () => undefined);
    const syncNow = jest.fn(async () => undefined);
    const container = {
      overviewFeed: {
        start: (observe: (value: unknown) => void) => {
          observeOverview = observe as typeof observeOverview;
          observe({
            events: [event, activeSleep],
            activeSleep,
            status: 'server_confirmed',
          });
          return jest.fn();
        },
        refresh: refreshOverview,
      },
      timelineFeed: {
        start: (observe: (value: unknown) => void) => {
          observe({
            events: [event],
            hasMore: false,
            loadingMore: false,
            loadMoreError: undefined,
            capped: false,
          });
          return jest.fn();
        },
        loadMore: jest.fn(async () => undefined),
        retryLoadMore: jest.fn(async () => undefined),
        refresh: refreshTimeline,
      },
      observeSyncState: jest.fn((observe: typeof observeSyncState) => {
        observeSyncState = observe;
        return jest.fn();
      }),
      dispose: jest.fn(async () => undefined),
      softDeleteCareEvent,
      endSleepSession,
      syncNow,
      recordCareEvent: jest.fn(async () => event),
    } as unknown as DashboardContainer;
    const alert = jest.spyOn(Alert, 'alert').mockImplementation();

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <FirebaseCareDashboard
          container={container}
          onInvite={async () => undefined}
          onDeleteAccount={async () => undefined}
          onRefreshMembers={async () => undefined}
          onRuntimeError={onRuntimeError}
          ready={ready}
          runtime={{} as React.ComponentProps<typeof FirebaseCareDashboard>['runtime']}
        />,
      );
      await Promise.resolve();
    });
    if (!renderer) {
      throw new Error('공동 기록 화면을 렌더링하지 못했어요');
    }

    const timelineTab = renderer.root
      .findAll(node => node.props.accessibilityRole === 'tab')
      .find(node =>
        node
          .findAllByType(Text)
          .some(text => text.props.children === '타임라인'),
      );
    if (!timelineTab) {
      throw new Error('타임라인 탭을 찾지 못했어요');
    }
    ReactTestRenderer.act(() => timelineTab.props.onPress());

    const list = renderer.root.findByType(SectionList);
    const section = list.props.sections[0];
    const row = list.props.renderItem({index: 0, item: event, section});
    ReactTestRenderer.act(() => row.props.onLongPress());
    const confirmationActions = alert.mock.calls[0]![2]!;
    const deleteAction = confirmationActions.find(
      action => action.style === 'destructive',
    );
    await ReactTestRenderer.act(async () => {
      deleteAction?.onPress?.();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(softDeleteCareEvent).toHaveBeenCalledTimes(1);
    expect(alert).toHaveBeenLastCalledWith(
      '삭제할 수 없어요',
      '기록을 삭제하지 못했어요. 연결을 확인하고 다시 시도해 주세요.',
    );
    const reportedError = onRuntimeError.mock.calls.at(-1)?.[0] as
      | Error
      | undefined;
    expect(reportedError?.message).toBe(
      '기록을 삭제하지 못했어요. 연결을 확인하고 다시 시도해 주세요.',
    );
    expect(JSON.stringify(alert.mock.calls)).not.toContain(
      deleteTechnicalMessage,
    );
    expect(reportedError?.message).not.toContain('firestore');

    const homeTab = renderer.root
      .findAll(node => node.props.accessibilityRole === 'tab')
      .find(node =>
        node.findAllByType(Text).some(text => text.props.children === '홈'),
      );
    if (!homeTab) {
      throw new Error('홈 탭을 찾지 못했어요');
    }
    ReactTestRenderer.act(() => homeTab.props.onPress());
    ReactTestRenderer.act(() =>
      renderer?.root.findByProps({accessibilityLabel: '수면 종료'}).props.onPress(),
    );
    await ReactTestRenderer.act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(endSleepSession).toHaveBeenCalledTimes(1);
    expect(alert).toHaveBeenLastCalledWith(
      '수면을 종료할 수 없어요',
      '수면을 종료하지 못했어요. 연결을 확인하고 다시 시도해 주세요.',
    );
    const sleepError = onRuntimeError.mock.calls.at(-1)?.[0] as
      | Error
      | undefined;
    expect(sleepError?.message).toBe(
      '수면을 종료하지 못했어요. 연결을 확인하고 다시 시도해 주세요.',
    );
    expect(JSON.stringify(alert.mock.calls)).not.toContain(
      sleepTechnicalMessage,
    );

    const overviewTechnicalMessage =
      '[firestore/permission-denied] Missing or insufficient permissions.';
    const overviewCause = new Error(overviewTechnicalMessage);
    ReactTestRenderer.act(() => {
      observeOverview?.({
        events: [],
        activeSleep: undefined,
        status: 'error',
        error: {
          code: 'permission_denied',
          cause: overviewCause,
        },
      });
    });
    expect(onRuntimeError).toHaveBeenLastCalledWith(
      expect.objectContaining({
        message: '공동 기록을 새로 불러오지 못했어요',
      }),
    );
    expect(
      (onRuntimeError.mock.calls.at(-1)?.[0] as Error).message,
    ).not.toContain('firestore');
    expect(
      (onRuntimeError.mock.calls.at(-1)?.[0] as Error & {cause?: unknown})
        .cause,
    ).toBe(overviewCause);

    const refreshTechnicalMessage =
      '[firestore/unavailable] Failed to refresh the shared timeline.';
    const refreshCause = new Error(refreshTechnicalMessage);
    refreshOverview.mockRejectedValueOnce(refreshCause);
    await ReactTestRenderer.act(async () => {
      renderer?.update(
        <FirebaseCareDashboard
          container={container}
          onInvite={async () => undefined}
          onDeleteAccount={async () => undefined}
          onRefreshMembers={async () => undefined}
          onRuntimeError={onRuntimeError}
          ready={ready}
          runtime={{} as React.ComponentProps<typeof FirebaseCareDashboard>['runtime']}
          runtimeError={new Error('공동 기록을 새로 불러오지 못했어요')}
        />,
      );
      await Promise.resolve();
    });
    const refreshText = renderer.root
      .findAllByType(Text)
      .find(text => text.props.children === '새로고침');
    let refreshButton = refreshText?.parent;
    while (refreshButton && typeof refreshButton.props.onPress !== 'function') {
      refreshButton = refreshButton.parent;
    }
    if (!refreshButton) {
      throw new Error('공동 기록 새로고침 버튼을 찾지 못했어요');
    }
    await ReactTestRenderer.act(async () => {
      refreshButton.props.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(onRuntimeError).toHaveBeenLastCalledWith(
      expect.objectContaining({
        message: '공동 기록을 새로 불러오지 못했어요',
      }),
    );
    expect(
      (onRuntimeError.mock.calls.at(-1)?.[0] as Error).message,
    ).not.toContain('firestore');
    expect(
      (onRuntimeError.mock.calls.at(-1)?.[0] as Error & {cause?: unknown})
        .cause,
    ).toBe(refreshCause);

    const syncTechnicalMessage =
      '[firestore/aborted] Failed to retry pending writes.';
    const syncCause = new Error(syncTechnicalMessage);
    syncNow.mockRejectedValueOnce(syncCause);
    ReactTestRenderer.act(() => {
      observeSyncState?.([
        {
          eventId: event.id,
          status: 'failed',
          attempts: 1,
          pendingRevisions: [1],
          failureKind: 'retryable',
        },
      ]);
    });
    await ReactTestRenderer.act(async () => {
      renderer?.root
        .findByProps({accessibilityLabel: '동기화 다시 시도'})
        .props.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(onRuntimeError).toHaveBeenLastCalledWith(
      expect.objectContaining({
        message: '동기화를 다시 시도하지 못했어요',
      }),
    );
    expect(
      (onRuntimeError.mock.calls.at(-1)?.[0] as Error).message,
    ).not.toContain('firestore');
    expect(
      (onRuntimeError.mock.calls.at(-1)?.[0] as Error & {cause?: unknown})
        .cause,
    ).toBe(syncCause);
    alert.mockRestore();
  });
});
