const mockFetch = jest.fn(async (target: unknown) => {
  void target;
  return undefined;
});
const mockGate = jest.fn();
const mockShouldPrompt = jest.fn();
const mockMarkPrompted = jest.fn();

jest.mock('./platform-presence', () => ({
  AIT_APP_VERSION: '1.2.3',
  aitPresencePlatform: {
    config: {
      fetch: (target: unknown) => mockFetch(target),
      gate: () => mockGate(),
      shouldPrompt: (state: unknown) => mockShouldPrompt(state),
      markPrompted: (state: unknown) => mockMarkPrompted(state),
    },
  },
}));

import {checkAitUpdateGate} from './platform-update-gate';

beforeEach(() => {
  jest.clearAllMocks();
  mockGate.mockReturnValue({kind: 'ok'});
  mockShouldPrompt.mockResolvedValue(true);
  mockMarkPrompted.mockResolvedValue(undefined);
});

test('ok면 null을 돌려주고 노출 이력을 남기지 않는다', async () => {
  await expect(checkAitUpdateGate()).resolves.toBeNull();
  expect(mockMarkPrompted).not.toHaveBeenCalled();
});

test('설정을 fetch한 뒤 gate() 판정을 읽는다', async () => {
  await checkAitUpdateGate();

  expect(mockFetch).toHaveBeenCalledWith({
    appVersion: '1.2.3',
    platform: 'ait',
  });
  expect(mockGate).toHaveBeenCalled();
});

test('recommended면 상태를 돌려주고 노출 이력을 남긴다', async () => {
  const state = {kind: 'recommended', message: '새 버전이 나왔어요'};
  mockGate.mockReturnValue(state);

  await expect(checkAitUpdateGate()).resolves.toEqual(state);
  expect(mockMarkPrompted).toHaveBeenCalledWith(state);
});

test('shouldPrompt가 false면 null을 돌려준다', async () => {
  mockGate.mockReturnValue({kind: 'recommended', message: 'm'});
  mockShouldPrompt.mockResolvedValue(false);

  await expect(checkAitUpdateGate()).resolves.toBeNull();
  expect(mockMarkPrompted).not.toHaveBeenCalled();
});

test('fetch가 던져도 null로 흡수한다', async () => {
  mockFetch.mockRejectedValueOnce(new Error('network'));

  await expect(checkAitUpdateGate()).resolves.toBeNull();
});

test('gate()가 던져도 null로 흡수한다', async () => {
  mockGate.mockImplementation(() => {
    throw new Error('boom');
  });

  await expect(checkAitUpdateGate()).resolves.toBeNull();
});
