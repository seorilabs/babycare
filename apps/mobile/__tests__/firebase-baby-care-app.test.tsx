import React from 'react';
import {Text} from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

import {bootstrapFirebaseRuntime} from '../src/app/firebase-runtime';
import {FirebaseBabyCareApp} from '../src/app/FirebaseBabyCareApp';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
  removeItem: jest.fn(async () => undefined),
}));

jest.mock('react-native-safe-area-context', () => {
  const ReactModule = jest.requireActual<typeof React>('react');
  const {View} = jest.requireActual<typeof import('react-native')>(
    'react-native',
  );
  return {
    SafeAreaView: ({
      children,
      ...props
    }: React.ComponentProps<typeof View>) =>
      ReactModule.createElement(View, props, children),
  };
});

jest.mock('../src/app/firebase-runtime', () => ({
  bootstrapFirebaseRuntime: jest.fn(),
}));

const bootstrap = jest.mocked(bootstrapFirebaseRuntime);

function visibleText(renderer: ReactTestRenderer.ReactTestRenderer): string {
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

describe('FirebaseBabyCareApp product copy', () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

  afterEach(() => {
    if (renderer) {
      ReactTestRenderer.act(() => renderer?.unmount());
      renderer = undefined;
    }
    bootstrap.mockReset();
  });

  it('describes loading in product language without exposing the backend', () => {
    bootstrap.mockReturnValue(new Promise(() => undefined));

    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(<FirebaseBabyCareApp />);
    });
    if (!renderer) {
      throw new Error('Firebase 제품 화면을 렌더링하지 못했어요');
    }

    expect(visibleText(renderer)).toContain('계정과 돌봄 그룹을 확인합니다');
    expect(visibleText(renderer)).not.toContain('Firebase');
  });

  it('hides technical details when startup fails', async () => {
    bootstrap.mockRejectedValue(
      new Error(
        'Firebase native client configuration is missing from this release build',
      ),
    );

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(<FirebaseBabyCareApp />);
      await Promise.resolve();
      await Promise.resolve();
    });
    if (!renderer) {
      throw new Error('Firebase 오류 화면을 렌더링하지 못했어요');
    }

    expect(visibleText(renderer)).toContain('공동 기록을 시작하지 못했어요');
    expect(visibleText(renderer)).not.toContain('native client configuration');
    expect(visibleText(renderer)).not.toContain('Firebase');
  });
});
