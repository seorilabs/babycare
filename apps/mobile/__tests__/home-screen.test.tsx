import React from 'react';
import {Text} from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

import type {LocalSession} from '../src/app/session';
import {createTheme} from '../src/app/theme';
import {HomeScreen} from '../src/screens/HomeScreen';

const session: LocalSession = {
  groupId: 'group-1',
  babyId: 'baby-1',
  caregiverId: 'owner-1',
  caregiverName: '엄마',
  babyName: '하루',
  birthDate: '2026-01-01',
  inviteCode: 'ABC234',
  runtimeMode: 'firebase',
  membershipRole: 'owner',
};

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
    .join(' ');
}

describe('HomeScreen', () => {
  it('does not present the single-baby MVP name as an unavailable selector', () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;

    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <HomeScreen
          activeSleep={undefined}
          caregiverNames={new Map()}
          events={[]}
          now={new Date('2026-07-31T09:00:00+09:00').getTime()}
          onMore={jest.fn()}
          onRecord={jest.fn()}
          onStopSleep={jest.fn()}
          session={session}
          theme={createTheme(false)}
        />,
      );
    });

    const visibleText = renderedText(renderer);
    expect(visibleText).toContain('하루');
    expect(visibleText).not.toContain('하루 ▾');
    ReactTestRenderer.act(() => renderer.unmount());
  });
});
