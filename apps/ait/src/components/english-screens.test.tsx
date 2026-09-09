import React from 'react';
import {Text} from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import {
  babyId,
  groupId,
  userId,
  type Baby,
  type CareGroup,
  type Membership,
} from '../../../../packages/product-core/src/index.ts';
import {createStrings} from '@babycare/product-ui';

import {BirthDatePicker} from './birth-date-picker';
import {ParityDashboard} from './parity-dashboard';
import type {ReadyCareSession} from '../services/babycare-backend';

const HANGUL = /[가-힣]/;
const en = createStrings('en');

jest.mock('@apps-in-toss/framework', () => ({
  Storage: {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => undefined),
    removeItem: jest.fn(async () => undefined),
  },
}));

jest.mock('../services/analytics', () => ({
  babycareAnalytics: {track: jest.fn(async () => undefined)},
}));

jest.mock('../services/babycare-backend', () => ({
  createInviteCode: jest.fn(),
  deleteCareAccount: jest.fn(),
  reloadCareSession: jest.fn(),
  removeCareMember: jest.fn(),
}));

// 런타임을 시작하지 못한 상태를 강제해 대시보드의 오류 배너 경로를 그린다.
jest.mock('../services/care-event-runtime', () => ({
  createAitCareEventRuntime: jest.fn(() => Promise.reject('offline')),
}));

jest.mock('../services/device-locale', () => ({
  deviceAppLocale: () => 'en',
}));

jest.mock('react-native-safe-area-context', () => {
  const ReactModule = jest.requireActual<typeof React>('react');
  const Native = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    SafeAreaView: ({children, ...props}: React.PropsWithChildren<Record<string, unknown>>) =>
      ReactModule.createElement(Native.View, props, children),
    useSafeAreaInsets: () => ({bottom: 34, left: 0, right: 0, top: 47}),
  };
});

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

describe('AppsInToss English rendering leaves no Korean copy on screen', () => {
  it('renders the birth date calendar in English', () => {
    const maximumDate = new Date(2026, 7, 11, 12);
    let renderer!: ReactTestRenderer.ReactTestRenderer;

    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <BirthDatePicker maximumDate={maximumDate} onChange={jest.fn()} strings={en} value="" />,
      );
    });
    ReactTestRenderer.act(() => {
      renderer.root
        .findByProps({accessibilityLabel: en.onboarding.birthDateSelectAccessibilityLabel})
        .props.onPress();
    });

    const text = renderedText(renderer);
    expect(text).toContain('August 2026');
    expect(
      renderer.root.findByProps({accessibilityLabel: 'August 5, 2026'}),
    ).toBeDefined();
    expect(text).not.toMatch(HANGUL);

    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('renders the shared-log error banner in English when the runtime cannot start', async () => {
    const now = Date.now();
    const group: CareGroup = {
      id: groupId('group-en'),
      name: 'Baby',
      ownerId: userId('user-en'),
      babyIds: [babyId('baby-en')],
      createdAt: now,
      updatedAt: now,
    };
    const baby: Baby = {
      id: babyId('baby-en'),
      groupId: group.id,
      name: 'Baby',
      birthDate: '2026-08-01',
      sex: 'unspecified',
      createdAt: now,
      updatedAt: now,
    };
    const membership: Membership = {
      userId: userId('user-en'),
      groupId: group.id,
      caregiverRole: 'parent',
      membershipRole: 'owner',
      displayName: 'Mom',
      color: '#5FB49C',
      joinedAt: now,
    };
    const ready: ReadyCareSession = {
      uid: membership.userId,
      group,
      baby,
      membership,
      memberships: [membership],
      events: [],
    };

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <ParityDashboard initialReady={ready} onDeleted={jest.fn()} />,
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    const text = renderedText(renderer);
    expect(text).toContain("Couldn't prepare your shared log.");
    expect(text).not.toMatch(HANGUL);

    ReactTestRenderer.act(() => renderer.unmount());
  });
});
