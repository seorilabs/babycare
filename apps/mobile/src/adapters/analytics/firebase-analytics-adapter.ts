import type {ReactNativeFirebase} from '@react-native-firebase/app';
import type {
  AnalyticsPort,
  BabyCareAnalyticsEvent,
} from '@babycare/product-core';
import {
  canonicalAnalyticsDimensions,
  type PlatformAnalyticsContext,
} from '@babycare/product-data';

export function firebaseAnalyticsParams(
  event: BabyCareAnalyticsEvent,
  context: PlatformAnalyticsContext,
): Readonly<Record<string, string | number | boolean>> {
  return {
    ...event.params,
    ...canonicalAnalyticsDimensions(context),
  };
}

export class FirebaseAnalyticsAdapter implements AnalyticsPort {
  readonly #app: ReactNativeFirebase.FirebaseApp;
  readonly #context: PlatformAnalyticsContext;

  constructor(
    app: ReactNativeFirebase.FirebaseApp,
    context: PlatformAnalyticsContext,
  ) {
    this.#app = app;
    this.#context = context;
  }

  async track(event: BabyCareAnalyticsEvent): Promise<void> {
    // Lazy-load so Firebase emulator and Jest paths never initialize the native
    // Analytics module. Cloud runtime is the only composition that calls this.
    const {getAnalytics, logEvent} = await import(
      '@react-native-firebase/analytics'
    );
    await logEvent(
      getAnalytics(this.#app),
      event.name,
      firebaseAnalyticsParams(event, this.#context),
    );
  }
}
