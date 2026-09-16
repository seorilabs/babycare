import type {RewardedAdPort, RewardedAdResult} from '@babycare/product-core';
import {Platform} from 'react-native';
import type {RewardedAd} from 'react-native-google-mobile-ads';

export const MOBILE_REWARDED_AD_UNIT_IDS = {
  android: 'ca-app-pub-9932778305312246/1805215803',
  ios: 'ca-app-pub-9932778305312246/4239807450',
} as const;

const AD_NETWORK = 'admob';

export async function showMobileAdPrivacyOptions(): Promise<boolean> {
  const {
    AdsConsent,
    AdsConsentPrivacyOptionsRequirementStatus,
  } = await import('react-native-google-mobile-ads');
  const consent = await AdsConsent.getConsentInfo();
  if (
    consent.privacyOptionsRequirementStatus !==
    AdsConsentPrivacyOptionsRequirementStatus.REQUIRED
  ) {
    return false;
  }
  await AdsConsent.showPrivacyOptionsForm();
  return true;
}

export class MobileRewardedAd implements RewardedAdPort {
  #ad: RewardedAd | undefined;
  #loaded = false;
  #initializing: Promise<boolean> | undefined;

  async preload(): Promise<void> {
    if (!(await this.#initialize()) || this.#loaded) {
      return;
    }
    const {
      AdEventType,
      RewardedAd: RewardedAdClass,
      RewardedAdEventType,
      TestIds,
    } = await import('react-native-google-mobile-ads');
    const unitId = __DEV__
      ? TestIds.REWARDED
      : Platform.OS === 'ios'
        ? MOBILE_REWARDED_AD_UNIT_IDS.ios
        : MOBILE_REWARDED_AD_UNIT_IDS.android;
    if (!unitId) {
      return;
    }
    this.#ad?.removeAllListeners();
    const ad = RewardedAdClass.createForAdRequest(unitId, {
      requestNonPersonalizedAdsOnly: true,
    });
    this.#ad = ad;
    ad.addAdEventListener(RewardedAdEventType.LOADED, () => {
      if (this.#ad === ad) {
        this.#loaded = true;
      }
    });
    ad.addAdEventListener(AdEventType.ERROR, () => {
      if (this.#ad === ad) {
        this.#loaded = false;
      }
    });
    ad.load();
  }

  async show(): Promise<RewardedAdResult> {
    if (!this.#loaded || !this.#ad) {
      await this.preload();
    }
    const ad = this.#ad;
    if (!ad || !this.#loaded) {
      return {status: 'unavailable', reason: 'not_loaded'};
    }
    this.#loaded = false;
    const {AdEventType, RewardedAdEventType} = await import(
      'react-native-google-mobile-ads'
    );
    return new Promise(resolve => {
      let settled = false;
      let rewarded = false;
      const finish = (result: RewardedAdResult) => {
        if (settled) {
          return;
        }
        settled = true;
        ad.removeAllListeners();
        if (this.#ad === ad) {
          this.#ad = undefined;
        }
        this.preload().catch(() => undefined);
        resolve(result);
      };
      ad.addAdEventListener(RewardedAdEventType.EARNED_REWARD, () => {
        rewarded = true;
      });
      ad.addAdEventListener(AdEventType.CLOSED, () => {
        finish({
          status: rewarded ? 'rewarded' : 'dismissed',
          network: AD_NETWORK,
        });
      });
      ad.addAdEventListener(AdEventType.ERROR, () => {
        finish({status: 'unavailable', reason: 'show_failed'});
      });
      ad.show().catch(() =>
        finish({status: 'unavailable', reason: 'show_failed'}),
      );
    });
  }

  async #initialize(): Promise<boolean> {
    this.#initializing ??= (async () => {
      try {
        const {AdsConsent, default: mobileAds} = await import(
          'react-native-google-mobile-ads'
        );
        const consent = await AdsConsent.gatherConsent();
        if (!consent.canRequestAds) {
          return false;
        }
        await mobileAds().initialize();
        return true;
      } catch {
        return false;
      }
    })();
    return this.#initializing;
  }
}
