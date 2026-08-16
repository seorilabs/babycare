import React from 'react';
import {KeyboardAvoidingView, Platform, StyleSheet, Text} from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import {
  babyId,
  createCareEvent,
  eventId,
  groupId,
  userId,
  type CareEvent,
  type Membership,
} from '../../../../packages/product-core/src/index.ts';

import {HomeScreen} from './HomeScreen';
import {MoreScreen} from './MoreScreen';
import {QuickRecordModal} from './QuickRecordModal';
import type {LocalSession} from './session';
import {StatsScreen} from './StatsScreen';
import {createStrings} from './strings';
import {TabBar} from './TabBar';
import {createTheme} from './theme';
import {TimelineScreen} from './TimelineScreen';
import {aitBottomInset, aitTopInset} from './system-insets';

let mockSafeAreaBottom = 34;
let mockSafeAreaTop = 47;
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({
    bottom: mockSafeAreaBottom,
    left: 0,
    right: 0,
    top: mockSafeAreaTop,
  }),
}));

const now = new Date(2026, 7, 11, 12).getTime();
const strings = createStrings('ko');
const theme = createTheme(false);
const session: LocalSession = {
  groupId: 'group-parity',
  babyId: 'baby-parity',
  caregiverId: 'user-owner',
  caregiverName: '엄마',
  babyName: '지안',
  birthDate: '2026-08-01',
  inviteCode: 'ABC234',
  runtimeMode: 'firebase',
  membershipRole: 'owner',
};
const context = {
  groupId: groupId(session.groupId),
  babyId: babyId(session.babyId),
  caregiverId: userId(session.caregiverId),
};

function event(
  input: Parameters<typeof createCareEvent>[0],
  id: string,
): CareEvent {
  return createCareEvent(input, {id: eventId(id), now});
}

const events: readonly CareEvent[] = [
  event(
    {
      ...context,
      kind: 'medication',
      medicationName: '아세트아미노펜',
      medicationCategory: 'antipyretic',
      activeIngredient: 'acetaminophen',
      doseAmount: 3.5,
      doseUnit: 'ml',
      minimumIntervalMinutes: 240,
      occurredAt: now - 5 * 60_000,
      note: '복약 메모',
    },
    'event-medication',
  ),
  event(
    {
      ...context,
      kind: 'temperature',
      temperatureCelsius: 38.2,
      measurementSite: 'ear',
      occurredAt: now - 10 * 60_000,
    },
    'event-temperature',
  ),
  event(
    {
      ...context,
      kind: 'sleep',
      sleepType: 'nap',
      startedAt: now - 80 * 60_000,
      endedAt: now - 20 * 60_000,
    },
    'event-sleep',
  ),
  event(
    {
      ...context,
      kind: 'diaper',
      diaperType: 'mixed',
      occurredAt: now - 90 * 60_000,
    },
    'event-diaper',
  ),
  event(
    {
      ...context,
      kind: 'feeding',
      feedingType: 'formula',
      volumeMl: 120,
      occurredAt: now - 100 * 60_000,
      note: '수유 메모',
    },
    'event-feeding',
  ),
];

function textOf(element: React.ReactElement): string {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(element);
  });
  const read = (value: unknown): string =>
    Array.isArray(value)
      ? value.map(read).join('')
      : typeof value === 'string' || typeof value === 'number'
        ? String(value)
        : '';
  const text = renderer.root
    .findAllByType(Text)
    .map(node => read(node.props.children))
    .join(' ')
    .replace(/\s+/g, ' ');
  ReactTestRenderer.act(() => renderer.unmount());
  return text;
}

