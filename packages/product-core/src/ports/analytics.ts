export type EmptyAnalyticsParams = Readonly<Record<string, never>>;

export type BabyCareAnalyticsEvent =
  | {
      readonly name: 'core_screen_view';
      readonly params: {
        readonly screen_name: string;
        readonly screen_class?: string;
      };
    }
  | {
      readonly name: 'core_ad_request';
      readonly params: {
        readonly placement: string;
        readonly ad_format: 'rewarded';
      };
    }
  | {
      readonly name: 'core_ad_impression';
      readonly params: {
        readonly placement: string;
        readonly ad_format: 'rewarded';
        readonly network: string;
      };
    }
  | {
      readonly name: 'core_ad_reward';
      readonly params: {
        readonly placement: string;
        readonly ad_format: 'rewarded';
        readonly reward_code: 'stats_detail_24h';
        readonly reward_amount: 1;
      };
    }
  | {
      readonly name: 'bc_onboarding_complete';
      readonly params: {readonly mode: 'create' | 'join'};
    }
  | {readonly name: 'bc_group_created'; readonly params: EmptyAnalyticsParams}
  | {readonly name: 'bc_invite_created'; readonly params: EmptyAnalyticsParams}
  | {readonly name: 'bc_invite_shared'; readonly params: EmptyAnalyticsParams}
  | {readonly name: 'bc_invite_joined'; readonly params: EmptyAnalyticsParams}
  | { readonly name: 'bc_first_log'; readonly params: { readonly type: string } }
  | { readonly name: 'bc_log_create'; readonly params: { readonly type: string } }
  | { readonly name: 'bc_log_update'; readonly params: { readonly type: string } }
  | { readonly name: 'bc_log_delete'; readonly params: { readonly type: string } };

export interface AnalyticsPort {
  track(event: BabyCareAnalyticsEvent): Promise<void>;
}
