const mockStorageState = new Map<string, string>();

jest.mock('@apps-in-toss/framework', () => ({
  Storage: {
    getItem: jest.fn(async (key: string) => mockStorageState.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      mockStorageState.set(key, value);
    }),
  },
}));

import {createAitGateStore} from './platform-update-gate-store';

beforeEach(() => {
  mockStorageState.clear();
});

test('저장한 노출 이력을 그대로 복원한다', async () => {
  const gateStore = createAitGateStore();

  await gateStore.save({version: '1.2.0', promptedAt: 1000});

  await expect(gateStore.load()).resolves.toEqual({
    version: '1.2.0',
    promptedAt: 1000,
  });
});

test('저장된 값이 없으면 null이다', async () => {
  const gateStore = createAitGateStore();

  await expect(gateStore.load()).resolves.toBeNull();
});

test('저장된 값이 손상되면 null로 흡수한다', async () => {
  mockStorageState.set('babycare:update-gate', '{not json');
  const gateStore = createAitGateStore();

  await expect(gateStore.load()).resolves.toBeNull();
});

test('필드가 빠진 값은 null로 흡수한다', async () => {
  mockStorageState.set('babycare:update-gate', JSON.stringify({version: '1.0.0'}));
  const gateStore = createAitGateStore();

  await expect(gateStore.load()).resolves.toBeNull();
});
