import React from 'react';
import {Alert, Share, Text} from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

import {createTheme} from '../src/app/theme';
import {MoreScreen} from '../src/screens/MoreScreen';

describe('MoreScreen', () => {
  it('does not expose unfinished or stale release labels', () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;

    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <MoreScreen
          onReset={async () => undefined}
          session={{
            groupId: 'group-1',
            babyId: 'baby-1',
            caregiverId: 'owner-1',
            caregiverName: '엄마',
            babyName: '하루',
            birthDate: '2026-01-01',
            inviteCode: 'ABC234',
            runtimeMode: 'firebase',
            membershipRole: 'owner',
          }}
          theme={createTheme(false)}
        />,
      );
    });

    const visibleText = renderer.root
      .findAllByType(Text)
      .map(node => node.props.children)
      .flat(Infinity);

    expect(visibleText).not.toContain('데이터 내보내기');
    expect(visibleText).not.toContain('준비 중');
    expect(visibleText).not.toContain('개발 빌드 0.1.0');
    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('shares an invite with the confirmed product name', async () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue({
      action: 'sharedAction',
    });
    share.mockClear();
    let renderer!: ReactTestRenderer.ReactTestRenderer;

    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <MoreScreen
          onReset={async () => undefined}
          session={{
            groupId: 'group-1',
            babyId: 'baby-1',
            caregiverId: 'owner-1',
            caregiverName: '엄마',
            babyName: '하루',
            birthDate: '2026-01-01',
            inviteCode: 'ABC234',
            runtimeMode: 'firebase',
            membershipRole: 'owner',
          }}
          theme={createTheme(false)}
        />,
      );
    });

    ReactTestRenderer.act(() => {
      renderer.root
        .findByProps({accessibilityLabel: '초대 코드 공유'})
        .props.onPress();
    });

    expect(share).toHaveBeenCalledWith({
      message: '함께봄 돌봄 그룹 초대 코드: ABC234',
    });
    await ReactTestRenderer.act(async () => {
      await Promise.resolve();
    });
    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('does not expose an expired invite for sharing and offers a replacement', async () => {
    const createInvite = jest.fn(async () => undefined);
    const share = jest.spyOn(Share, 'share').mockResolvedValue({
      action: 'sharedAction',
    });
    share.mockClear();
    let renderer!: ReactTestRenderer.ReactTestRenderer;

    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <MoreScreen
          inviteExpiresAt={Date.now() - 60_000}
          onCreateInvite={createInvite}
          onReset={async () => undefined}
          session={{
            groupId: 'group-1',
            babyId: 'baby-1',
            caregiverId: 'owner-1',
            caregiverName: '엄마',
            babyName: '하루',
            birthDate: '2026-01-01',
            inviteCode: 'ABC234',
            runtimeMode: 'firebase',
            membershipRole: 'owner',
          }}
          theme={createTheme(false)}
        />,
      );
    });

    const visibleText = renderer.root
      .findAllByType(Text)
      .map(node => node.props.children)
      .flat(Infinity);
    expect(visibleText).toContain('초대 코드가 만료됐어요');
    expect(visibleText).not.toContain('ABC234');
    expect(
      renderer.root.findAllByProps({accessibilityLabel: '초대 코드 공유'}),
    ).toHaveLength(0);

    await ReactTestRenderer.act(async () => {
      renderer.root
        .findByProps({accessibilityLabel: '새 초대 코드 만들기'})
        .props.onPress();
      await Promise.resolve();
    });

    expect(createInvite).toHaveBeenCalledTimes(1);
    expect(share).not.toHaveBeenCalled();
    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('submits only one invite creation request while it is in progress', async () => {
    let finishInvite!: () => void;
    const createInvite = jest.fn(
      () =>
        new Promise<void>(resolve => {
          finishInvite = resolve;
        }),
    );
    let renderer!: ReactTestRenderer.ReactTestRenderer;

    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <MoreScreen
          onCreateInvite={createInvite}
          onReset={async () => undefined}
          session={{
            groupId: 'group-1',
            babyId: 'baby-1',
            caregiverId: 'owner-1',
            caregiverName: '엄마',
            babyName: '하루',
            birthDate: '2026-01-01',
            inviteCode: '',
            runtimeMode: 'firebase',
            membershipRole: 'owner',
          }}
          theme={createTheme(false)}
        />,
      );
    });

    const action = renderer.root.findByProps({
      accessibilityLabel: '초대 코드 만들기',
    });
    ReactTestRenderer.act(() => {
      action.props.onPress();
      action.props.onPress();
    });

    expect(createInvite).toHaveBeenCalledTimes(1);
    const pendingAction = renderer.root.findByProps({
      accessibilityLabel: '초대 코드 만드는 중',
    });
    expect(pendingAction.props.disabled).toBe(true);
    expect(pendingAction.props.accessibilityState).toEqual({
      busy: true,
      disabled: true,
    });

    await ReactTestRenderer.act(async () => {
      finishInvite();
      await Promise.resolve();
    });
    expect(
      renderer.root.findByProps({accessibilityLabel: '초대 코드 만들기'})
        .props.disabled,
    ).toBe(false);
    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('labels membership refresh by its real behavior and surfaces failures', async () => {
    const refreshMembers = jest.fn(async () => {
      throw new Error('네트워크 연결을 확인해 주세요.');
    });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation();
    let renderer!: ReactTestRenderer.ReactTestRenderer;

    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <MoreScreen
          onRefreshMembers={refreshMembers}
          onReset={async () => undefined}
          session={{
            groupId: 'group-1',
            babyId: 'baby-1',
            caregiverId: 'owner-1',
            caregiverName: '엄마',
            babyName: '하루',
            birthDate: '2026-01-01',
            inviteCode: 'ABC234',
            runtimeMode: 'firebase',
            membershipRole: 'owner',
          }}
          theme={createTheme(false)}
        />,
      );
    });

    const visibleText = renderer.root
      .findAllByType(Text)
      .map(node => node.props.children)
      .flat(Infinity);
    expect(visibleText).toContain('구성원 목록 새로고침');

    ReactTestRenderer.act(() => {
      renderer.root
        .findByProps({accessibilityLabel: '구성원 목록 새로고침'})
        .props.onPress();
    });
    await ReactTestRenderer.act(async () => {
      await Promise.resolve();
    });

    expect(refreshMembers).toHaveBeenCalledTimes(1);
    expect(alert).toHaveBeenCalledWith(
      '구성원 목록을 새로고침하지 못했어요',
      '네트워크 연결을 확인해 주세요.',
    );
    ReactTestRenderer.act(() => renderer.unmount());
  });
});
