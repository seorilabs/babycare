import React from 'react';
import DateTimePicker from '@react-native-community/datetimepicker';
import { ScrollView, Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

import { createTheme } from '../src/app/theme';
import { createStrings } from '../src/app/i18n';
import { CloudOnboardingScreen } from '../src/screens/CloudOnboardingScreen';

jest.mock('@react-native-community/datetimepicker', () => 'DateTimePicker');
jest.mock('react-native-safe-area-context', () => {
  const ReactModule = jest.requireActual<typeof React>('react');
  const { View } = jest.requireActual<typeof import('react-native')>(
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

const theme = createTheme(false);

function setup(input: {
  onCreate?: () => Promise<void>;
  onJoin?: () => Promise<void>;
} = {}) {
  const onCreate = jest.fn(input.onCreate ?? (async () => undefined));
  const onJoin = jest.fn(input.onJoin ?? (async () => undefined));
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    renderer = ReactTestRenderer.create(
      <CloudOnboardingScreen
        onCreate={onCreate}
        onJoin={onJoin}
        strings={createStrings('ko')}
        theme={theme}
      />,
    );
  });
  return { onCreate, onJoin, renderer };
}

function press(renderer: ReactTestRenderer.ReactTestRenderer, label: string) {
  ReactTestRenderer.act(() => {
    renderer.root.findByProps({ accessibilityLabel: label }).props.onPress();
  });
}

function changeText(
  renderer: ReactTestRenderer.ReactTestRenderer,
  label: string,
  value: string,
) {
  ReactTestRenderer.act(() => {
    renderer.root
      .findByProps({ accessibilityLabel: label })
      .props.onChangeText(value);
  });
}

describe('CloudOnboardingScreen', () => {
  it('keeps content scrollable inside the safe area', () => {
    const state = setup();

    expect(
      state.renderer.root.findByProps({
        testID: 'cloud-onboarding-safe-area',
      }),
    ).toBeDefined();
    const scrollView = state.renderer.root.findByType(ScrollView);
    expect(scrollView.props.keyboardShouldPersistTaps).toBe('handled');
    expect(scrollView.props.showsVerticalScrollIndicator).toBe(false);
    expect(scrollView.props.contentContainerStyle).toEqual(
      expect.objectContaining({ flexGrow: 1 }),
    );
    ReactTestRenderer.act(() => state.renderer.unmount());
  });

  it('uses product copy while preserving the anonymous-account safety warning', () => {
    const state = setup();
    const visibleText = state.renderer.root
      .findAllByType(Text)
      .flatMap(node => node.props.children)
      .filter(value => typeof value === 'string')
      .join(' ');

    expect(visibleText).toContain('함께봄 공동 기록');
    expect(visibleText).toContain(
      '앱을 삭제하거나 기기를 바꾸면 현재 계정과 기록에 다시 접근하지 못할 수 있어요.',
    );
    expect(visibleText).not.toContain('Firebase');
    expect(visibleText).not.toContain('현재 개발 빌드');
    expect(visibleText).not.toContain('출시 전에');
    ReactTestRenderer.act(() => state.renderer.unmount());
  });

  it('collects creation fields one screen at a time and submits the picked date', async () => {
    const state = setup();

    expect(() =>
      state.renderer.root.findByProps({ accessibilityLabel: '양육자 이름' }),
    ).toThrow();
    press(state.renderer, '처음 시작하기');
    changeText(state.renderer, '양육자 이름', '엄마');
    expect(
      state.renderer.root.findByProps({ accessibilityLabel: '다음' }).props
        .disabled,
    ).toBe(false);
    press(state.renderer, '다음');

    changeText(state.renderer, '아기 이름', '하루');
    press(state.renderer, '다음');
    press(state.renderer, '아기 생년월일');
    ReactTestRenderer.act(() => {
      state.renderer.root
        .findByType(DateTimePicker)
        .props.onChange({ type: 'set' }, new Date(2020, 0, 1));
    });
    expect(
      state.renderer.root.findByProps({
        accessibilityLabel: '돌봄 그룹 만들기',
      }).props.disabled,
    ).toBe(false);

    await ReactTestRenderer.act(async () => {
      await state.renderer.root
        .findByProps({ accessibilityLabel: '돌봄 그룹 만들기' })
        .props.onPress();
    });
    expect(state.onCreate).toHaveBeenCalledWith({
      caregiverName: '엄마',
      babyName: '하루',
      birthDate: '2020-01-01',
    });
    expect(state.onJoin).not.toHaveBeenCalled();
    ReactTestRenderer.act(() => state.renderer.unmount());
  });

  it('explains the actual birth-date use without promising growth records', () => {
    const state = setup();
    press(state.renderer, '처음 시작하기');
    changeText(state.renderer, '양육자 이름', '엄마');
    press(state.renderer, '다음');
    changeText(state.renderer, '아기 이름', '하루');
    press(state.renderer, '다음');

    const visibleText = state.renderer.root
      .findAllByType(Text)
      .flatMap(node => node.props.children)
      .filter(value => typeof value === 'string')
      .join(' ');
    expect(visibleText).toContain(
      '홈에서 아기의 생후 일수를 표시하는 데 사용해요.',
    );
    expect(visibleText).not.toContain('성장 기록');
    ReactTestRenderer.act(() => state.renderer.unmount());
  });

  it('submits only one group creation request while setup is in progress', async () => {
    let finishCreate!: () => void;
    const createRequest = new Promise<void>(resolve => {
      finishCreate = resolve;
    });
    const onCreate = jest.fn(() => createRequest);
    const onJoin = jest.fn(async () => undefined);
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <CloudOnboardingScreen
          onCreate={onCreate}
          onJoin={onJoin}
          strings={createStrings('ko')}
          theme={theme}
        />,
      );
    });

    press(renderer, '처음 시작하기');
    changeText(renderer, '양육자 이름', '엄마');
    press(renderer, '다음');
    changeText(renderer, '아기 이름', '하루');
    press(renderer, '다음');
    press(renderer, '아기 생년월일');
    ReactTestRenderer.act(() => {
      renderer.root
        .findByType(DateTimePicker)
        .props.onChange({ type: 'set' }, new Date(2020, 0, 1));
    });

    const createButton = renderer.root.findByProps({
      accessibilityLabel: '돌봄 그룹 만들기',
    });
    ReactTestRenderer.act(() => {
      createButton.props.onPress();
      createButton.props.onPress();
    });

    expect(onCreate).toHaveBeenCalledTimes(1);
    const pendingButton = renderer.root.findByProps({
      accessibilityLabel: '공동 기록을 준비하는 중…',
    });
    expect(pendingButton.props.disabled).toBe(true);
    expect(pendingButton.props.accessibilityState).toEqual({
      busy: true,
      disabled: true,
    });

    await ReactTestRenderer.act(async () => {
      finishCreate();
      await createRequest;
    });
    expect(
      renderer.root.findByProps({
        accessibilityLabel: '돌봄 그룹 만들기',
      }).props.disabled,
    ).toBe(false);
    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('does not expose technical errors when group creation fails', async () => {
    const state = setup({
      onCreate: async () => {
        throw new Error(
          '[firestore/unavailable] The service is currently unavailable.',
        );
      },
    });
    press(state.renderer, '처음 시작하기');
    changeText(state.renderer, '양육자 이름', '엄마');
    press(state.renderer, '다음');
    changeText(state.renderer, '아기 이름', '하루');
    press(state.renderer, '다음');
    press(state.renderer, '아기 생년월일');
    ReactTestRenderer.act(() => {
      state.renderer.root
        .findByType(DateTimePicker)
        .props.onChange({ type: 'set' }, new Date(2020, 0, 1));
    });

    await ReactTestRenderer.act(async () => {
      await state.renderer.root
        .findByProps({ accessibilityLabel: '돌봄 그룹 만들기' })
        .props.onPress();
    });

    const visibleText = state.renderer.root
      .findAllByType(Text)
      .flatMap(node => node.props.children)
      .filter(value => typeof value === 'string')
      .join(' ');
    expect(visibleText).toContain(
      '돌봄 그룹을 만들지 못했어요. 연결을 확인하고 다시 시도해 주세요.',
    );
    expect(visibleText).not.toContain('firestore');
    expect(visibleText).not.toContain('unavailable');
    ReactTestRenderer.act(() => state.renderer.unmount());
  });

  it('requires six invite characters after choosing the join flow', async () => {
    const state = setup();
    press(state.renderer, '초대 코드로 참여');
    changeText(state.renderer, '양육자 이름', '아빠');
    press(state.renderer, '다음');

    changeText(state.renderer, '초대 코드', 'abc23');
    expect(
      state.renderer.root.findByProps({
        accessibilityLabel: '돌봄 그룹 참여하기',
      }).props.disabled,
    ).toBe(true);

    changeText(state.renderer, '초대 코드', 'abc2i34');
    const codeInput = state.renderer.root.findByProps({
      accessibilityLabel: '초대 코드',
    });
    expect(codeInput.props.value).toBe('ABC234');

    await ReactTestRenderer.act(async () => {
      await state.renderer.root
        .findByProps({ accessibilityLabel: '돌봄 그룹 참여하기' })
        .props.onPress();
    });
    expect(state.onJoin).toHaveBeenCalledWith({
      caregiverName: '아빠',
      code: 'ABC234',
    });
    expect(state.onCreate).not.toHaveBeenCalled();
    ReactTestRenderer.act(() => state.renderer.unmount());
  });

  it('does not expose technical errors when joining an invite fails', async () => {
    const state = setup({
      onJoin: async () => {
        throw new Error(
          '[functions/failed-precondition] Invite is invalid or unavailable',
        );
      },
    });
    press(state.renderer, '초대 코드로 참여');
    changeText(state.renderer, '양육자 이름', '아빠');
    press(state.renderer, '다음');
    changeText(state.renderer, '초대 코드', 'ABC234');

    await ReactTestRenderer.act(async () => {
      await state.renderer.root
        .findByProps({ accessibilityLabel: '돌봄 그룹 참여하기' })
        .props.onPress();
    });

    const visibleText = state.renderer.root
      .findAllByType(Text)
      .flatMap(node => node.props.children)
      .filter(value => typeof value === 'string')
      .join(' ');
    expect(visibleText).toContain(
      '돌봄 그룹에 참여하지 못했어요. 코드를 확인하거나 새 코드를 요청해 주세요.',
    );
    expect(visibleText).not.toContain('functions');
    expect(visibleText).not.toContain('failed-precondition');
    ReactTestRenderer.act(() => state.renderer.unmount());
  });
});
