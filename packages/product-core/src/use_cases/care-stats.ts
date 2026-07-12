import type {CareEvent} from '../domain/care-event.ts';
import {
  buildDashboardSummary,
  type DashboardSummary,
} from './dashboard.ts';

export interface CareStatsRange {
  readonly from: number;
  readonly to: number;
}

export interface CareStatsBucket extends CareStatsRange {
  readonly summary: DashboardSummary;
}

/**
 * Builds summaries for caller-defined time ranges.
 *
 * Calendar boundaries and display labels stay in the delivery layer; core only
 * consumes explicit timestamps and returns values in the same order.
 */
export function buildCareStatsBuckets(
  events: readonly CareEvent[],
  ranges: readonly CareStatsRange[],
  now: number,
): readonly CareStatsBucket[] {
  return ranges.map((range) => ({
    ...range,
    summary: buildDashboardSummary(events, range, now),
  }));
}
