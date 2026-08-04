import React from 'react';
import {StyleSheet, Text} from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

import type {LocalSession} from '../src/app/session';
import {createTheme} from '../src/app/theme';
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

  it('lets the record-time controls wrap on narrow screens', () => {
    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <QuickRecordModal
          kind="diaper"
          onClose={jest.fn()}
          onSave={jest.fn(async () => undefined)}
          session={session}
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
