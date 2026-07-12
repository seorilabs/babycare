export type BabyCareAnalyticsEvent =
  | { readonly name: 'bc_first_log'; readonly params: { readonly type: string } }
  | { readonly name: 'bc_log_create'; readonly params: { readonly type: string } }
  | { readonly name: 'bc_log_update'; readonly params: { readonly type: string } }
  | { readonly name: 'bc_log_delete'; readonly params: { readonly type: string } };

export interface AnalyticsPort {
  track(event: BabyCareAnalyticsEvent): Promise<void>;
}
