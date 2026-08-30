import {NativeModules, Platform} from 'react-native';

import {
  APP_LOCALES,
  DEFAULT_APP_LOCALE,
  createStrings,
  resolveAppLocale,
} from '@babycare/product-ui';
import {
  deviceAppLocale,
  deviceLanguageTags,
} from '../src/adapters/local/device-locale';
import {eventTitle, formatDuration, formatTimeAgo} from '../src/app/format';
import {
  babyId,
  createCareEvent,
  eventId,
  groupId,
  userId,
} from '@babycare/product-core';

const HANGUL = /[가-힣ㄱ-ㅎㅏ-ㅣ]/;

function leaves(
  value: unknown,
  path: string,
): ReadonlyArray<readonly [string, string]> {
  if (typeof value === 'string') {
    return [[path, value]];
  }
  if (typeof value === 'function') {
    // Exercise the interpolation with placeholder arguments so the template's
    // literal text is checked too, not just the keys around it.
    const args = Array.from({length: value.length}, (_, index) =>
      index === 0 && value.length === 2 ? 1 : 'X',
    );
    try {
      const rendered = (value as (...input: unknown[]) => unknown)(...args);
      return typeof rendered === 'string' ? [[path, rendered]] : [];
    } catch {
      return [];
    }
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, child]) =>
      leaves(child, `${path}.${key}`),
    );
  }
  return [];
}

describe('resolveAppLocale', () => {
  it('uses Korean copy for any Korean device language regardless of region', () => {
    expect(resolveAppLocale(['ko-KR'])).toBe('ko');
    expect(resolveAppLocale(['ko'])).toBe('ko');
    expect(resolveAppLocale(['ko_KR'])).toBe('ko');
    expect(resolveAppLocale(['KO-kr'])).toBe('ko');
  });

  it('falls back to English for languages the product does not translate', () => {
    expect(resolveAppLocale(['ja-JP'])).toBe('en');
    expect(resolveAppLocale(['fr-FR', 'de-DE'])).toBe('en');
    expect(resolveAppLocale([])).toBe(DEFAULT_APP_LOCALE);
    expect(DEFAULT_APP_LOCALE).toBe('en');
  });

  it('honours the device preference order rather than the first supported tag', () => {
    expect(resolveAppLocale(['ja-JP', 'ko-KR', 'en-US'])).toBe('ko');
    expect(resolveAppLocale(['en-GB', 'ko-KR'])).toBe('en');
  });
});

describe('device locale detection', () => {
  const originalOS = Platform.OS;
  const originalSettings = NativeModules.SettingsManager;
  const originalI18n = NativeModules.I18nManager;

  afterEach(() => {
    Object.defineProperty(Platform, 'OS', {value: originalOS, configurable: true});
    NativeModules.SettingsManager = originalSettings;
    NativeModules.I18nManager = originalI18n;
  });

  function setPlatform(os: typeof Platform.OS) {
    Object.defineProperty(Platform, 'OS', {value: os, configurable: true});
  }

  it('reads the iOS preferred language list in order', () => {
    setPlatform('ios');
    NativeModules.SettingsManager = {
      settings: {AppleLanguages: ['ko-KR', 'en-US']},
    };

    expect(deviceLanguageTags()).toEqual(['ko-KR', 'en-US']);
    expect(deviceAppLocale()).toBe('ko');
  });

  it('falls back to the iOS single-locale setting when no language list exists', () => {
    setPlatform('ios');
    NativeModules.SettingsManager = {settings: {AppleLocale: 'ko_KR'}};

    expect(deviceAppLocale()).toBe('ko');
  });

  it('reads the Android locale identifier', () => {
    setPlatform('android');
    NativeModules.I18nManager = {localeIdentifier: 'ko_KR'};

    expect(deviceAppLocale()).toBe('ko');
  });

  it('still resolves a usable locale when the native modules are missing', () => {
    setPlatform('ios');
    NativeModules.SettingsManager = undefined;
    NativeModules.I18nManager = undefined;

    // No native locale source: the app must keep starting on the default copy
    // instead of throwing during the very first render.
    expect(() => deviceAppLocale()).not.toThrow();
    expect(APP_LOCALES).toContain(deviceAppLocale());
  });

  it('ignores malformed native locale values', () => {
    setPlatform('ios');
    NativeModules.SettingsManager = {settings: {AppleLanguages: [42, null]}};

    expect(() => deviceAppLocale()).not.toThrow();
    expect(APP_LOCALES).toContain(deviceAppLocale());
  });
});

describe('translation coverage', () => {
  it('translates every English leaf away from Korean', () => {
    const untranslated = leaves(createStrings('en'), 'en')
      .filter(([, text]) => HANGUL.test(text))
      .map(([path, text]) => `${path}: ${text}`);

    expect(untranslated).toEqual([]);
  });

  it('keeps Korean copy for the Korean locale', () => {
    const korean = leaves(createStrings('ko'), 'ko').filter(([, text]) =>
      HANGUL.test(text),
    );

    expect(korean.length).toBeGreaterThan(100);
  });

  it('gives each locale its own Intl tag and endonym', () => {
    expect(createStrings('ko').intlLocale).toBe('ko-KR');
    expect(createStrings('en').intlLocale).toBe('en-US');
    expect(createStrings('ko').languageName).toBe('한국어');
    expect(createStrings('en').languageName).toBe('English');
    expect(APP_LOCALES).toEqual(['ko', 'en']);
  });
});

describe('locale-aware formatting', () => {
  const en = createStrings('en');
  const ko = createStrings('ko');

  it('formats durations per locale', () => {
    expect(formatDuration(3_930, ko)).toBe('1시간 5분');
    expect(formatDuration(3_930, en)).toBe('1h 5m');
    expect(formatDuration(90, ko)).toBe('1분');
    expect(formatDuration(90, en)).toBe('1m');
    expect(formatDuration(5, en)).toBe('5s');
  });

  it('pluralizes English relative time but not Korean', () => {
    const now = Date.now();
    expect(formatTimeAgo(now - 60_000, now, en)).toBe('1 minute ago');
    expect(formatTimeAgo(now - 180_000, now, en)).toBe('3 minutes ago');
    expect(formatTimeAgo(now - 180_000, now, ko)).toBe('3분 전');
  });

  it('translates event titles', () => {
    const occurredAt = new Date(2026, 6, 13, 12).getTime();
    const diaper = createCareEvent(
      {
        groupId: groupId('group-1'),
        babyId: babyId('baby-1'),
        caregiverId: userId('owner-1'),
        kind: 'diaper',
        diaperType: 'mixed',
        occurredAt,
      },
      {id: eventId('event-1'), now: occurredAt},
    );

    expect(eventTitle(diaper, ko)).toBe('기저귀 · 소변 + 대변');
    expect(eventTitle(diaper, en)).toBe('Diaper · Pee + poop');
  });
});
