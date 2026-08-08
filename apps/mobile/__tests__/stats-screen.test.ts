import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import {Text} from 'react-native';
import {
  babyId,
  createCareEvent,
  eventId,
  groupId,
  userId,
} from '@babycare/product-core';

import { createTheme } from '../src/app/theme';
import { createStrings } from '../src/app/i18n';
import { buildStatsBuckets, StatsScreen } from '../src/screens/StatsScreen';

describe('buildStatsBuckets', () => {
  it('clips active sleep at the real current time in the rolling 12-hour range', () => {
    const now = new Date('2026-07-12T12:37:00+09:00').getTime();
    const sleep = createCareEvent(
      {
        groupId: groupId('group-1'),
        babyId: babyId('baby-1'),
        caregiverId: userId('user-1'),
        kind: 'sleep',
        sleepType: 'nap',
        startedAt: now - 3 * 60 * 60 * 1_000,
      },
      { id: eventId('event-1'), now },
    );

    const buckets = buildStatsBuckets([sleep], now, '12h', createStrings('ko'));

    expect(buckets[0]?.from).toBe(now - 12 * 60 * 60 * 1_000);
    expect(buckets.at(-1)?.to).toBe(now);
    expect(
      buckets.reduce(
        (total, bucket) => total + bucket.summary.sleepDurationSeconds,
        0,
      ),
    ).toBe(3 * 60 * 60);
  });

  it('keeps the current calendar bucket empty at exact midnight', () => {
    const now = new Date(2026, 6, 12, 0, 0, 0, 0).getTime();

    const buckets = buildStatsBuckets([], now, '7d', createStrings('ko'));

    expect(buckets).toHaveLength(7);
    expect(buckets.at(-1)?.from).toBe(now);
    expect(buckets.at(-1)?.to).toBe(now);
    expect(buckets.at(-1)?.summary.sleepDurationSeconds).toBe(0);
  });
});

describe('StatsScreen', () => {
  it('exposes the period selector and its current selection to accessibility', () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        React.createElement(StatsScreen, {
          events: [],
          now: new Date('2026-07-12T12:37:00+09:00').getTime(),
          strings: createStrings('ko'),
          theme: createTheme(false),
        }),
      );
    });

    const nodesWithRole = (role: string) =>
      renderer.root
        .findAllByProps({ accessibilityRole: role })
        .filter(node => node.parent?.props.accessibilityRole !== role);
    expect(
      nodesWithRole('tablist'),
    ).toHaveLength(1);
    let tabs = nodesWithRole('tab');
    expect(tabs).toHaveLength(3);
    expect(tabs.map(tab => tab.props.accessibilityState)).toEqual([
      { selected: false },
      { selected: true },
      { selected: false },
    ]);

    ReactTestRenderer.act(() => tabs[0]!.props.onPress());
    tabs = nodesWithRole('tab');
    expect(tabs.map(tab => tab.props.accessibilityState)).toEqual([
      { selected: true },
      { selected: false },
      { selected: false },
    ]);
    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('unlocks detailed charts only after a rewarded-ad completion', async () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: jest.fn(async (key: string) => values.get(key) ?? null),
      setItem: jest.fn(async (key: string, value: string) => {
        values.set(key, value);
      }),
      removeItem: jest.fn(async (key: string) => {
        values.delete(key);
      }),
    };
    const rewardedAd = {
      preload: jest.fn(async () => undefined),
      show: jest.fn(async () => ({status: 'rewarded' as const, network: 'test'})),
    };
    const events: string[] = [];
    const analytics = {
      track: jest.fn(async (event: {readonly name: string}) => {
        events.push(event.name);
      }),
    };
    let renderer!: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        React.createElement(StatsScreen, {
          events: [],
          now: new Date('2026-07-12T12:37:00+09:00').getTime(),
          strings: createStrings('ko'),
          theme: createTheme(false),
          analytics,
          rewardedAd,
          storage,
        }),
      );
      await Promise.resolve();
    });

    const text = () =>
      renderer.root
        .findAllByType(Text)
        .map(node => String(node.props.children ?? ''))
        .join(' ');
    expect(text()).toContain('광고 보고 상세 통계 열기');
    expect(text()).not.toContain('구간별 기록');

    const unlockButton = renderer.root
      .findAllByProps({accessibilityRole: 'button'})
      .find(node =>
        node.findAllByType(Text).some(child =>
          String(child.props.children).includes('광고 보고'),
        ),
      );
    await ReactTestRenderer.act(async () => {
      unlockButton?.props.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(text()).toContain('구간별 기록');
    expect(events).toEqual([
      'core_ad_request',
      'core_ad_impression',
      'core_ad_reward',
    ]);
    ReactTestRenderer.act(() => renderer.unmount());
  });
});
