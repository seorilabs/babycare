import React from 'react';
import {StyleSheet, Text} from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

import type {LocalSession} from '../src/app/session';
import {createTheme} from '../src/app/theme';
import { createStrings } from '../src/app/i18n';
import {QuickRecordModal} from '../src/components/QuickRecordModal';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({bottom: 0, left: 0, right: 0, top: 0}),
}));

const session: LocalSession = {
  groupId: 'group-1',
  babyId: 'baby-1',
  caregiverId: 'caregiver-1',
  caregiverName: '엄마',
  babyName: '하루',
  birthDate: '2026-01-01',
  inviteCode: 'ABC234',
  runtimeMode: 'firebase',
  membershipRole: 'owner',
};

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

describe('QuickRecordModal', () => {
  let renderer: ReactTestRenderer.ReactTestRenderer | undefined;

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    if (renderer) {
      ReactTestRenderer.act(() => renderer?.unmount());
      renderer = undefined;
    }
    jest.useRealTimers();
  });

  it('submits only one care record while saving is in progress', async () => {
    let finishSave!: () => void;
    const saveRequest = new Promise<void>(resolve => {
      finishSave = resolve;
    });
    const onSave = jest.fn(() => saveRequest);
    const onClose = jest.fn();
    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <QuickRecordModal
          kind="diaper"
          onClose={onClose}
          onSave={onSave}
          session={session}
          strings={createStrings('ko')}
          theme={createTheme(false)}
        />,
      );
    });
    if (!renderer) {
      throw new Error('빠른 기록 모달을 렌더링하지 못했어요');
    }

    const saveButton = renderer.root.findByProps({
      accessibilityLabel: '돌봄 기록 저장',
    });
    ReactTestRenderer.act(() => {
      saveButton.props.onPress();
      saveButton.props.onPress();
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    const pendingButton = renderer.root.findByProps({
      accessibilityLabel: '돌봄 기록 저장 중',
    });
    expect(pendingButton.props.disabled).toBe(true);
    expect(pendingButton.props.accessibilityState).toEqual({
      busy: true,
      disabled: true,
    });

    await ReactTestRenderer.act(async () => {
      finishSave();
      await saveRequest;
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('hides technical details when saving fails', async () => {
    const technicalMessage =
      '[firestore/unavailable] The service is currently unavailable.';
    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <QuickRecordModal
          kind="diaper"
          onClose={jest.fn()}
          onSave={jest.fn(async () => {
            throw new Error(technicalMessage);
          })}
          session={session}
          strings={createStrings('ko')}
          theme={createTheme(false)}
        />,
      );
    });
    if (!renderer) {
      throw new Error('빠른 기록 모달을 렌더링하지 못했어요');
    }

    await ReactTestRenderer.act(async () => {
      await renderer?.root
        .findByProps({accessibilityLabel: '돌봄 기록 저장'})
        .props.onPress();
    });

    expect(visibleText(renderer)).toContain(
      '기록을 저장하지 못했어요. 연결을 확인하고 다시 시도해 주세요.',
    );
    expect(visibleText(renderer)).not.toContain(technicalMessage);
    expect(visibleText(renderer)).not.toContain('firestore');
  });

  it('exposes and updates the selected care option before saving', async () => {
    const onSave = jest.fn(async () => undefined);
    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <QuickRecordModal
          kind="diaper"
          onClose={jest.fn()}
          onSave={onSave}
          session={session}
          strings={createStrings('ko')}
          theme={createTheme(false)}
        />,
      );
    });
    if (!renderer) {
      throw new Error('빠른 기록 모달을 렌더링하지 못했어요');
    }

    const radios = () =>
      renderer?.root
        .findAllByProps({accessibilityRole: 'radio'})
        .filter(node => node.parent?.props.accessibilityRole !== 'radio') ?? [];

    expect(radios()).toHaveLength(3);
    expect(radios().map(node => node.props.accessibilityState)).toEqual([
      {selected: true},
      {selected: false},
      {selected: false},
    ]);

    ReactTestRenderer.act(() => radios()[1]!.props.onPress());
    expect(radios().map(node => node.props.accessibilityState)).toEqual([
      {selected: false},
      {selected: true},
      {selected: false},
    ]);

    await ReactTestRenderer.act(async () => {
      await renderer?.root
        .findByProps({accessibilityLabel: '돌봄 기록 저장'})
        .props.onPress();
    });
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({diaperType: 'dirty', kind: 'diaper'}),
    );
  });

  it('announces and saves the adjusted feeding volume', async () => {
    const onSave = jest.fn(async () => undefined);
    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <QuickRecordModal
          kind="feeding"
          onClose={jest.fn()}
          onSave={onSave}
          session={session}
          strings={createStrings('ko')}
          theme={createTheme(false)}
        />,
      );
    });
    if (!renderer) {
      throw new Error('빠른 기록 모달을 렌더링하지 못했어요');
    }

    expect(
      renderer.root.findByProps({accessibilityLabel: '수유량 120밀리리터'})
        .props,
    ).toMatchObject({accessible: true, accessibilityLiveRegion: 'polite'});
    const decreaseButton = renderer.root.findByProps({
      accessibilityLabel: '수유량 10밀리리터 줄이기',
    });
    const increaseButton = renderer.root.findByProps({
      accessibilityLabel: '수유량 10밀리리터 늘리기',
    });
    expect(decreaseButton.props.accessibilityRole).toBe('button');
    expect(increaseButton.props.accessibilityRole).toBe('button');

    ReactTestRenderer.act(() => increaseButton.props.onPress());
    expect(
      renderer.root.findByProps({accessibilityLabel: '수유량 130밀리리터'}),
    ).toBeDefined();

    await ReactTestRenderer.act(async () => {
      await renderer?.root
        .findByProps({accessibilityLabel: '돌봄 기록 저장'})
        .props.onPress();
    });
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        feedingType: 'formula',
        kind: 'feeding',
        volumeMl: 130,
      }),
    );
  });

  it('announces and saves the measured breastfeeding timer', async () => {
    const startedAt = new Date('2026-08-06T00:00:00+09:00');
    jest.setSystemTime(startedAt);
    const onSave = jest.fn(async () => undefined);
    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <QuickRecordModal
          kind="feeding"
          onClose={jest.fn()}
          onSave={onSave}
          session={session}
          strings={createStrings('ko')}
          theme={createTheme(false)}
        />,
      );
    });
    if (!renderer) {
      throw new Error('빠른 기록 모달을 렌더링하지 못했어요');
    }

    const feedingChoices = renderer.root
      .findAllByProps({accessibilityRole: 'radio'})
      .filter(node => node.parent?.props.accessibilityRole !== 'radio');
    ReactTestRenderer.act(() => feedingChoices[0]!.props.onPress());

    const startButton = renderer.root.findByProps({
      accessibilityLabel: '왼쪽 모유 타이머 시작',
    });
    const resetButton = renderer.root.findByProps({
      accessibilityLabel: '모유 타이머 초기화',
    });
    expect(startButton.props.accessibilityRole).toBe('button');
    expect(resetButton.props.accessibilityRole).toBe('button');

    ReactTestRenderer.act(() => startButton.props.onPress());
    const pauseButton = renderer.root.findByProps({
      accessibilityLabel: '왼쪽 모유 타이머 일시정지',
    });
    jest.setSystemTime(new Date(startedAt.getTime() + 5_000));
    ReactTestRenderer.act(() => pauseButton.props.onPress());
    expect(
      renderer.root.findByProps({
        accessibilityLabel: '왼쪽 모유 타이머 계속',
      }),
    ).toBeDefined();

    await ReactTestRenderer.act(async () => {
      await renderer?.root
        .findByProps({accessibilityLabel: '돌봄 기록 저장'})
        .props.onPress();
    });
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        feedingType: 'breast',
        kind: 'feeding',
        leftDurationSeconds: 5,
      }),
    );
  });

  it('explains when a breastfeeding record can be saved', () => {
    const startedAt = new Date('2026-08-06T08:00:00+09:00');
    jest.setSystemTime(startedAt);
    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <QuickRecordModal
          kind="feeding"
          onClose={jest.fn()}
          onSave={jest.fn(async () => undefined)}
          session={session}
          strings={createStrings('ko')}
          theme={createTheme(false)}
        />,
      );
    });
    if (!renderer) {
      throw new Error('빠른 기록 모달을 렌더링하지 못했어요');
    }

    const feedingChoices = renderer.root
      .findAllByProps({accessibilityRole: 'radio'})
      .filter(node => node.parent?.props.accessibilityRole !== 'radio');
    ReactTestRenderer.act(() => feedingChoices[0]!.props.onPress());

    const guidance = '모유 타이머를 1초 이상 측정하면 저장할 수 있어요.';
    const disabledSave = renderer.root.findByProps({
      accessibilityLabel: '돌봄 기록 저장',
    });
    expect(disabledSave.props.accessibilityState).toEqual({
      busy: false,
      disabled: true,
    });
    expect(disabledSave.props.accessibilityHint).toBe(guidance);
    expect(visibleText(renderer)).toContain(guidance);

    ReactTestRenderer.act(() => {
      renderer?.root
        .findByProps({accessibilityLabel: '왼쪽 모유 타이머 시작'})
        .props.onPress();
    });
    jest.setSystemTime(new Date(startedAt.getTime() + 1_000));
    ReactTestRenderer.act(() => jest.advanceTimersByTime(250));

    const enabledSave = renderer.root.findByProps({
      accessibilityLabel: '돌봄 기록 저장',
    });
    expect(enabledSave.props.accessibilityState).toEqual({
      busy: false,
      disabled: false,
    });
    expect(enabledSave.props.accessibilityHint).toBeUndefined();
    expect(visibleText(renderer)).not.toContain(guidance);
  });

  it('announces and saves an adjusted record time', async () => {
    const startedAt = new Date('2026-08-06T04:00:00+09:00');
    jest.setSystemTime(startedAt);
    const onSave = jest.fn(async () => undefined);
    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <QuickRecordModal
          kind="diaper"
          onClose={jest.fn()}
          onSave={onSave}
          session={session}
          strings={createStrings('ko')}
          theme={createTheme(false)}
        />,
      );
    });
    if (!renderer) {
      throw new Error('빠른 기록 모달을 렌더링하지 못했어요');
    }

    const decreaseButton = renderer.root.findByProps({
      accessibilityLabel: '기록 시각 10분 앞당기기',
    });
    const nowButton = renderer.root.findByProps({
      accessibilityLabel: '기록 시각을 지금으로 설정',
    });
    expect(decreaseButton.props.accessibilityRole).toBe('button');
    expect(nowButton.props.accessibilityRole).toBe('button');

    ReactTestRenderer.act(() => decreaseButton.props.onPress());
    await ReactTestRenderer.act(async () => {
      await renderer?.root
        .findByProps({accessibilityLabel: '돌봄 기록 저장'})
        .props.onPress();
    });
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'diaper',
        occurredAt: startedAt.getTime() - 10 * 60_000,
      }),
    );
  });

  it('lets the record-time controls wrap on narrow screens', () => {
    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <QuickRecordModal
          kind="diaper"
          onClose={jest.fn()}
          onSave={jest.fn(async () => undefined)}
          session={session}
          strings={createStrings('ko')}
          theme={createTheme(false)}
        />,
      );
    });
    if (!renderer) {
      throw new Error('빠른 기록 모달을 렌더링하지 못했어요');
    }

    const hasText = (
      node: ReactTestRenderer.ReactTestInstance,
      text: string,
    ) => node.findAllByType(Text).some(child => child.props.children === text);
    const timeRow = renderer.root.findAll(node => {
      const style = StyleSheet.flatten(node.props.style);
      return style?.flexWrap === 'wrap' && style?.gap === 12 && hasText(node, '−10분');
    })[0];
    const timeCopy = renderer.root.findAll(node => {
      const style = StyleSheet.flatten(node.props.style);
      return style?.flexBasis === 120 && hasText(node, '선택한 시각으로 저장');
    })[0];
    const timeButtons = renderer.root.findAll(node => {
      const style = StyleSheet.flatten(node.props.style);
      return style?.flexShrink === 0 && hasText(node, '−10분');
    })[0];

    expect(StyleSheet.flatten(timeRow?.props.style)).toMatchObject({
      flexWrap: 'wrap',
      gap: 12,
    });
    expect(StyleSheet.flatten(timeCopy?.props.style)).toMatchObject({
      flexBasis: 120,
      flexGrow: 1,
      minWidth: 0,
    });
    expect(StyleSheet.flatten(timeButtons?.props.style)).toMatchObject({
      flexShrink: 0,
    });
  });
});
