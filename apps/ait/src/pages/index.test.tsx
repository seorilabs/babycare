import React from 'react';
import { Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

import { BabyNestHome } from './index';

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
    .join(' ')
    .replace(/\s+/g, ' ');
}

describe('BabyNestHome', () => {
  it('does not expose non-working care features or internal candidate status', () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;

    ReactTestRenderer.act(() => {
      renderer = ReactTestRenderer.create(<BabyNestHome />);
    });

    const visibleText = renderedText(renderer);
    expect(visibleText).toContain('함께봄');
    expect(visibleText).toContain('성인 양육자를 위한 함께봄');
    expect(visibleText).toContain('의료 판단이나 진단을 제공하지 않습니다.');
    for (const hiddenText of [
      '수유',
      '기저귀',
      '수면',
      'AppsInToss',
      'build-only',
      '후보',
      'sandbox',
      '로그인과 공동 기록 연결',
    ]) {
      expect(visibleText).not.toContain(hiddenText);
    }

    ReactTestRenderer.act(() => renderer.unmount());
  });
});
