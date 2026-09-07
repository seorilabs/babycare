import React from 'react';
import {Text} from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import {
  babyId,
  createCareEvent,
  eventId,
  groupId,
  userId,
  type CareEvent,
} from '@babycare/product-core';

import {createStrings} from '@babycare/product-ui';
import type {LocalSession} from '../src/app/session';
import {createTheme} from '@babycare/product-ui';
import {QuickRecordModal} from '../src/components/QuickRecordModal';
import {SyncStatusBanner} from '../src/components/SyncStatusBanner';
import {TabBar} from '../src/components/TabBar';
import {UpdateGateOverlay} from '../src/components/UpdateGateOverlay';
import {CloudOnboardingScreen} from '../src/screens/CloudOnboardingScreen';
import {HomeScreen} from '../src/screens/HomeScreen';
import {MoreScreen} from '../src/screens/MoreScreen';
import {StatsScreen} from '../src/screens/StatsScreen';
import {TimelineScreen} from '../src/screens/TimelineScreen';

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({children}: {children?: React.ReactNode}) => children,
  useSafeAreaInsets: () => ({bottom: 34, left: 0, right: 0, top: 47}),
}));

const HANGUL = /[가-힣]/;
const en = createStrings('en');
const theme = createTheme(false);
const now = new Date(2026, 6, 13, 12).getTime();

// Caregiver and baby names are user data, not copy: they stay as typed.
const session: LocalSession = {
  groupId: 'group-1',
  babyId: 'baby-1',
  caregiverId: 'owner-1',
  caregiverName: 'Mom',
  babyName: 'Jian',
  birthDate: '2026-01-01',
  inviteCode: 'ABC234',
  runtimeMode: 'firebase',
  membershipRole: 'owner',
};

function feedingEvent(): CareEvent {
  return createCareEvent(
    {
      groupId: groupId(session.groupId),
      babyId: babyId(session.babyId),
      caregiverId: userId(session.caregiverId),
      kind: 'feeding',
      feedingType: 'formula',
      volumeMl: 120,
      occurredAt: now - 3_600_000,
    },
    {id: eventId('event-1'), now},
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

function textOf(element: React.ReactElement): string {
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(element);
  });
  const text = renderedText(renderer);
  ReactTestRenderer.act(() => renderer.unmount());
  return text;
}

describe('English rendering leaves no Korean copy on screen', () => {
  it('renders the home screen in English', () => {
    const text = textOf(
      <HomeScreen
        activeSleep={undefined}
        caregiverNames={new Map([[session.caregiverId, 'Mom']])}
        events={[feedingEvent()]}
        now={now}
        onMore={jest.fn()}
        onRecord={jest.fn()}
        onStopSleep={jest.fn()}
        session={session}
        strings={en}
        theme={theme}
      />,
    );

    expect(text).toContain('Last feeding');
    expect(text).toContain('Formula 120ml');
    expect(text).not.toMatch(HANGUL);
  });

  it('renders the timeline screen in English', () => {
    const text = textOf(
      <TimelineScreen
        capped={false}
        caregiverNames={new Map([[session.caregiverId, 'Mom']])}
        events={[feedingEvent()]}
        hasMore={false}
        loadingMore={false}
        now={now}
        onEdit={jest.fn()}
        onDelete={jest.fn()}
        onLoadMore={jest.fn()}
        onRetryLoadMore={jest.fn()}
        session={session}
        strings={en}
        theme={theme}
      />,
    );

    expect(text).toContain('Timeline');
    expect(text).toContain('Today');
    expect(text).not.toMatch(HANGUL);
  });

  it('renders the timeline load-more error in English', () => {
    const text = textOf(
      <TimelineScreen
        capped={false}
        caregiverNames={new Map([[session.caregiverId, 'Mom']])}
        events={[feedingEvent()]}
        hasMore={true}
        loadingMore={false}
        loadMoreError={true}
        now={now}
        onEdit={jest.fn()}
        onDelete={jest.fn()}
        onLoadMore={jest.fn()}
        onRetryLoadMore={jest.fn()}
        session={session}
        strings={en}
        theme={theme}
      />,
    );

    expect(text).toContain("Couldn't load earlier entries.");
    expect(text).not.toMatch(HANGUL);
  });

  it('renders the stats screen in English', () => {
    const text = textOf(
      <StatsScreen
        events={[feedingEvent()]}
        now={now}
        strings={en}
        theme={theme}
      />,
    );

    expect(text).toContain('Stats');
    expect(text).not.toMatch(HANGUL);
  });

  it('renders the more screen in English', () => {
    const text = textOf(
      <MoreScreen
        inviteExpiresAt={now + 3_600_000}
        onCreateInvite={jest.fn()}
        onDeleteAccount={jest.fn()}
        onRefreshMembers={jest.fn()}
        onReset={jest.fn()}
        session={session}
        strings={en}
        theme={theme}
      />,
    );

    expect(text).toContain("Jian's group");
    expect(text).toContain('English');
    expect(text).not.toMatch(HANGUL);
  });

  it('renders onboarding in English', () => {
    const text = textOf(
      <CloudOnboardingScreen
        onCreate={jest.fn()}
        onJoin={jest.fn()}
        strings={en}
        theme={theme}
      />,
    );

    expect(text).toContain("Know what happened, even when you weren't there");
    expect(text).toContain('Log care in seconds');
    expect(text).toContain('Easy handoffs');
    expect(text).toContain('Invite-only sharing');
    expect(text).not.toMatch(HANGUL);
  });

  it('renders the quick record modal in English', () => {
    const text = textOf(
      <QuickRecordModal
        events={[]}
        historyStatus="complete"
        kind="feeding"
        onClose={jest.fn()}
        onSave={jest.fn()}
        session={session}
        strings={en}
        theme={theme}
      />,
    );

    expect(text).toContain('Log feeding');
    expect(text).not.toMatch(HANGUL);
  });

  it('renders the tab bar and sync banner in English', () => {
    const tabs = textOf(
      <TabBar active="home" onChange={jest.fn()} strings={en} theme={theme} />,
    );
    expect(tabs).toContain('Timeline');
    expect(tabs).not.toMatch(HANGUL);

    const banner = textOf(
      <SyncStatusBanner
        onDiscardConflicts={jest.fn()}
        onReapplyConflicts={jest.fn()}
        onRetry={jest.fn()}
        states={[
          {
            eventId: eventId('event-1'),
            status: 'pending',
            attempts: 0,
            pendingRevisions: [],
          },
        ]}
        strings={en}
        theme={theme}
      />,
    );
    expect(banner).toContain('1 entry waiting to sync');
    expect(banner).not.toMatch(HANGUL);
  });

  it('renders the update gate overlay in English', () => {
    const text = textOf(
      <UpdateGateOverlay
        state={{
          kind: 'recommended',
          message: 'A new version is available.',
          updateUrl: 'https://play.google.com/store/apps/details?id=com.seorilabs.babycare',
        }}
        onDismiss={jest.fn()}
        strings={en}
      />,
    );

    expect(text).toContain('Update');
    expect(text).toContain('Later');
    expect(text).not.toMatch(HANGUL);
  });
});
