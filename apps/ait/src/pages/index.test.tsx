import React from 'react';
import {KeyboardAvoidingView, ScrollView, Text} from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

import {BabyNestHome} from './index';

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
  it('shows the functional create and invite onboarding paths', async () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(<BabyNestHome />);
      await Promise.resolve();
    });

    const visibleText = renderedText(renderer);
    expect(visibleText).toContain('함께 남기는 아기 돌봄 기록');
    expect(visibleText).toContain('새 돌봄 시작');
    expect(visibleText).toContain('초대 코드 참여');
    expect(visibleText).toContain('수유, 기저귀, 수면, 체온, 복약');
    expect(visibleText).toContain('의료 판단이나 진단을 제공하지 않습니다.');
    expect(visibleText).not.toContain('build-only');
    expect(visibleText).not.toContain('sandbox');
    expect(renderer.root.findAllByType(KeyboardAvoidingView)).toHaveLength(1);
    expect(
      renderer.root.findByProps({accessibilityLabel: '아기 생년월일 선택'})
        .props.accessibilityRole,
    ).toBe('button');
    expect(renderer.root.findByType(ScrollView).props).toMatchObject({
      automaticallyAdjustKeyboardInsets: true,
      keyboardShouldPersistTaps: 'handled',
    });

    ReactTestRenderer.act(() => renderer.unmount());
  });
});
