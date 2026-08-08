export type RewardedAdResult =
  | {readonly status: 'rewarded'; readonly network: string}
  | {readonly status: 'dismissed'; readonly network: string}
  | {readonly status: 'unavailable'; readonly reason?: string};

export interface RewardedAdPort {
  preload(): Promise<void>;
  show(): Promise<RewardedAdResult>;
}
