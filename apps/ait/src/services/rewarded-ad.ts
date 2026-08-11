import {
  loadFullScreenAd,
  showFullScreenAd,
} from '@apps-in-toss/framework';
import type {
  RewardedAdPort,
  RewardedAdResult,
} from '../../../../packages/product-core/src/index.ts';

const TEST_REWARDED_AD_GROUP_ID = 'ait-ad-test-rewarded-id';
export const AIT_REWARDED_AD_GROUP_ID =
  process.env.AIT_REWARDED_AD_GROUP_ID ?? '';

function adGroupId(): string {
  return __DEV__ ? TEST_REWARDED_AD_GROUP_ID : AIT_REWARDED_AD_GROUP_ID;
}

export class AppsInTossRewardedAd implements RewardedAdPort {
  #loaded = false;
  #loading: Promise<void> | undefined;

  async preload(): Promise<void> {
    if (this.#loaded || this.#loading) {
      return this.#loading;
    }
    const groupId = adGroupId();
    if (!groupId || !loadFullScreenAd.isSupported()) {
      return;
    }
    this.#loading = new Promise(resolve => {
      let settled = false;
      let unsubscribe: () => void = () => undefined;
      const finish = () => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        unsubscribe();
        this.#loading = undefined;
        resolve();
      };
      const timeout = setTimeout(finish, 15_000);
      const stop = loadFullScreenAd({
        options: {adGroupId: groupId},
        onEvent: event => {
          if (event.type === 'loaded') {
            this.#loaded = true;
            finish();
          }
        },
        onError: finish,
      });
      unsubscribe = stop;
      if (settled) {
        unsubscribe();
      }
    });
    return this.#loading;
  }

  async show(): Promise<RewardedAdResult> {
    await this.preload();
    const groupId = adGroupId();
    if (!groupId || !this.#loaded || !showFullScreenAd.isSupported()) {
      return {status: 'unavailable', reason: 'not_loaded'};
    }
    this.#loaded = false;
    return new Promise(resolve => {
      let settled = false;
      let rewarded = false;
      let unsubscribe: () => void = () => undefined;
      const finish = (result: RewardedAdResult) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timeout);
        unsubscribe();
        void this.preload();
        resolve(result);
      };
      const timeout = setTimeout(
        () => finish({status: 'unavailable', reason: 'timeout'}),
        60_000,
      );
      const stop = showFullScreenAd({
        options: {adGroupId: groupId},
        onEvent: event => {
          if (event.type === 'userEarnedReward') {
            rewarded = true;
          } else if (event.type === 'dismissed') {
            finish({
              status: rewarded ? 'rewarded' : 'dismissed',
              network: 'apps_in_toss',
            });
          } else if (event.type === 'failedToShow') {
            finish({status: 'unavailable', reason: 'show_failed'});
          }
        },
        onError: () =>
          finish({status: 'unavailable', reason: 'show_failed'}),
      });
      unsubscribe = stop;
      if (settled) {
        unsubscribe();
      }
    });
  }
}

export const appsInTossRewardedAd = new AppsInTossRewardedAd();
