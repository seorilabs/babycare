import type {ReactNativeFirebase} from '@react-native-firebase/app';
import type {
  AnalyticsPort,
  BabyCareAnalyticsEvent,
} from '@babycare/product-core';

export class FirebaseAnalyticsAdapter implements AnalyticsPort {
  readonly #app: ReactNativeFirebase.FirebaseApp;

  constructor(app: ReactNativeFirebase.FirebaseApp) {
    this.#app = app;
  }

  async track(event: BabyCareAnalyticsEvent): Promise<void> {
    // Lazy-load so Firebase emulator and Jest paths never initialize the native
    // Analytics module. Cloud runtime is the only composition that calls this.
    const {getAnalytics, logEvent} = await import(
      '@react-native-firebase/analytics'
    );
    await logEvent(getAnalytics(this.#app), event.name, event.params);
  }
}