describe('AppsInToss feature parity contract', () => {
  it('reserves the Android system navigation area when the host reports zero', () => {
    expect(aitBottomInset(0, 'android')).toBe(32);
    expect(aitBottomInset(34, 'android')).toBe(34);
    expect(aitBottomInset(0, 'ios')).toBe(0);
    expect(aitTopInset(0, 'android')).toBe(32);
    expect(aitTopInset(47, 'android')).toBe(47);
    expect(aitTopInset(0, 'ios')).toBe(0);
  });

  it('uses the AppsInToss floating tab bar shape and keeps four navigation tabs', () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;

    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <TabBar
          active="home"
          onChange={jest.fn()}
          strings={strings}
          theme={theme}
        />,
      );
    });

    const shell = renderer.root.findByProps({testID: 'floating-tab-bar-shell'});
    expect(StyleSheet.flatten(shell.props.style)).toMatchObject({
      paddingBottom: 44,
      paddingHorizontal: 16,
      paddingTop: 10,
    });
    const surface = renderer.root.findByProps({testID: 'floating-tab-bar-surface'});
    expect(StyleSheet.flatten(surface.props.style)).toMatchObject({
      borderRadius: 36,
      elevation: 8,
      minHeight: 68,
      shadowOpacity: 0.14,
      shadowRadius: 12,
    });
    for (const tab of ['home', 'timeline', 'stats', 'more']) {
      expect(surface.findByProps({testID: `floating-tab-${tab}`})).toBeDefined();
    }

    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('shows the same five latest cards and quick-record entry points', () => {
    const text = textOf(
      <HomeScreen
        activeSleep={undefined}
        caregiverNames={new Map([[session.caregiverId, '엄마']])}
        events={events}
        now={now}
        onMore={jest.fn()}
        onRecord={jest.fn()}
        onStopSleep={jest.fn()}
        session={session}
        strings={strings}
        theme={theme}
      />,
    );

    expect(text).toContain('생후 10일');
    expect(text).toContain('마지막 수유');
    expect(text).toContain('마지막 기저귀');
    expect(text).toContain('마지막 수면');
    expect(text).toContain('마지막 체온');
    expect(text).toContain('마지막 복약');
    expect(text).toContain('빠른 기록');
  });

  it('exposes every detailed record variant, time editing, and notes', () => {
    const commonProps = {
      events,
      onClose: jest.fn(),
      onSave: jest.fn(async () => undefined),
      session,
      strings,
      theme,
    };
    const text = (['feeding', 'diaper', 'sleep', 'temperature', 'medication'] as const)
      .map(kind => textOf(<QuickRecordModal {...commonProps} kind={kind} />))
      .join(' ');

    for (const label of [
      '모유',
      '유축',
      '분유',
      '이유식',
      '소변',
      '대변',
      '둘 다',
      '낮잠',
      '밤잠',
      '측정 부위',
      '약 선택',
      '기록 시각',
      '−10분',
      '메모 (선택)',
    ]) {
      expect(text).toContain(label);
    }
  });

  it('keeps the quick-record title and footer outside Android system areas', () => {
    const originalPlatform = Platform.OS;
    Object.defineProperty(Platform, 'OS', {configurable: true, value: 'android'});
    mockSafeAreaBottom = 0;
    mockSafeAreaTop = 0;
    let renderer!: ReactTestRenderer.ReactTestRenderer;

    try {
      ReactTestRenderer.act(() => {
        renderer = ReactTestRenderer.create(
          <QuickRecordModal
            events={events}
            kind="diaper"
            onClose={jest.fn()}
            onSave={jest.fn(async () => undefined)}
            session={session}
            strings={strings}
            theme={theme}
          />,
        );
      });

      expect(renderer.root.findByType(KeyboardAvoidingView).props.behavior).toBe(
        'height',
      );
      const header = renderer.root.findByProps({testID: 'quick-record-header'});
      expect(StyleSheet.flatten(header.props.style)).toMatchObject({
        minHeight: 90,
        paddingTop: 32,
      });
      const footer = renderer.root.findByProps({testID: 'quick-record-footer'});
      expect(StyleSheet.flatten(footer.props.style).paddingBottom).toBe(40);
    } finally {
      if (renderer) {
        ReactTestRenderer.act(() => renderer.unmount());
      }
      Object.defineProperty(Platform, 'OS', {
        configurable: true,
        value: originalPlatform,
      });
      mockSafeAreaBottom = 34;
      mockSafeAreaTop = 47;
    }
  });

  it('keeps grouped timeline metadata, notes, and deletion affordance', () => {
    const text = textOf(
      <TimelineScreen
        capped={false}
        caregiverNames={new Map([[session.caregiverId, '엄마']])}
        events={events}
        hasMore={false}
        loadingMore={false}
        now={now}
        onDelete={jest.fn()}
        onLoadMore={jest.fn()}
        onRetryLoadMore={jest.fn()}
        session={session}
        strings={strings}
        theme={theme}
      />,
    );

    expect(text).toContain('오늘');
    expect(text).toContain('엄마');
    expect(text).toContain('복약 메모');
    expect(text).toContain('내 기록을 길게 누르면 삭제할 수 있어요.');
  });

  it('provides 12-hour, 7-day, and 30-day stats with charts', () => {
    const text = textOf(
      <StatsScreen
        events={events}
        now={now}
        strings={strings}
        theme={theme}
      />,
    );

    expect(text).toContain('12시간');
    expect(text).toContain('7일');
    expect(text).toContain('30일');
    expect(text).toContain('수유 횟수');
    expect(text).toContain('수면 시간');
  });

  it('shows all caregivers, invite sharing, sync, language, and privacy', () => {
    const memberships: readonly Membership[] = [
      {
        userId: userId('user-owner'),
        groupId: groupId(session.groupId),
        caregiverRole: 'parent',
        membershipRole: 'owner',
        displayName: '엄마',
        color: '#5FB49C',
        joinedAt: now - 1000,
      },
      {
        userId: userId('user-member'),
        groupId: groupId(session.groupId),
        caregiverRole: 'parent',
        membershipRole: 'member',
        displayName: '아빠',
        color: '#397CB3',
        joinedAt: now,
      },
    ];
    const text = textOf(
      <MoreScreen
        inviteExpiresAt={Date.UTC(2099, 0, 1)}
        memberships={memberships}
        onCreateInvite={jest.fn()}
        onDeleteAccount={jest.fn()}
        onRefreshMembers={jest.fn()}
        onReset={jest.fn()}
        session={session}
        strings={strings}
        theme={theme}
      />,
    );

    expect(text).toContain('엄마');
    expect(text).toContain('아빠');
    expect(text).toContain('공유');
    expect(text).not.toContain('초대 코드가 만료됐어요');
    expect(text).toContain('구성원 목록 새로고침');
    expect(text).toContain('언어');
    expect(text).toContain('개인정보 처리방침');
    expect(text).toContain('계정 삭제');
  });
});
