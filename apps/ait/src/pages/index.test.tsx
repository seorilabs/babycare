import React from 'react';
import {KeyboardAvoidingView, Text} from 'react-native';
import ReactTestRenderer from 'react-test-renderer';
import {SafeAreaView} from 'react-native-safe-area-context';

import {BabyNestHome} from './index';
import {
  bootstrapCareSession,
  joinCareGroup,
} from '../services/babycare-backend';
import {babycareAnalytics} from '../services/analytics';

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({bottom: 34, left: 0, right: 0, top: 47}),
}));

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
    jest.clearAllMocks();
    jest.mocked(bootstrapCareSession).mockResolvedValue(undefined);
  });

  async function openJoinFlow() {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(<BabyNestHome />);
    });
    await ReactTestRenderer.act(async () => {
      renderer.root.findByProps({testID: 'service-intro-start'}).props.onPress();
      await Promise.resolve();
    });
    ReactTestRenderer.act(() => {
      renderer.root
        .findByProps({accessibilityLabel: 'I have an invite code'})
        .props.onPress();
    });
    ReactTestRenderer.act(() => {
      renderer.root
        .findByProps({accessibilityLabel: 'Caregiver name'})
        .props.onChangeText('Dad');
    });
    ReactTestRenderer.act(() => {
      renderer.root.findByProps({accessibilityLabel: 'Next'}).props.onPress();
    });
    ReactTestRenderer.act(() => {
      renderer.root
        .findByProps({accessibilityLabel: 'Invite code'})
        .props.onChangeText('ABC234');
    });
    return renderer;
  }

  it('tracks the AIT invite join success sequence', async () => {
    jest.mocked(joinCareGroup).mockResolvedValueOnce({} as never);
    const renderer = await openJoinFlow();
    await ReactTestRenderer.act(async () => {
      await renderer.root
        .findByProps({accessibilityLabel: 'Join care group'})
        .props.onPress();
    });

    const names = jest
      .mocked(babycareAnalytics.track)
      .mock.calls.map(([event]) => event.name);
    const attempt = names.indexOf('bc_invite_join_attempt');
    const joined = names.indexOf('bc_invite_joined');
    const completed = names.indexOf('bc_onboarding_complete');
    expect(attempt).toBeGreaterThanOrEqual(0);
    expect(joined).toBeGreaterThan(attempt);
    expect(completed).toBeGreaterThan(joined);
    expect(
      jest.mocked(babycareAnalytics.track).mock.calls[attempt]?.[0].params,
    ).toEqual({});
    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('tracks a classified AIT invite failure without the invite code', async () => {
    jest.mocked(joinCareGroup).mockRejectedValueOnce(
      Object.assign(new Error('invite ABC234 expired'), {
        code: 'invite/expired',
      }),
    );
    const renderer = await openJoinFlow();
    await ReactTestRenderer.act(async () => {
      await renderer.root
        .findByProps({accessibilityLabel: 'Join care group'})
        .props.onPress();
    });

    expect(babycareAnalytics.track).toHaveBeenCalledWith({
      name: 'bc_invite_join_failed',
      params: {reason_code: 'expired'},
    });
    const failedEvent = jest
      .mocked(babycareAnalytics.track)
      .mock.calls.find(([event]) => event.name === 'bc_invite_join_failed')?.[0];
    expect(JSON.stringify(failedEvent)).not.toContain('ABC234');
    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('shows the service intro without starting Toss login', () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;

    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(<BabyNestHome />);
    });

    const visibleText = renderedText(renderer);
    expect(visibleText).toContain('Keep every caregiver');
    expect(visibleText).toContain('Log in seconds');
    expect(visibleText).toContain('Share care');
    expect(visibleText).toContain('See the day');
    expect(visibleText).toContain('Continue with Toss');
    expect(visibleText).toContain('Toss login starts only after you tap this button');
    expect(renderer.root.findByProps({testID: 'service-intro'})).toBeDefined();
    expect(bootstrapCareSession).not.toHaveBeenCalled();

    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('shows the functional create and invite onboarding paths', async () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(<BabyNestHome />);
    });
    await ReactTestRenderer.act(async () => {
      renderer.root.findByProps({testID: 'service-intro-start'}).props.onPress();
      await Promise.resolve();
    });

    expect(bootstrapCareSession).toHaveBeenCalledTimes(1);
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
    expect(babycareAnalytics.track).toHaveBeenCalledWith({
      name: 'core_screen_view',
      params: {screen_name: 'boot', screen_class: 'BabyNestHome'},
    });
    expect(babycareAnalytics.track).toHaveBeenCalledWith({
      name: 'bc_boot_ready',
      params: {stage_ms: expect.any(Number)},
    });

    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('tracks a classified AIT boot failure without raw details', async () => {
    jest.mocked(bootstrapCareSession).mockRejectedValueOnce(
      new Error('network failure with invite ABC234'),
    );
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(<BabyNestHome />);
    });
    await ReactTestRenderer.act(async () => {
      renderer.root.findByProps({testID: 'service-intro-start'}).props.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(babycareAnalytics.track).toHaveBeenCalledWith({
      name: 'core_screen_view',
      params: {screen_name: 'boot_error', screen_class: 'BabyNestHome'},
    });
    expect(babycareAnalytics.track).toHaveBeenCalledWith({
      name: 'bc_boot_failed',
      params: {stage: 'session_restore', error_code: 'network'},
    });
    expect(JSON.stringify(jest.mocked(babycareAnalytics.track).mock.calls)).not.toContain(
      'ABC234',
    );
    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('lets the AIT tab bar own the active dashboard bottom inset', async () => {
    jest.mocked(bootstrapCareSession).mockResolvedValueOnce({} as never);
    let renderer!: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(<BabyNestHome />);
    });
    await ReactTestRenderer.act(async () => {
      renderer.root.findByProps({testID: 'service-intro-start'}).props.onPress();
      await Promise.resolve();
    });

    expect(renderer.root.findByProps({testID: 'active-dashboard-frame'})).toBeDefined();
    expect(renderer.root.findByProps({testID: 'parity-dashboard'})).toBeDefined();
    expect(renderer.root.findAllByType(SafeAreaView)).toHaveLength(0);

    ReactTestRenderer.act(() => renderer.unmount());
  });
});
