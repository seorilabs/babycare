import {
  babyId,
  createCareEvent,
  eventId,
  groupId,
  userId,
  type CareEvent,
} from '@babycare/product-core';

import {
  careEventMutationId,
  careEventPayloadHash,
  CareEventRevisionConflictError,
  planCareEventRemoteWrite,
  sha256Hex,
} from '@babycare/product-data';

const original = createCareEvent(
  {
    groupId: groupId('group-1'),
    babyId: babyId('baby-1'),
    caregiverId: userId('user-1'),
    kind: 'diaper',
    diaperType: 'wet',
    occurredAt: 1_000,
  },
  {id: eventId('event-1'), now: 2_000},
) as Extract<CareEvent, {kind: 'diaper'}>;

describe('care event remote revision planning', () => {
  it('derives a platform-neutral canonical SHA-256 payload fingerprint', () => {
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    expect(sha256Hex('아기')).toBe(
      'd5fa7c0faafdc9fccb1642468e4a61a01d2a79a929bc8b9f3855bd0612b94cb2',
    );
    expect(sha256Hex('👶')).toBe(
      '34966e666e6700121b71d7cd5f6cb3741b39ff5d21e4eb143094b78f3abe5c34',
    );
    expect(sha256Hex('\ud800')).toBe(
      '83d544ccc223c057d2bf80d3f2a32982c32c3c0db8e2674820da5064783fb097',
    );
    expect(sha256Hex('a'.repeat(56))).toBe(
      'b35439a4ac6f0948b6d6f9e3c6af0f5f590ce20f1bde7090ef7970686ec6738a',
    );

    const reordered = Object.fromEntries(
      Object.entries(original).reverse(),
    ) as unknown as CareEvent;
    expect(careEventPayloadHash(reordered)).toBe(
      careEventPayloadHash(original),
    );
    expect(careEventPayloadHash({...original, diaperType: 'dirty'})).not.toBe(
      careEventPayloadHash(original),
    );
    expect(careEventMutationId(original)).toBe(
      `${original.id}@1@${careEventPayloadHash(original)}`,
    );
  });

  it('classifies create, exact retry, and one-step update', () => {
    const updated = {
      ...original,
      diaperType: 'dirty',
      updatedAt: 3_000,
      revision: 2,
    } satisfies CareEvent;

    expect(planCareEventRemoteWrite(undefined, original)).toBe('create');
    expect(planCareEventRemoteWrite(original, original)).toBe('noop');
    expect(planCareEventRemoteWrite(original, updated)).toBe('update');
  });

  it('rejects missing, divergent, skipped, and identity-changing revisions', () => {
    const cases: readonly [CareEvent | undefined, CareEvent][] = [
      [undefined, {...original, revision: 2}],
      [original, {...original, diaperType: 'dirty'}],
      [original, {...original, revision: 3, updatedAt: 3_000}],
      [original, {...original, babyId: babyId('baby-2'), revision: 2}],
    ];

    for (const [remote, local] of cases) {
      expect(() => planCareEventRemoteWrite(remote, local)).toThrow(
        CareEventRevisionConflictError,
      );
    }
  });
});
