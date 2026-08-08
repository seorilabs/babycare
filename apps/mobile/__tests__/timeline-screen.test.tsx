import React from 'react';
import {Alert, SectionList, Text} from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import {
  babyId,
  createCareEvent,
  eventId,
  groupId,
  userId,
  type CareEvent,
} from '@babycare/product-core';

import type {LocalSession} from '../src/app/session';
import {createTheme} from '../src/app/theme';
import { createStrings } from '../src/app/i18n';
import {TimelineScreen} from '../src/screens/TimelineScreen';

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
const theme = createTheme(false);

function careEvent(
  id: string,
  caregiverId: string,
  occurredAt: number,
): CareEvent {
  return createCareEvent(
    {
      groupId: groupId(session.groupId),
      babyId: babyId(session.babyId),
      caregiverId: userId(caregiverId),
      kind: 'diaper',
      diaperType: 'wet',
      occurredAt,
    },
    {id: eventId(id), now},
  );
}

function screen(overrides: Partial<React.ComponentProps<typeof TimelineScreen>> = {}) {
  return (
    <TimelineScreen
      caregiverNames={new Map([
        ['owner-1', '보호자'],
        ['member-1', '다른 보호자'],
      ])}
      capped={false}
      events={[careEvent('event-1', 'owner-1', now - 60_000)]}
      hasMore
      loadingMore={false}
      now={now}
      onDelete={async () => undefined}
      onLoadMore={async () => undefined}
      onRetryLoadMore={() => undefined}
      session={session}
      strings={createStrings('ko')}
      theme={theme}
      {...overrides}
    />
  );
}

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

describe('TimelineScreen bounded feed', () => {
  it('labels the Firebase timeline as shared records without promising a live connection', () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        screen({session: {...session, runtimeMode: 'firebase'}}),
      );
    });

    expect(renderedText(renderer)).toContain('공동 기록');
    expect(renderedText(renderer)).not.toContain('LIVE');
    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('allows only one onEndReached load at a time', async () => {
    const onLoadMore = jest.fn(async () => undefined);
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(screen({onLoadMore}));
    });
    const list = renderer.root.findByType(SectionList);

    const firstRun = list.props.onEndReached() as Promise<void>;
    const duplicateRun = list.props.onEndReached() as Promise<void>;

    expect(onLoadMore).toHaveBeenCalledTimes(1);
    await Promise.all([firstRun, duplicateRun]);

    const secondRun = list.props.onEndReached() as Promise<void>;
    expect(onLoadMore).toHaveBeenCalledTimes(2);
    await secondRun;
    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('renders error/retry, loading, and end-of-feed footer states', async () => {
    const onRetryLoadMore = jest.fn(async () => undefined);
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        screen({loadMoreError: '이전 기록을 불러오지 못했어요', onRetryLoadMore}),
      );
    });

    expect(renderedText(renderer)).toContain('이전 기록을 불러오지 못했어요');
    const retry = renderer.root.findByProps({
      accessibilityLabel: '이전 기록 다시 불러오기',
    });
    const firstRetry = retry.props.onPress() as Promise<void>;
    const duplicateRetry = retry.props.onPress() as Promise<void>;
    expect(onRetryLoadMore).toHaveBeenCalledTimes(1);
    await Promise.all([firstRetry, duplicateRetry]);

    await ReactTestRenderer.act(async () => {
      renderer.update(screen({loadingMore: true}));
    });
    expect(renderedText(renderer)).toContain('이전 기록을 불러오는 중');

    await ReactTestRenderer.act(async () => {
      renderer.update(screen({hasMore: false}));
    });
    expect(renderedText(renderer)).toContain('모든 기록을 확인했어요');

    await ReactTestRenderer.act(async () => {
      renderer.update(screen({capped: true, hasMore: false}));
    });
    expect(renderedText(renderer)).toContain('기기에 보관할 이전 기록 범위');
    await ReactTestRenderer.act(async () => renderer.unmount());
  });

  it('builds stable day sections and keeps author-only accessible deletion', async () => {
    const ownerLatest = careEvent('event-b', 'owner-1', now - 60_000);
    const ownerEarlier = careEvent('event-a', 'owner-1', now - 120_000);
    const memberYesterday = careEvent(
      'event-c',
      'member-1',
      now - 24 * 60 * 60 * 1_000,
    );
    const onDelete = jest.fn(async () => undefined);
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        screen({
          events: [memberYesterday, ownerEarlier, ownerLatest],
          hasMore: false,
          onDelete,
        }),
      );
    });
    const list = renderer.root.findByType(SectionList);
    const sections = list.props.sections as ReadonlyArray<{
      readonly key: string;
      readonly title: string;
      readonly data: readonly CareEvent[];
    }>;

    expect(sections).toHaveLength(2);
    expect(sections.map(section => section.title)).toEqual(['오늘', '어제']);
    expect(sections[0]!.data.map(event => event.id)).toEqual([
      ownerLatest.id,
      ownerEarlier.id,
    ]);

    const ownerRow = list.props.renderItem({
      index: 0,
      item: ownerLatest,
      section: sections[0],
    });
    const memberRow = list.props.renderItem({
      index: 0,
      item: memberYesterday,
      section: sections[1],
    });
    expect(ownerRow.props.accessibilityHint).toBe(
      '활성화하면 기록 삭제 확인창이 열립니다',
    );
    expect(ownerRow.props.accessibilityRole).toBe('button');
    expect(ownerRow.props.accessibilityActions).toEqual([
      {name: 'activate', label: '기록 삭제'},
    ]);
    expect(ownerRow.props.onAccessibilityAction).toEqual(expect.any(Function));
    expect(memberRow.props.accessibilityHint).toBeUndefined();
    expect(memberRow.props.accessibilityRole).toBeUndefined();
    expect(memberRow.props.accessibilityActions).toBeUndefined();
    expect(memberRow.props.onAccessibilityAction).toBeUndefined();
    expect(memberRow.props.onLongPress).toBeUndefined();

    ownerRow.props.onAccessibilityAction({
      nativeEvent: {actionName: 'activate'},
    });
    expect(alert).toHaveBeenCalledWith(
      '기록을 삭제할까요?',
      expect.any(String),
      expect.any(Array),
    );
    const actions = alert.mock.calls[0]![2]!;
    const deleteAction = actions.find(action => action.style === 'destructive');
    await ReactTestRenderer.act(async () => {
      deleteAction?.onPress?.();
      await Promise.resolve();
    });
    expect(onDelete).toHaveBeenCalledWith(ownerLatest);

    alert.mockClear();
    ownerRow.props.onLongPress();
    expect(alert).toHaveBeenCalledWith(
      '기록을 삭제할까요?',
      expect.any(String),
      expect.any(Array),
    );

    alert.mockRestore();
    await ReactTestRenderer.act(async () => renderer.unmount());
  });
});
