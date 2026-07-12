import AsyncStorage from '@react-native-async-storage/async-storage';

import {LocalSessionRepository} from '../src/adapters/local/local-session-repository';
import type {LocalSession} from '../src/app/session';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

const getItem = AsyncStorage.getItem as jest.MockedFunction<typeof AsyncStorage.getItem>;

const validSession: LocalSession = {
  groupId: 'group-without-a-local-prefix',
  babyId: 'baby-1',
  caregiverId: 'caregiver-1',
  caregiverName: '보호자',
  babyName: '아기',
  birthDate: '2024-02-29',
  inviteCode: 'AB23CD',
};

async function load(value: unknown): Promise<LocalSession | undefined> {
  getItem.mockResolvedValueOnce(JSON.stringify(value));
  return new LocalSessionRepository().load();
}

describe('LocalSessionRepository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('hydrates a session that follows the onboarding and domain contracts', async () => {
    await expect(load(validSession)).resolves.toEqual(validSession);
  });

  it.each([
    ['leading whitespace', {...validSession, caregiverName: ' 보호자'}],
    ['trailing whitespace', {...validSession, babyName: '아기 '}],
    ['an empty name', {...validSession, caregiverName: '   '}],
    ['a name longer than 80 characters', {...validSession, babyName: '아'.repeat(81)}],
    ['a C0 control character', {...validSession, caregiverName: '보호\n자'}],
    ['a bidi control character', {...validSession, babyName: '아\u202E기'}],
  ])('ignores a session with %s', async (_label, value) => {
    await expect(load(value)).resolves.toBeUndefined();
  });

  it.each([
    ['a non-calendar birth date', '2024-02-30'],
    ['a non-ISO birth date', '2024-2-29'],
    ['a future birth date', '9999-12-31'],
  ])('ignores a session with %s', async (_label, birthDate) => {
    await expect(load({...validSession, birthDate})).resolves.toBeUndefined();
  });

  it.each([
    ['an empty group ID', {groupId: ''}],
    ['a non-canonical baby ID', {babyId: ' baby-1 '}],
    ['a non-string caregiver ID', {caregiverId: 1}],
    ['an ambiguous invite code', {inviteCode: 'AB10IO'}],
    ['a lowercase invite code', {inviteCode: 'ab23cd'}],
  ])('ignores a session with %s', async (_label, patch) => {
    await expect(load({...validSession, ...patch})).resolves.toBeUndefined();
  });

  it('ignores malformed JSON', async () => {
    getItem.mockResolvedValueOnce('{');

    await expect(new LocalSessionRepository().load()).resolves.toBeUndefined();
  });
});
