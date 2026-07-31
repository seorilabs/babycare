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
          theme={createTheme(false)}
        />,
      );
    });

    const actions = renderer.root.findAll(
      node =>
        node.props.accessibilityRole === 'button' &&
        typeof node.props.style === 'function',
    );
    expect(actions).toHaveLength(4);
    for (const action of actions) {
      const style = StyleSheet.flatten(action.props.style({pressed: false}));
      expect(style.flexBasis).toBe('47%');
      expect(style.flexGrow).toBe(1);
      expect(style.width).toBeUndefined();
    }
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
          theme={createTheme(false)}
        />,
      );
    });

    expect(renderedText(renderer)).toContain('밤잠 자는 중');
    ReactTestRenderer.act(() => renderer.unmount());
  });
});
