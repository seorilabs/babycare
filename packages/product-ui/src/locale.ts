/** Languages the product ships translated copy for. */
export type AppLocale = 'ko' | 'en';

export const APP_LOCALES: readonly AppLocale[] = ['ko', 'en'];

/**
 * English is the fallback because the App Store and Play listings are published
 * in ko and en-US: a device in any non-Korean language must not land on Korean.
 */
export const DEFAULT_APP_LOCALE: AppLocale = 'en';

function primarySubtag(languageTag: string): string {
  return languageTag.trim().toLowerCase().split(/[-_]/)[0] ?? '';
}

/**
 * Picks the first device language the product actually translates. Region is
 * ignored on purpose: ko-KR and ko-KP both resolve to the same copy.
 */
export function resolveAppLocale(
  languageTags: readonly string[],
): AppLocale {
  for (const tag of languageTags) {
    const subtag = primarySubtag(tag);
    const match = APP_LOCALES.find(locale => locale === subtag);
    if (match) {
      return match;
    }
  }
  return DEFAULT_APP_LOCALE;
}

export interface NativeLocaleModules {
  readonly SettingsManager?: {
    readonly settings?: {
      readonly AppleLanguages?: unknown;
      readonly AppleLocale?: unknown;
    };
  };
  readonly I18nManager?: {readonly localeIdentifier?: unknown};
}

function iosLanguageTags(nativeModules: NativeLocaleModules): readonly string[] {
  const settings = nativeModules.SettingsManager?.settings;
  const languages = settings?.AppleLanguages;
  if (Array.isArray(languages)) {
    const tags = languages.filter(
      (value): value is string => typeof value === 'string',
    );
    if (tags.length > 0) {
      return tags;
    }
  }
  return typeof settings?.AppleLocale === 'string'
    ? [settings.AppleLocale]
    : [];
}

function androidLanguageTags(nativeModules: NativeLocaleModules): readonly string[] {
  const identifier = nativeModules.I18nManager?.localeIdentifier;
  return typeof identifier === 'string' && identifier.length > 0
    ? [identifier]
    : [];
}

/**
 * Device language preference, newest-first. Falls back to the Intl resolved
 * locale so Jest and any host without the native modules still report something
 * usable instead of throwing.
 */
export function resolveDeviceLanguageTags(
  platform: string,
  nativeModules: NativeLocaleModules,
): readonly string[] {
  const nativeTags =
    platform === 'ios'
      ? iosLanguageTags(nativeModules)
      : platform === 'android'
        ? androidLanguageTags(nativeModules)
        : [];
  if (nativeTags.length > 0) {
    return nativeTags;
  }
  try {
    return [new Intl.DateTimeFormat().resolvedOptions().locale];
  } catch {
    return [];
  }
}
