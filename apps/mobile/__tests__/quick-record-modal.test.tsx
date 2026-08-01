import React from 'react';
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
});
