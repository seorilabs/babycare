const mockSessionStore = new Map<string, string>();

jest.mock('@apps-in-toss/framework', () => ({
  Storage: {
    getItem: jest.fn(async (key: string) => mockSessionStore.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      mockSessionStore.set(key, value);
    }),
    removeItem: jest.fn(async (key: string) => {
      mockSessionStore.delete(key);
    }),
  },
}));

import {
  createCareGroup,
  createInviteCode,
  deleteCareAccount,
  joinCareGroup,
  recordQuickCareEvent,
  reloadCareSession,
  type ReadyCareSession,
} from './babycare-backend';

const live = process.env.RUN_LIVE_AIT_E2E === '1' ? describe : describe.skip;

live('AppsInToss production backend E2E', () => {
  jest.setTimeout(60_000);

  it('creates, shares, records, refreshes and deletes two production accounts', async () => {
    const suffix = Date.now().toString(36).slice(-5);
    let owner: ReadyCareSession | undefined;
    let member: ReadyCareSession | undefined;
    let ownerStorage: [string, string][] = [];
    let memberStorage: [string, string][] = [];

    try {
      owner = await createCareGroup({
        caregiverName: `QA엄마${suffix}`,
        babyName: `QA아기${suffix}`,
        birthDate: '2026-08-01',
      });
      owner = await recordQuickCareEvent(owner, 'feeding');
      owner = await recordQuickCareEvent(owner, 'diaper');
      owner = await recordQuickCareEvent(owner, 'sleep');
      owner = await recordQuickCareEvent(owner, 'sleep');
      const invite = await createInviteCode(owner);
      expect(invite).toMatch(/^[A-Z2-9]{6}$/);
      ownerStorage = [...mockSessionStore.entries()];

      mockSessionStore.clear();
      member = await joinCareGroup({
        caregiverName: `QA아빠${suffix}`,
        code: invite,
      });
      member = await recordQuickCareEvent(member, 'diaper');
      member = await reloadCareSession(member);
      expect(member.events).toHaveLength(4);
      expect(member.events.some(event => event.caregiverId === member?.uid)).toBe(true);
      memberStorage = [...mockSessionStore.entries()];

      mockSessionStore.clear();
      for (const [key, value] of ownerStorage) {
        mockSessionStore.set(key, value);
      }
      owner = await reloadCareSession(owner);
      expect(owner.events).toHaveLength(4);
      expect(owner.events.some(event => event.caregiverId === member?.uid)).toBe(true);
    } finally {
      if (member) {
        mockSessionStore.clear();
        for (const [key, value] of memberStorage) {
          mockSessionStore.set(key, value);
        }
        await deleteCareAccount(member).catch(() => undefined);
      }
      if (owner) {
        mockSessionStore.clear();
        for (const [key, value] of ownerStorage) {
          mockSessionStore.set(key, value);
        }
        await deleteCareAccount(owner).catch(() => undefined);
      }
    }
  });
});
