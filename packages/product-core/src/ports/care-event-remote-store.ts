import type {CareEvent, SleepEvent} from '../domain/care-event.ts';
import type {EventId, GroupId} from '../domain/ids.ts';
import type {CareEventQuery} from './care-event-repository.ts';
import type {
  CareEventCursor,
  CareEventPageRequest,
} from './care-event-timeline.ts';

export type CareEventMutationKind =
  | 'create'
  | 'update'
  | 'end_sleep'
  | 'soft_delete';

export interface CareEventMutation {
  readonly id: string;
  readonly kind: CareEventMutationKind;
  readonly event: CareEvent;
  readonly baseRevision: number;
  /** SHA-256 of the canonical domain event payload. */
  readonly payloadHash: string;
}

export type CareEventPushResult =
  | {readonly kind: 'applied'; readonly remote: CareEvent}
  | {readonly kind: 'already_applied'; readonly remote: CareEvent}
  | {readonly kind: 'revision_conflict'; readonly remote: CareEvent}
  | {
      readonly kind: 'active_sleep_conflict';
      readonly remoteActiveSleep: SleepEvent;
    };

export type CareEventRemoteErrorCode =
  | 'retryable'
  | 'unauthenticated'
  | 'permission_denied'
  | 'invalid';

export interface CareEventRemoteError {
  readonly code: CareEventRemoteErrorCode;
  readonly cause?: unknown;
}

export type CareEventRemoteObservation =
  | {
      readonly kind: 'server_snapshot';
      readonly events: readonly CareEvent[];
    }
  | {readonly kind: 'error'; readonly error: CareEventRemoteError};

/**
 * Raw server page. Soft-deleted rows stay in the page so cursors and covered
 * windows remain authoritative even when the UI hides those rows.
 */
export interface CareEventRemotePage {
  readonly events: readonly CareEvent[];
  readonly endCursor?: CareEventCursor;
  readonly hasMore: boolean;
}

export type CareEventRemotePageObservation =
  | {readonly kind: 'server_page'; readonly page: CareEventRemotePage}
  | {readonly kind: 'error'; readonly error: CareEventRemoteError};

/**
 * Server-backed transport. `push` resolves only after the remote service
 * acknowledges or classifies a revision. UI use cases must not use this as
 * their local durable repository because offline transactions fail.
 */
export interface CareEventRemoteStorePort {
  push(mutation: CareEventMutation): Promise<CareEventPushResult>;
  findById(groupId: GroupId, eventId: EventId): Promise<CareEvent | undefined>;
  fetchPage(request: CareEventPageRequest): Promise<CareEventRemotePage>;
  observePage(
    request: CareEventPageRequest,
    listener: (observation: CareEventRemotePageObservation) => void,
  ): () => void;
  list(query: CareEventQuery): Promise<readonly CareEvent[]>;
  observe(
    query: CareEventQuery,
    listener: (observation: CareEventRemoteObservation) => void,
  ): () => void;
}
