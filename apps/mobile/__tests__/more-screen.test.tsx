import React from 'react';
import {Share, Text} from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

import {createTheme} from '../src/app/theme';
import {MoreScreen} from '../src/screens/MoreScreen';

describe('MoreScreen', () => {
  it('does not promise an unimplemented data export', () => {
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
    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('shares an invite with the confirmed product name', async () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue({
      action: 'sharedAction',
    });
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
});
