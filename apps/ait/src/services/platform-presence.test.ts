type MockOptions = {
  appId: string;
  eventAllowlist?: readonly string[];
  presenceEnabled?: boolean;
  presenceContext?: Record<string, string>;
};

jest.mock('@seorilabs/platform-sdk', () => ({
  createPlatform: jest.fn(() => ({
    presence: {start: jest.fn(), stop: jest.fn(), resume: jest.fn()},
    signIn: jest.fn(async () => undefined),
  })),
}));
jest.mock('./babycare-backend', () => ({
  currentFirebaseIdToken: jest.fn(async () => 'firebase-token'),
}));

import {createPlatform} from '@seorilabs/platform-sdk';
import {currentFirebaseIdToken} from './babycare-backend';
import {
  BABYCARE_AIT_PRESENCE_ENABLED,
  handleAitPresenceAppState,
  prepareAitPresenceSession,
} from './platform-presence';

const mockCreatePlatform = createPlatform as unknown as jest.MockedFunction<
  (options: MockOptions) => {
    presence: {start: jest.Mock; stop: jest.Mock; resume: jest.Mock};
    signIn: jest.Mock;
  }
>;
const mockPlatform = mockCreatePlatform.mock.results[0]!.value;

it('keeps AppsInToss Presence disabled and performs no authentication request', async () => {
  expect(BABYCARE_AIT_PRESENCE_ENABLED).toBe(false);
  expect(mockCreatePlatform.mock.calls[0]?.[0]).toMatchObject({
    appId: 'babycare',
    presenceEnabled: false,
    eventAllowlist: [],
    presenceContext: {platform: 'ait', appVersion: expect.any(String)},
  });
  prepareAitPresenceSession();
  await Promise.resolve();
  expect(currentFirebaseIdToken).not.toHaveBeenCalled();
  expect(mockPlatform.signIn).not.toHaveBeenCalled();
});

it('delegates AppsInToss lifecycle to the SDK', () => {
  handleAitPresenceAppState('background');
  handleAitPresenceAppState('active');
  expect(mockPlatform.presence.stop).toHaveBeenCalledTimes(1);
  expect(mockPlatform.presence.start).toHaveBeenCalledTimes(1);
  expect(mockPlatform.presence.resume).toHaveBeenCalledTimes(1);
});
