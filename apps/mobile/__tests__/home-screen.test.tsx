import React from 'react';
import {StyleSheet, Text} from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import {
  babyId,
  createCareEvent,
  eventId,
  groupId,
  userId,
  type SleepEvent,
} from '@babycare/product-core';

import type {LocalSession} from '../src/app/session';
import {createTheme} from '../src/app/theme';
import { createStrings } from '../src/app/i18n';
import {HomeScreen} from '../src/screens/HomeScreen';

const session: LocalSession = {
  groupId: 'group-1',
  babyId: 'baby-1',
  caregiverId: 'owner-1',
  caregiverName: '엄마',
  babyName: '하루',
  birthDate: '2026-01-01',
  inviteCode: 'ABC234',
  runtimeMode: 'firebase',
  membershipRole: 'owner',
};

function renderedText(renderer: ReactTestRenderer.ReactTestRenderer): string {
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

describe('HomeScreen', () => {
  it('guides a verified empty group directly into its first care entry', () => {
    const onRecord = jest.fn();
    let renderer!: ReactTestRenderer.ReactTestRenderer;

    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <HomeScreen
          activeSleep={undefined}
          caregiverNames={new Map()}
          events={[]}
          now={new Date('2026-07-31T09:00:00+09:00').getTime()}
          onMore={jest.fn()}
          onRecord={onRecord}
          onStopSleep={jest.fn()}
          session={session}
          showFirstEntryGuide
          strings={createStrings('ko')}
          theme={createTheme(false)}
        />,
      );
    });

    expect(renderer.root.findByProps({testID: 'first-entry-guide'})).toBeDefined();
    expect(renderedText(renderer)).toContain('가장 최근의 돌봄부터 남겨보세요');

    ReactTestRenderer.act(() => {
      renderer.root
        .findByProps({accessibilityLabel: '첫 수유 기록하기'})
        .props.onPress();
    });
    expect(onRecord).toHaveBeenCalledWith('feeding');
    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('does not present the single-baby MVP name as an unavailable selector', () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;

    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <HomeScreen
          activeSleep={undefined}
          caregiverNames={new Map()}
          events={[]}
          now={new Date('2026-07-31T09:00:00+09:00').getTime()}
          onMore={jest.fn()}
          onRecord={jest.fn()}
          onStopSleep={jest.fn()}
          session={session}
          strings={createStrings('ko')}
          theme={createTheme(false)}
        />,
      );
    });

    const visibleText = renderedText(renderer);
    expect(visibleText).toContain('하루');
    expect(visibleText).not.toContain('하루 ▾');
    expect(visibleText).toContain('더보기 설정 열기');
    expect(visibleText).not.toContain('더보기 바로 남기기');
    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('keeps quick actions in a flexible two-column layout on narrow screens', () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;

    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <HomeScreen
          activeSleep={undefined}
          caregiverNames={new Map()}
          events={[]}
          now={new Date('2026-07-31T09:00:00+09:00').getTime()}
          onMore={jest.fn()}
          onRecord={jest.fn()}
          onStopSleep={jest.fn()}
          session={session}
          strings={createStrings('ko')}
          theme={createTheme(false)}
        />,
      );
    });

    const actions = renderer.root.findAll(
      node =>
        node.props.accessibilityRole === 'button' &&
        typeof node.props.style === 'function',
    );
    expect(actions).toHaveLength(6);
    for (const action of actions) {
      const style = StyleSheet.flatten(action.props.style({pressed: false}));
      expect(style.flexBasis).toBe('47%');
      expect(style.flexGrow).toBe(1);
      expect(style.width).toBeUndefined();
    }
    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('keeps the longest allowed baby name clear of the sync badge', () => {
    const longBabyName = '아'.repeat(80);
    let renderer!: ReactTestRenderer.ReactTestRenderer;

    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <HomeScreen
          activeSleep={undefined}
          caregiverNames={new Map()}
          events={[]}
          now={new Date('2026-07-31T09:00:00+09:00').getTime()}
          onMore={jest.fn()}
          onRecord={jest.fn()}
          onStopSleep={jest.fn()}
          session={{...session, babyName: longBabyName}}
          strings={createStrings('ko')}
          theme={createTheme(false)}
        />,
      );
    });

    const babyName = renderer.root.findAllByType(Text).find(
      node => node.props.children === longBabyName,
    );
    const syncBadge = renderer.root.findAllByType(Text).find(
      node => node.props.children === '공동 기록',
    )?.parent;

    expect(babyName?.props.numberOfLines).toBe(2);
    expect(StyleSheet.flatten(babyName?.parent?.props.style)).toMatchObject({
      flex: 1,
      minWidth: 0,
    });
    expect(StyleSheet.flatten(syncBadge?.props.style)).toMatchObject({
      flexShrink: 0,
      marginLeft: 12,
    });
    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('shows the authoritative active sleep when the bounded event list is empty', () => {
    const now = new Date('2026-07-31T09:00:00+09:00').getTime();
    const activeSleep = createCareEvent(
      {
        groupId: groupId(session.groupId),
        babyId: babyId(session.babyId),
        caregiverId: userId(session.caregiverId),
        kind: 'sleep',
        sleepType: 'night',
        startedAt: now - 30 * 60_000,
      },
      {id: eventId('active-sleep'), now},
    ) as SleepEvent;
    let renderer!: ReactTestRenderer.ReactTestRenderer;

    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <HomeScreen
          activeSleep={activeSleep}
          caregiverNames={new Map([[session.caregiverId, session.caregiverName]])}
          events={[]}
          now={now}
          onMore={jest.fn()}
          onRecord={jest.fn()}
          onStopSleep={jest.fn()}
          session={session}
          strings={createStrings('ko')}
          theme={createTheme(false)}
        />,
      );
    });

    expect(renderedText(renderer)).toContain('밤잠 자는 중');
    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('submits only one sleep stop request while the first request is in progress', async () => {
    const now = new Date('2026-08-02T00:00:00+09:00').getTime();
    const activeSleep = createCareEvent(
      {
        groupId: groupId(session.groupId),
        babyId: babyId(session.babyId),
        caregiverId: userId(session.caregiverId),
        kind: 'sleep',
        sleepType: 'night',
        startedAt: now - 30 * 60_000,
      },
      {id: eventId('active-sleep-stop'), now},
    ) as SleepEvent;
    let finishStop!: () => void;
    const stopRequest = new Promise<void>(resolve => {
      finishStop = resolve;
    });
    const onStopSleep = jest.fn(() => stopRequest);
    let renderer!: ReactTestRenderer.ReactTestRenderer;

    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <HomeScreen
          activeSleep={activeSleep}
          caregiverNames={new Map([[session.caregiverId, session.caregiverName]])}
          events={[]}
          now={now}
          onMore={jest.fn()}
          onRecord={jest.fn()}
          onStopSleep={onStopSleep}
          session={session}
          strings={createStrings('ko')}
          theme={createTheme(false)}
        />,
      );
    });

    const stopAction = renderer.root.findAll(
      node =>
        node.props.accessibilityRole === 'button' &&
        typeof node.props.onPress === 'function' &&
        node
          .findAllByType(Text)
          .some(text => text.props.children === '기상'),
    )[0];
    if (!stopAction) {
      throw new Error('수면 종료 버튼을 찾지 못했어요');
    }
    ReactTestRenderer.act(() => {
      stopAction.props.onPress();
      stopAction.props.onPress();
    });

    expect(onStopSleep).toHaveBeenCalledTimes(1);
    const pendingAction = renderer.root.findByProps({
      accessibilityLabel: '수면 종료 중',
    });
    expect(pendingAction.props.disabled).toBe(true);
    expect(pendingAction.props.accessibilityState).toEqual({
      busy: true,
      disabled: true,
    });

    await ReactTestRenderer.act(async () => {
      finishStop();
      await stopRequest;
    });
    expect(
      renderer.root.findByProps({accessibilityLabel: '수면 종료'}).props
        .disabled,
    ).toBe(false);
    ReactTestRenderer.act(() => renderer.unmount());
  });
});
