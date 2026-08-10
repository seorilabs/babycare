import {
  CARE_EVENT_KINDS,
  type CareEvent,
  type CareEventKind,
} from '../domain/care-event.ts';
import {
  babyId as parseBabyId,
  eventId as parseEventId,
  groupId as parseGroupId,
  type BabyId,
  type EventId,
  type GroupId,
} from '../domain/ids.ts';

export const MIN_CARE_EVENT_PAGE_SIZE = 1;
export const MAX_CARE_EVENT_PAGE_SIZE = 100;

/**
 * Scalar Firestore cursor for `(occurredAt DESC, documentId DESC)`.
 *
 * It deliberately contains no local visibility or sync-state information.
 * Soft-deleted server rows therefore remain valid cursor boundaries.
 */
export interface CareEventCursor {
  readonly occurredAt: number;
  readonly eventId: EventId;
}

export interface CareEventPageRequest {
  readonly groupId: GroupId;
  readonly babyId: BabyId;
  readonly from?: number;
  readonly to?: number;
  readonly kinds?: readonly CareEventKind[];
  readonly pageSize: number;
  readonly after?: CareEventCursor;
}

export interface CareEventPage {
  /** Raw canonical rows. Soft-deleted rows are retained for stable cursors. */
  readonly events: readonly CareEvent[];
  /** Present only when another page exists. */
  readonly nextCursor?: CareEventCursor;
  readonly hasMore: boolean;
}

export interface CareEventPageRepositoryPort {
  listPage(request: CareEventPageRequest): Promise<CareEventPage>;
}

type CareEventTimelinePosition = Pick<CareEvent, 'id' | 'occurredAt'>;

function utf8Bytes(value: string): readonly number[] {
  const bytes: number[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const first = value.charCodeAt(index);
    let codePoint: number;
    if (first >= 0xd800 && first <= 0xdbff) {
      const second = value.charCodeAt(index + 1);
      if (second >= 0xdc00 && second <= 0xdfff) {
        codePoint = 0x10000 + ((first - 0xd800) << 10) + (second - 0xdc00);
        index += 1;
      } else {
        codePoint = 0xfffd;
      }
    } else if (first >= 0xdc00 && first <= 0xdfff) {
      codePoint = 0xfffd;
    } else {
      codePoint = first;
    }

    if (codePoint <= 0x7f) {
      bytes.push(codePoint);
    } else if (codePoint <= 0x7ff) {
      bytes.push(0xc0 | (codePoint >> 6));
      bytes.push(0x80 | (codePoint & 0x3f));
    } else if (codePoint <= 0xffff) {
      bytes.push(0xe0 | (codePoint >> 12));
      bytes.push(0x80 | ((codePoint >> 6) & 0x3f));
      bytes.push(0x80 | (codePoint & 0x3f));
    } else {
      bytes.push(0xf0 | (codePoint >> 18));
      bytes.push(0x80 | ((codePoint >> 12) & 0x3f));
      bytes.push(0x80 | ((codePoint >> 6) & 0x3f));
      bytes.push(0x80 | (codePoint & 0x3f));
    }
  }
  return bytes;
}

/** Compares IDs by unsigned UTF-8 bytes, matching Firestore string ordering. */
export function compareUtf8DocumentIds(left: string, right: string): number {
  if (left === right) {
    return 0;
  }
  const leftBytes = utf8Bytes(left);
  const rightBytes = utf8Bytes(right);
  const sharedLength = Math.min(leftBytes.length, rightBytes.length);
  for (let index = 0; index < sharedLength; index += 1) {
    const leftByte = leftBytes[index]!;
    const rightByte = rightBytes[index]!;
    if (leftByte !== rightByte) {
      return leftByte < rightByte ? -1 : 1;
    }
  }
  return leftBytes.length < rightBytes.length ? -1 : 1;
}

