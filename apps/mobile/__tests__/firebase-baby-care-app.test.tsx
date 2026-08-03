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

import {bootstrapFirebaseRuntime} from '../src/app/firebase-runtime';
import type {ReadyFirebaseSession} from '../src/app/firebase-session';
import {
  FirebaseBabyCareApp,
  FirebaseCareDashboard,
} from '../src/app/FirebaseBabyCareApp';

jest.mock('@react-native-async-storage/async-storage', () => ({
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

  it('hides technical details when runtime operations fail', async () => {
    const now = new Date('2026-08-03T16:00:00+09:00').getTime();
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
            status: 'ready',
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
