import {createLocalSession, isValidBirthDate} from '../src/app/session';

const NOW = new Date(2026, 6, 12, 12).getTime();

describe('local onboarding session', () => {
  it('accepts real leap dates and rejects normalized or future dates', () => {
    expect(isValidBirthDate('2024-02-29', NOW)).toBe(true);
    expect(isValidBirthDate('2026-02-29', NOW)).toBe(false);
    expect(isValidBirthDate('2026-02-31', NOW)).toBe(false);
    expect(isValidBirthDate('2027-01-01', NOW)).toBe(false);
  });

  it('normalizes visible names and creates canonical local identifiers', () => {
    const session = createLocalSession(
      {caregiverName: ' 보호자 ', babyName: ' 아기 ', birthDate: '2024-02-29'},
      NOW,
    );

    expect(session.caregiverName).toBe('보호자');
    expect(session.babyName).toBe('아기');
    expect(session.groupId).toMatch(/^local-group-/);
    expect(session.inviteCode).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
  });

  it('rejects overlong and control-injected names before persistence', () => {
    expect(() =>
      createLocalSession(
        {caregiverName: '가'.repeat(81), babyName: '아기', birthDate: '2024-01-01'},
        NOW,
      ),
    ).toThrow(/1 to 80/);
    expect(() =>
      createLocalSession(
        {caregiverName: '보호자', babyName: '아기\u202E', birthDate: '2024-01-01'},
        NOW,
      ),
    ).toThrow(/control/);
  });
});
