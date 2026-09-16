import type {AppStateStatus} from 'react-native';
import type {AnalyticsPort} from '@babycare/product-core';

export function flushMobileAnalyticsOnAppState(
  analytics: AnalyticsPort | undefined,
  state: AppStateStatus,
): void {
  analytics?.setForeground?.(state === 'active');
  if (state !== 'active') {
    analytics?.flush?.().catch(() => undefined);
  }
}
