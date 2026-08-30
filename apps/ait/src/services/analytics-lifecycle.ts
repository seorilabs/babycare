import type {AppStateStatus} from 'react-native';
import type {AnalyticsPort} from '../../../../packages/product-core/src/index.ts';

export function flushAitAnalyticsOnAppState(
  analytics: AnalyticsPort,
  state: AppStateStatus,
): void {
  if (state !== 'active') {
    analytics.flush?.().catch(() => undefined);
  }
}
