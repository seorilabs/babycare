import type {RewardedAdPort, RewardedAdResult} from '@babycare/product-core';
import type {RewardedAd} from 'react-native-google-mobile-ads';

/**
 * 운영 광고 단위는 AdMob 생성 후 확정해야 한다. 빈 값이면 release에서
 * 광고를 요청하지 않는다. Debug는 Google 공식 test unit만 사용한다.
 */
export const MOBILE_REWARDED_AD_UNIT_ID = '';

const AD_NETWORK = 'admob';

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
    const unitId = __DEV__ ? TestIds.REWARDED : MOBILE_REWARDED_AD_UNIT_ID;
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
