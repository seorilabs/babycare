import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
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
});
