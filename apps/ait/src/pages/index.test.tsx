import React from 'react';
import {Text} from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

import {BabyNestHome} from './index';

jest.mock('../services/babycare-backend', () => ({
  bootstrapCareSession: jest.fn(async () => undefined),
  createCareGroup: jest.fn(),
  createInviteCode: jest.fn(),
  deleteCareAccount: jest.fn(),
  joinCareGroup: jest.fn(),
  recordQuickCareEvent: jest.fn(),
  reloadCareSession: jest.fn(),
  todaySummary: jest.fn(() => ({
    feedingCount: 0,
    feedingVolumeMl: 0,
    diaperCount: 0,
    sleepCount: 0,
    sleepDurationSeconds: 0,
    latest: {},
  })),
}));

jest.mock('../services/analytics', () => ({
  babycareAnalytics: {track: jest.fn(async () => undefined)},
}));

jest.mock('../services/rewarded-ad', () => ({
  appsInTossRewardedAd: {
    preload: jest.fn(async () => undefined),
    show: jest.fn(async () => ({status: 'unavailable'})),
  },
  statsDetailUnlockedUntilOnAit: jest.fn(async () => undefined),
  unlockStatsDetailOnAit: jest.fn(async () => Date.now() + 86_400_000),
}));

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
  it('shows the functional create and invite onboarding paths', async () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(<BabyNestHome />);
      await Promise.resolve();
    });

    const visibleText = renderedText(renderer);
    expect(visibleText).toContain('함께 남기는 아기 돌봄 기록');
    expect(visibleText).toContain('새 돌봄 시작');
    expect(visibleText).toContain('초대 코드 참여');
    expect(visibleText).toContain('수유, 기저귀, 수면');
    expect(visibleText).toContain('의료 판단이나 진단을 제공하지 않습니다.');
    expect(visibleText).not.toContain('build-only');
    expect(visibleText).not.toContain('sandbox');

    ReactTestRenderer.act(() => renderer.unmount());
  });
});
