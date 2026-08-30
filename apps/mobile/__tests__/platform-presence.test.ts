type MockOptions = {
  appId: string;
  baseUrl: string;
  ingestBaseUrl?: string;
  eventAllowlist?: readonly string[];
  eventContext?: () => Record<string, string>;
  presenceEnabled?: boolean;
  presenceContext?: () => Record<string, string>;
};

jest.mock('@seorilabs/platform-sdk', () => ({
  createPlatform: jest.fn(() => ({
    presence: {start: jest.fn(), stop: jest.fn(), resume: jest.fn()},
    signIn: jest.fn(async () => undefined),
  })),
}));
jest.mock('react-native-device-info', () => ({getVersion: () => '1.2.3'}));

import {createPlatform} from '@seorilabs/platform-sdk';
import {
  BABYCARE_PRESENCE_ENABLED,
  handleMobilePresenceAppState,
  prepareMobilePresenceSession,
} from '../src/app/platform-presence';

const mockCreatePlatform = createPlatform as unknown as jest.MockedFunction<
  (options: MockOptions) => {
    presence: {start: jest.Mock; stop: jest.Mock; resume: jest.Mock};
    signIn: jest.Mock;
  }
>;
const mockPlatform = mockCreatePlatform.mock.results[0]!.value;

it('keeps Babycare Presence disabled with stable release context', async () => {
  expect(BABYCARE_PRESENCE_ENABLED).toBe(false);
  const options = mockCreatePlatform.mock.calls[0]?.[0];
  expect(options).toMatchObject({
    appId: 'babycare',
    presenceEnabled: false,
    eventAllowlist: [],
  });
  expect(options?.presenceContext?.()).toMatchObject({appVersion: '1.2.3'});

  const token = jest.fn(async () => 'firebase-token');
  prepareMobilePresenceSession(token);
  await Promise.resolve();
  expect(token).not.toHaveBeenCalled();
  expect(mockPlatform.signIn).not.toHaveBeenCalled();
});

it('delegates background, foreground and resume lifecycle without blocking', () => {
  handleMobilePresenceAppState('background');
  handleMobilePresenceAppState('active');
  expect(mockPlatform.presence.stop).toHaveBeenCalledTimes(1);
  expect(mockPlatform.presence.start).toHaveBeenCalledTimes(1);
  expect(mockPlatform.presence.resume).toHaveBeenCalledTimes(1);
});
