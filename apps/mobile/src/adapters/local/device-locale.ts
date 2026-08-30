import {NativeModules, Platform} from 'react-native';
import {
  resolveAppLocale,
  resolveDeviceLanguageTags,
} from '@babycare/product-ui';

export function deviceLanguageTags(): readonly string[] {
  return resolveDeviceLanguageTags(Platform.OS, NativeModules);
}

export function deviceAppLocale() {
  return resolveAppLocale(deviceLanguageTags());
}
