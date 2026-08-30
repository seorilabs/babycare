import React from 'react';
import {StyleSheet, View} from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

import {TabBar} from '../src/components/TabBar';
import {createTheme} from '@babycare/product-ui';
import { createStrings } from '@babycare/product-ui';

let mockBottomInset = 34;

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({
    bottom: mockBottomInset,
    left: 0,
    right: 0,
    top: 0,
  }),
}));

describe('TabBar', () => {
  afterEach(() => {
    mockBottomInset = 34;
  });

  it('keeps tabs above the device bottom safe area', () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <TabBar
          active="home"
          onChange={jest.fn()}
          strings={createStrings('ko')}
          theme={createTheme(false)}
        />,
      );
    });

    const tabList = renderer.root.findByProps({accessibilityRole: 'tablist'});
    expect(StyleSheet.flatten(tabList.props.style).paddingBottom).toBe(34);

    ReactTestRenderer.act(() => renderer.unmount());
  });

  it('keeps the compact baseline padding without a bottom inset', () => {
    mockBottomInset = 0;
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(
        <TabBar
          active="timeline"
          onChange={jest.fn()}
          strings={createStrings('ko')}
          theme={createTheme(true)}
        />,
      );
    });

    const tabList = renderer.root.findByType(View);
    expect(StyleSheet.flatten(tabList.props.style).paddingBottom).toBe(6);

    ReactTestRenderer.act(() => renderer.unmount());
  });
});
