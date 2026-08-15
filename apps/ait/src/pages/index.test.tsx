import React from 'react';
import {KeyboardAvoidingView, Text} from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import {SafeAreaView} from 'react-native-safe-area-context';

import {BabyNestHome} from './index';
import {bootstrapCareSession} from '../services/babycare-backend';

jest.mock('@toss/tds-react-native', () => {
  const ReactModule = jest.requireActual<typeof React>('react');
  const Native = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Button: ({children, ...props}: React.PropsWithChildren<Record<string, unknown>>) =>
      ReactModule.createElement(
        Native.Pressable,
        props,
        ReactModule.createElement(Native.Text, undefined, children),
      ),
  };
});

jest.mock('@apps-in-toss/framework', () => ({
  Storage: {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => undefined),
    removeItem: jest.fn(async () => undefined),
  },
}));

jest.mock('../services/babycare-backend', () => ({
  bootstrapCareSession: jest.fn(async () => undefined),
  createCareGroup: jest.fn(),
  createInviteCode: jest.fn(),
  deleteCareAccount: jest.fn(),
  joinCareGroup: jest.fn(),
  reloadCareSession: jest.fn(),
}));

jest.mock('../services/analytics', () => ({
  babycareAnalytics: {track: jest.fn(async () => undefined)},
}));

jest.mock('../services/rewarded-ad', () => ({
  appsInTossRewardedAd: {
    preload: jest.fn(async () => undefined),
    show: jest.fn(async () => ({status: 'unavailable'})),
  },
}));

jest.mock('../components/parity-dashboard', () => {
  const ReactModule = jest.requireActual<typeof React>('react');
  const Native = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    ParityDashboard: () =>
      ReactModule.createElement(Native.View, {testID: 'parity-dashboard'}),
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
    .join(' ')
    .replace(/\s+/g, ' ');
}

describe('BabyNestHome', () => {
  beforeEach(() => {
    jest.mocked(bootstrapCareSession).mockResolvedValue(undefined);
  });

  it('shows the functional create and invite onboarding paths', async () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(<BabyNestHome />);
      await Promise.resolve();
    });

    const visibleText = renderedText(renderer);
    expect(visibleText).toContain("Know what happened, even when you weren't there");
    expect(visibleText).toContain('Log care in seconds');
    expect(visibleText).toContain('Easy handoffs');
    expect(visibleText).toContain('Invite-only sharing');
    expect(visibleText).toContain('Set up my baby');
    expect(visibleText).toContain('I have an invite code');
    expect(visibleText).not.toContain('build-only');
    expect(visibleText).not.toContain('sandbox');
    expect(renderer.root.findAllByType(KeyboardAvoidingView)).toHaveLength(1);
    expect(renderer.root.findByProps({testID: 'onboarding-benefits'})).toBeDefined();

    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('lets the AIT tab bar own the active dashboard bottom inset', async () => {
    jest.mocked(bootstrapCareSession).mockResolvedValueOnce({} as never);
    let renderer!: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(<BabyNestHome />);
      await Promise.resolve();
    });

    expect(renderer.root.findByProps({testID: 'active-dashboard-frame'})).toBeDefined();
    expect(renderer.root.findByProps({testID: 'parity-dashboard'})).toBeDefined();
    expect(renderer.root.findAllByType(SafeAreaView)).toHaveLength(0);

    ReactTestRenderer.act(() => renderer.unmount());
  });
});
