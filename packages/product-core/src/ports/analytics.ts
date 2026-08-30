import type {CareEventKind} from '../domain/care-event.ts';
import type {MembershipRole} from '../domain/care-group.ts';

export type EmptyAnalyticsParams = Readonly<Record<string, never>>;

export type OnboardingStep =
  | 'choose'
  | 'caregiver'
  | 'babyName'
  | 'birthDate'
  | 'inviteCode';
export type OnboardingMode = 'create' | 'join' | 'none';
export type InviteJoinFailureReason =
  | 'invalid_code'
  | 'expired'
  | 'already_member'
  | 'network'
  | 'permission'
  | 'unknown';
export type BootStage = 'runtime' | 'app_check' | 'auth' | 'session_restore';
export type BootErrorCode =
  | 'configuration'
  | 'network'
  | 'permission'
  | 'unauthenticated'
  | 'storage'
  | 'unknown';

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
  | {
      readonly name: 'bc_onboarding_step_view';
      readonly params: {
        readonly step: OnboardingStep;
        readonly mode: OnboardingMode;
      };
    }
  | {
      readonly name: 'bc_onboarding_step_back';
      readonly params: {
        readonly step: OnboardingStep;
        readonly mode: OnboardingMode;
      };
    }
  | {
      readonly name: 'bc_onboarding_step_blocked';
      readonly params: {
        readonly step: OnboardingStep;
        readonly mode: OnboardingMode;
        readonly reason: 'invalid_input' | 'save_failed';
      };
    }
  | {readonly name: 'bc_group_created'; readonly params: EmptyAnalyticsParams}
  | {readonly name: 'bc_invite_created'; readonly params: EmptyAnalyticsParams}
  | {readonly name: 'bc_invite_shared'; readonly params: EmptyAnalyticsParams}
  | {readonly name: 'bc_invite_join_attempt'; readonly params: EmptyAnalyticsParams}
  | {
      readonly name: 'bc_invite_join_failed';
      readonly params: {readonly reason_code: InviteJoinFailureReason};
    }
  | {readonly name: 'bc_invite_joined'; readonly params: EmptyAnalyticsParams}
  | {
      readonly name: 'bc_boot_failed';
      readonly params: {
        readonly stage: BootStage;
        readonly error_code: BootErrorCode;
      };
    }
  | {
      readonly name: 'bc_boot_ready';
      readonly params: {readonly stage_ms: number};
    }
  | {
      readonly name: 'bc_medication_history_unconfirmed';
      readonly params: EmptyAnalyticsParams;
    }
  | {
      readonly name: 'bc_log_create';
      readonly params: {
        readonly type: CareEventKind;
        readonly is_first: boolean;
        readonly group_role: MembershipRole;
      };
    }
  | {readonly name: 'bc_log_update'; readonly params: {readonly type: CareEventKind}}
  | {readonly name: 'bc_log_delete'; readonly params: {readonly type: CareEventKind}}
  | {
      readonly name: 'seori_analytics_dropped';
      readonly params: {readonly count: number};
    };

export interface AnalyticsPort {
  track(event: BabyCareAnalyticsEvent): Promise<void>;
  flush?(): Promise<void>;
  stop?(): void | Promise<void>;
}
