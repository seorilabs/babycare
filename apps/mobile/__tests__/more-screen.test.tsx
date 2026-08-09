import React from 'react';
import {Alert, Linking, Share, StyleSheet, Text} from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

import {createTheme} from '../src/app/theme';
import { createStrings } from '../src/app/i18n';
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
          strings={createStrings('ko')}
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

  it('keeps the longest allowed baby name clear of the mode badge', () => {
    const longBabyName = '아'.repeat(80);
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
            babyName: longBabyName,
            birthDate: '2026-01-01',
            inviteCode: 'ABC234',
            runtimeMode: 'firebase',
            membershipRole: 'owner',
          }}
          strings={createStrings('ko')}
          theme={createTheme(false)}
        />,
      );
    });

    const groupName = renderer.root.findAllByType(Text).find(
      node =>
        node.props.children ===
        createStrings('ko').more.groupName(longBabyName),
    );
    const modeBadge = renderer.root.findAllByType(Text).find(
      node => node.props.children === '공동 기록 모드',
    )?.parent;

    expect(groupName?.props.numberOfLines).toBe(2);
    expect(StyleSheet.flatten(groupName?.parent?.props.style)).toMatchObject({
      flex: 1,
      minWidth: 0,
    });
    expect(StyleSheet.flatten(modeBadge?.props.style)).toMatchObject({
      flexShrink: 0,
      marginLeft: 12,
    });
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
          strings={createStrings('ko')}
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

  it('hides technical details when invite sharing fails', async () => {
    const technicalMessage =
      '[share/unavailable] Native share sheet is unavailable.';
    const share = jest.spyOn(Share, 'share').mockRejectedValue(
      new Error(technicalMessage),
    );
    share.mockClear();
    const alert = jest.spyOn(Alert, 'alert').mockImplementation();
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
          strings={createStrings('ko')}
          theme={createTheme(false)}
        />,
      );
    });

    ReactTestRenderer.act(() => {
      renderer.root
        .findByProps({accessibilityLabel: '초대 코드 공유'})
        .props.onPress();
    });
    await ReactTestRenderer.act(async () => {
      await Promise.resolve();
    });

    expect(share).toHaveBeenCalledTimes(1);
    expect(alert).toHaveBeenCalledWith(
      '초대 코드를 공유하지 못했어요',
      '기기의 공유 기능을 열지 못했어요. 다시 시도해 주세요.',
    );
    expect(JSON.stringify(alert.mock.calls)).not.toContain(technicalMessage);
    expect(JSON.stringify(alert.mock.calls)).not.toContain('share/unavailable');
    alert.mockRestore();
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
          strings={createStrings('ko')}
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
          strings={createStrings('ko')}
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

  it('hides technical details when invite creation fails', async () => {
    const technicalMessage =
      '[functions/resource-exhausted] Invite rate limit exceeded.';
    const createInvite = jest.fn(async () => {
      throw new Error(technicalMessage);
    });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation();
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
          strings={createStrings('ko')}
          theme={createTheme(false)}
        />,
      );
    });

    ReactTestRenderer.act(() => {
      renderer.root
        .findByProps({accessibilityLabel: '초대 코드 만들기'})
        .props.onPress();
    });
    await ReactTestRenderer.act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(alert).toHaveBeenCalledWith(
      '초대 코드를 만들지 못했어요',
      '연결을 확인하고 잠시 후 다시 시도해 주세요.',
    );
    expect(JSON.stringify(alert.mock.calls)).not.toContain(technicalMessage);
    expect(JSON.stringify(alert.mock.calls)).not.toContain('functions');
    alert.mockRestore();
    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('opens the published privacy policy without exposing technical failures', async () => {
    const technicalMessage =
      '[linking/unavailable] No application can open this URL.';
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    const alert = jest.spyOn(Alert, 'alert').mockImplementation();
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
          strings={createStrings('ko')}
          theme={createTheme(false)}
        />,
      );
    });

    const privacyPolicy = renderer.root.findByProps({
      accessibilityLabel: '개인정보 처리방침',
    });
    expect(privacyPolicy.props.accessibilityRole).toBe('button');

    ReactTestRenderer.act(() => privacyPolicy.props.onPress());
    await ReactTestRenderer.act(async () => {
      await Promise.resolve();
    });
    expect(openURL).toHaveBeenCalledWith(
      'https://www.seorilabs.com/apps/babycare/privacy/',
    );

    openURL.mockRejectedValueOnce(new Error(technicalMessage));
    ReactTestRenderer.act(() => privacyPolicy.props.onPress());
    await ReactTestRenderer.act(async () => {
      await Promise.resolve();
    });
    expect(alert).toHaveBeenCalledWith(
      '개인정보 처리방침을 열지 못했어요',
      '인터넷 연결을 확인하고 다시 시도해 주세요.',
    );
    expect(JSON.stringify(alert.mock.calls)).not.toContain(technicalMessage);
    expect(JSON.stringify(alert.mock.calls)).not.toContain('linking');

    openURL.mockRestore();
    alert.mockRestore();
    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('opens the published ad privacy choices and explains unaffected regions', async () => {
    const openChoices = jest
      .fn<Promise<boolean>, []>()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
      .mockRejectedValueOnce(new Error('native consent failure'));
    const alert = jest.spyOn(Alert, 'alert').mockImplementation();
    let renderer!: ReactTestRenderer.ReactTestRenderer;

    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <MoreScreen
          onOpenAdPrivacyOptions={openChoices}
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
          strings={createStrings('ko')}
          theme={createTheme(false)}
        />,
      );
    });

    const choices = renderer.root.findByProps({
      accessibilityLabel: '광고 개인정보 선택',
    });
    ReactTestRenderer.act(() => choices.props.onPress());
    await ReactTestRenderer.act(async () => Promise.resolve());
    expect(alert).not.toHaveBeenCalled();

    ReactTestRenderer.act(() => choices.props.onPress());
    await ReactTestRenderer.act(async () => Promise.resolve());
    expect(alert).toHaveBeenCalledWith(
      '현재 지역에는 별도 선택이 필요하지 않아요',
      '적용되는 개인정보 선택 항목이 생기면 이 메뉴에서 변경할 수 있어요.',
    );

    ReactTestRenderer.act(() => choices.props.onPress());
    await ReactTestRenderer.act(async () => Promise.resolve());
    expect(alert).toHaveBeenCalledWith(
      '광고 개인정보 선택을 열지 못했어요',
      '인터넷 연결을 확인하고 다시 시도해 주세요.',
    );

    alert.mockRestore();
    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('labels membership refresh by its real behavior and surfaces failures', async () => {
    const technicalMessage =
      '[firestore/unavailable] The service is currently unavailable.';
    const refreshMembers = jest.fn(async () => {
      throw new Error(technicalMessage);
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
          strings={createStrings('ko')}
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
      '연결을 확인하고 다시 시도해 주세요.',
    );
    expect(JSON.stringify(alert.mock.calls)).not.toContain(technicalMessage);
    expect(JSON.stringify(alert.mock.calls)).not.toContain('firestore');
    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('warns an owner that account deletion removes the shared group and submits once', async () => {
    let finishDelete!: () => void;
    const deleteAccount = jest.fn(
      () =>
        new Promise<void>(resolve => {
          finishDelete = resolve;
        }),
    );
    const alert = jest.spyOn(Alert, 'alert').mockImplementation();
    let renderer!: ReactTestRenderer.ReactTestRenderer;

    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <MoreScreen
          onDeleteAccount={deleteAccount}
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
          strings={createStrings('ko')}
          theme={createTheme(false)}
        />,
      );
    });

    ReactTestRenderer.act(() => {
      renderer.root.findByProps({accessibilityLabel: '계정 삭제'}).props.onPress();
    });
    const confirmation = alert.mock.calls.find(
      ([title]) => title === '계정을 영구 삭제할까요?',
    );
    expect(confirmation?.[1]).toContain('모든 돌봄 기록');
    expect(confirmation?.[1]).toContain('다른 구성원');
    const destructive = confirmation?.[2]?.find(
      action => action.style === 'destructive',
    );

    ReactTestRenderer.act(() => {
      destructive?.onPress?.();
      destructive?.onPress?.();
    });
    expect(deleteAccount).toHaveBeenCalledTimes(1);
    expect(
      renderer.root.findByProps({accessibilityLabel: '계정 삭제 중…'}).props
        .accessibilityState,
    ).toEqual({disabled: true});

    await ReactTestRenderer.act(async () => {
      finishDelete();
      await Promise.resolve();
    });
    alert.mockRestore();
    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('does not expose technical details when account deletion fails', async () => {
    const technicalMessage = '[functions/internal] recursiveDelete failed';
    const deleteAccount = jest.fn(async () => {
      throw new Error(technicalMessage);
    });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation();
    let renderer!: ReactTestRenderer.ReactTestRenderer;

    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <MoreScreen
          onDeleteAccount={deleteAccount}
          onReset={async () => undefined}
          session={{
            groupId: 'group-1',
            babyId: 'baby-1',
            caregiverId: 'member-1',
            caregiverName: '할머니',
            babyName: '하루',
            birthDate: '2026-01-01',
            inviteCode: '',
            runtimeMode: 'firebase',
            membershipRole: 'member',
          }}
          strings={createStrings('ko')}
          theme={createTheme(false)}
        />,
      );
    });

    ReactTestRenderer.act(() => {
      renderer.root.findByProps({accessibilityLabel: '계정 삭제'}).props.onPress();
    });
    const confirmation = alert.mock.calls.find(
      ([title]) => title === '계정을 영구 삭제할까요?',
    );
    expect(confirmation?.[1]).toContain('내가 남긴 돌봄 기록');
    await ReactTestRenderer.act(async () => {
      confirmation?.[2]?.find(action => action.style === 'destructive')?.onPress?.();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(alert).toHaveBeenCalledWith(
      '계정을 삭제하지 못했어요',
      '연결을 확인하고 잠시 후 다시 시도해 주세요.',
    );
    expect(JSON.stringify(alert.mock.calls)).not.toContain(technicalMessage);
    alert.mockRestore();
    ReactTestRenderer.act(() => renderer.unmount());
  });
});