/** Array-sort comparator for `(occurredAt DESC, documentId DESC)`. */
export function compareCareEventNewestFirst(
  left: CareEventTimelinePosition,
  right: CareEventTimelinePosition,
): number {
  if (left.occurredAt !== right.occurredAt) {
    return left.occurredAt > right.occurredAt ? -1 : 1;
  }
  return -compareUtf8DocumentIds(left.id, right.id);
}

export function careEventCursorFromEvent(
  event: CareEventTimelinePosition,
): CareEventCursor {
  return { occurredAt: event.occurredAt, eventId: event.id };
}

/**
 * True when an event belongs after the cursor in newest-first Firestore order.
 */
export function isCareEventAfterCursor(
  event: CareEventTimelinePosition,
  cursor: CareEventCursor,
): boolean {
  return (
    compareCareEventNewestFirst(event, {
      id: cursor.eventId,
      occurredAt: cursor.occurredAt,
    }) > 0
  );
}

function validTimestamp(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function assertCanonicalId(
  value: string,
  parse: (candidate: string) => string,
  label: string,
): void {
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

/** Validates an untrusted page request without normalizing it. */
export function validateCareEventPageRequest(
  request: CareEventPageRequest,
): CareEventPageRequest {
  if (!request || typeof request !== 'object') {
    throw new Error('Care event page request must be an object');
  }
  assertCanonicalId(request.groupId, parseGroupId, 'groupId');
  assertCanonicalId(request.babyId, parseBabyId, 'babyId');
  if (
    !Number.isSafeInteger(request.pageSize) ||
    request.pageSize < MIN_CARE_EVENT_PAGE_SIZE ||
    request.pageSize > MAX_CARE_EVENT_PAGE_SIZE
  ) {
    throw new Error(
      `Care event pageSize must be an integer from ${MIN_CARE_EVENT_PAGE_SIZE} to ${MAX_CARE_EVENT_PAGE_SIZE}`,
    );
  }
  if (request.from !== undefined && !validTimestamp(request.from)) {
    throw new Error('Care event page from must be a valid timestamp');
  }
  if (request.to !== undefined && !validTimestamp(request.to)) {
    throw new Error('Care event page to must be a valid timestamp');
  }
  if (
    request.from !== undefined &&
    request.to !== undefined &&
    request.to <= request.from
  ) {
    throw new Error('Care event page range must have a positive duration');
  }
  if (
    request.kinds !== undefined &&
    (!Array.isArray(request.kinds) ||
      request.kinds.some(
        (kind) => !CARE_EVENT_KINDS.includes(kind),
      ))
  ) {
    throw new Error('Care event page kinds are invalid');
  }
  if (request.after !== undefined) {
    if (
      !request.after ||
      typeof request.after !== 'object' ||
      !validTimestamp(request.after.occurredAt)
    ) {
      throw new Error('Care event page cursor timestamp is invalid');
    }
    assertCanonicalId(request.after.eventId, parseEventId, 'cursor eventId');
  }
  return request;
}

/** Pure reference implementation used by target fakes and contract tests. */
export function paginateCareEvents(
  events: readonly CareEvent[],
  request: CareEventPageRequest,
): CareEventPage {
  validateCareEventPageRequest(request);
  const ordered = events
    .filter(
      (event) =>
        event.groupId === request.groupId && event.babyId === request.babyId,
    )
    .filter(
      (event) => request.from === undefined || event.occurredAt >= request.from,
    )
    .filter(
      (event) => request.to === undefined || event.occurredAt < request.to,
    )
    .filter((event) => !request.kinds || request.kinds.includes(event.kind))
    .filter(
      (event) => !request.after || isCareEventAfterCursor(event, request.after),
    )
    .sort(compareCareEventNewestFirst);
  const hasMore = ordered.length > request.pageSize;
  const pageEvents = ordered.slice(0, request.pageSize);
  const last = pageEvents.at(-1);
  return {
    events: pageEvents,
    hasMore,
    ...(hasMore && last ? { nextCursor: careEventCursorFromEvent(last) } : {}),
  };
}
