/**
 * @format
 */

import React from 'react';
import {SectionList, Text} from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import {
  babyId,
  createCareEvent,
  eventId,
  groupId,
  userId,
  type CareEvent,
} from '@babycare/product-core';

import App from '../App';
import {appContainer} from '../src/app/container';
import type {LocalSession} from '../src/app/session';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

jest.mock('react-native-safe-area-context', () => {
  const ReactModule = jest.requireActual<typeof React>('react');
  const {View} = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    SafeAreaProvider: ({children}: {readonly children?: React.ReactNode}) =>
      children,
    SafeAreaView: ({
      children,
      ...props
    }: React.ComponentProps<typeof View>) =>
      ReactModule.createElement(View, props, children),
    useSafeAreaInsets: () => ({bottom: 0, left: 0, right: 0, top: 0}),
  };
});

afterEach(() => {
  jest.restoreAllMocks();
});

function textOf(node: ReactTestRenderer.ReactTestInstance): string {
  return node
    .findAllByType(Text)
    .flatMap(text => text.props.children)
    .filter(value => typeof value === 'string')
    .join(' ');
}

function pressTab(
  renderer: ReactTestRenderer.ReactTestRenderer,
  label: string,
): void {
  const tab = renderer.root
    .findAll(node => node.props.accessibilityRole === 'tab')
    .find(node => textOf(node).includes(label));
  if (!tab) {
    throw new Error(`${label} tab not found: ${textOf(renderer.root)}`);
  }
  ReactTestRenderer.act(() => tab.props.onPress());
}

function timelineRowCount(
  renderer: ReactTestRenderer.ReactTestRenderer,
): number {
  return renderer.root
    .findByType(SectionList)
    .props.sections.reduce(
      (total: number, section: {readonly data: readonly CareEvent[]}) =>
        total + section.data.length,
      0,
    );
}

test('renders correctly', async () => {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<App />);
  });
  ReactTestRenderer.act(() => renderer.unmount());
});

test('connects local pagination through App and preserves its scoped tab state', async () => {
  const now = new Date(2026, 6, 13, 12).getTime();
  const session: LocalSession = {
    groupId: 'group-1',
    babyId: 'baby-1',
    caregiverId: 'owner-1',
    caregiverName: '보호자',
    babyName: '하루',
    birthDate: '2026-01-01',
    inviteCode: 'ABC234',
  };
  const events = Array.from({length: 45}, (_, index) =>
    createCareEvent(
      {
        groupId: groupId(session.groupId),
        babyId: babyId(session.babyId),
        caregiverId: userId(session.caregiverId),
        kind: 'diaper',
        diaperType: 'wet',
        occurredAt: now - index * 60_000,
      },
      {id: eventId(`app-event-${index}`), now},
    ),
  );
  const stopObserve = jest.fn();
  jest.spyOn(appContainer.sessionRepository, 'load').mockResolvedValue(session);
  jest
    .spyOn(appContainer.repository, 'observe')
    .mockImplementation((_query, listener) => {
      listener(events);
      return stopObserve;
    });

  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<App />);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });

  pressTab(renderer, '타임라인');
  expect(timelineRowCount(renderer)).toBe(20);
  expect(
    renderer.root.findAll(
      node => node.props.accessibilityLabel === '이전 기록 다시 불러오기',
    ),
  ).toHaveLength(0);

  await ReactTestRenderer.act(async () => {
    await renderer.root.findByType(SectionList).props.onEndReached();
  });
  expect(timelineRowCount(renderer)).toBe(40);

  // Tab navigation does not change group/baby scope, so its loaded page stays.
  // The hook suite separately verifies reset when that scope key changes.
  pressTab(renderer, '통계');
  pressTab(renderer, '타임라인');
  expect(timelineRowCount(renderer)).toBe(40);

  await ReactTestRenderer.act(async () => {
    await renderer.root.findByType(SectionList).props.onEndReached();
  });
  expect(timelineRowCount(renderer)).toBe(45);
  expect(textOf(renderer.root)).toContain('모든 기록을 확인했어요');
  expect(events).toHaveLength(45);

  ReactTestRenderer.act(() => renderer.unmount());
  expect(stopObserve).toHaveBeenCalledTimes(1);
});
