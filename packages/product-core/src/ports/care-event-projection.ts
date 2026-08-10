import type {
  CareEvent,
  CareEventKind,
  SleepEvent,
} from '../domain/care-event.ts';
import {CARE_EVENT_KINDS} from '../domain/care-event.ts';
import {
  babyId as parseBabyId,
  groupId as parseGroupId,
  type BabyId,
  type GroupId,
} from '../domain/ids.ts';
import type {CareEventRemoteError} from './care-event-remote-store.ts';

export interface CareEventProjectionScope {
  readonly groupId: GroupId;
  readonly babyId: BabyId;
}

export interface CareEventWindowRequest extends CareEventProjectionScope {
  readonly from: number;
  readonly to?: number;
  readonly kinds?: readonly CareEventKind[];
}

export interface LatestCareEventRequest extends CareEventProjectionScope {
  readonly kind: CareEventKind;
}

export type CareEventWindowObservation =
  | {readonly kind: 'server_value'; readonly events: readonly CareEvent[]}
  | {readonly kind: 'error'; readonly error: CareEventRemoteError};

export type LatestCareEventObservation =
  | {readonly kind: 'server_value'; readonly event?: CareEvent}
  | {readonly kind: 'error'; readonly error: CareEventRemoteError};

export type ActiveSleepObservation =
  | {readonly kind: 'server_value'; readonly event?: SleepEvent}
  | {readonly kind: 'error'; readonly error: CareEventRemoteError};

/**
 * Server-confirmed read projections used independently by overview surfaces.
 * Fetch methods reject transport errors; observe methods report them as values.
 */
export interface CareEventProjectionRemotePort {
  fetchWindow(request: CareEventWindowRequest): Promise<readonly CareEvent[]>;
  observeWindow(
    request: CareEventWindowRequest,
    listener: (observation: CareEventWindowObservation) => void,
  ): () => void;
  fetchLatest(request: LatestCareEventRequest): Promise<CareEvent | undefined>;
  observeLatest(
    request: LatestCareEventRequest,
    listener: (observation: LatestCareEventObservation) => void,
  ): () => void;
  fetchActiveSleep(
    scope: CareEventProjectionScope,
  ): Promise<SleepEvent | undefined>;
  observeActiveSleep(
    scope: CareEventProjectionScope,
    listener: (observation: ActiveSleepObservation) => void,
  ): () => void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function assertCanonicalId(
  value: unknown,
  parse: (candidate: string) => string,
  label: string,
): asserts value is string {
  if (typeof value !== 'string') {
    throw new Error(`${label} must be a canonical document identifier`);
  }
  try {
    if (parse(value) !== value) {
      throw new Error(`${label} is not canonical`);
    }
  } catch {
    throw new Error(`${label} must be a canonical document identifier`);
  }
}

function isValidTimestamp(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isCareEventKind(value: unknown): value is CareEventKind {
  return (
    typeof value === 'string' &&
    CARE_EVENT_KINDS.includes(value as CareEventKind)
  );
}

/** Validates an untrusted projection scope without normalizing it. */
export function validateCareEventProjectionScope(
  value: unknown,
): CareEventProjectionScope {
  if (!isRecord(value)) {
    throw new Error('Care event projection scope must be an object');
  }
  assertCanonicalId(value.groupId, parseGroupId, 'groupId');
  assertCanonicalId(value.babyId, parseBabyId, 'babyId');
  return value as unknown as CareEventProjectionScope;
}

/** Validates an untrusted half-open `[from, to)` window request. */
export function validateCareEventWindowRequest(
  value: unknown,
): CareEventWindowRequest {
  const scope = validateCareEventProjectionScope(value);
  const request = value as Record<string, unknown>;
  if (!isValidTimestamp(request.from)) {
    throw new Error('Care event window from must be a valid timestamp');
  }
  if (request.to !== undefined && !isValidTimestamp(request.to)) {
    throw new Error('Care event window to must be a valid timestamp');
  }
  if (request.to !== undefined && request.to <= request.from) {
    throw new Error('Care event window range must have a positive duration');
  }
  if (
    request.kinds !== undefined &&
    (!Array.isArray(request.kinds) ||
      request.kinds.some((kind) => !isCareEventKind(kind)))
  ) {
    throw new Error('Care event window kinds are invalid');
  }
  return scope as CareEventWindowRequest;
}

/** Validates an untrusted latest-kind request without normalizing it. */
export function validateLatestCareEventRequest(
  value: unknown,
): LatestCareEventRequest {
  const scope = validateCareEventProjectionScope(value);
  const request = value as Record<string, unknown>;
  if (!isCareEventKind(request.kind)) {
    throw new Error('Latest care event kind is invalid');
  }
  return scope as LatestCareEventRequest;
}
