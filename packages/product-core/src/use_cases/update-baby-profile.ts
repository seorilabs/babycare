import {
  parseIsoCalendarDate,
  validateBaby,
  type Baby,
} from '../domain/baby.ts';
import {canPerformGroupAction} from '../domain/care-group.ts';
import type {BabyId, GroupId, UserId} from '../domain/ids.ts';
import type {BabyRepositoryPort} from '../ports/baby-repository.ts';
import type {CareGroupRepositoryPort} from '../ports/care-group-repository.ts';
import type {ClockPort} from '../ports/clock.ts';
import {normalizeDisplayName} from '../value_objects/display-name.ts';

export type UpdateBabyProfileRejection =
  | 'not_owner'
  | 'baby_not_found'
  | 'name_invalid'
  | 'birth_date_invalid'
  | 'birth_date_future';

export class UpdateBabyProfileError extends Error {
  readonly reason: UpdateBabyProfileRejection;

  constructor(reason: UpdateBabyProfileRejection) {
    super(`Baby profile update rejected: ${reason}`);
    this.name = 'UpdateBabyProfileError';
    this.reason = reason;
  }
}

export interface UpdateBabyProfileDependencies {
  readonly groups: Pick<CareGroupRepositoryPort, 'findMembership'>;
  readonly babies: Pick<BabyRepositoryPort, 'findById' | 'save'>;
  readonly clock: ClockPort;
}

export interface UpdateBabyProfileInput {
  readonly groupId: GroupId;
  readonly babyId: BabyId;
  readonly actorId: UserId;
  readonly name: string;
  readonly birthDate: string;
}

function localCalendarDay(now: number): number {
  const value = new Date(now);
  return Date.UTC(value.getFullYear(), value.getMonth(), value.getDate());
}

export function createUpdateBabyProfile(deps: UpdateBabyProfileDependencies) {
  return async function updateBabyProfile(
    input: UpdateBabyProfileInput,
  ): Promise<Baby> {
    const actor = await deps.groups.findMembership(input.groupId, input.actorId);
    if (!canPerformGroupAction(actor, 'update_baby_profile')) {
      throw new UpdateBabyProfileError('not_owner');
    }

    const baby = await deps.babies.findById(input.groupId, input.babyId);
    if (!baby) {
      throw new UpdateBabyProfileError('baby_not_found');
    }

    let name: string;
    try {
      name = normalizeDisplayName(input.name, 'Baby name');
    } catch {
      throw new UpdateBabyProfileError('name_invalid');
    }

    const now = deps.clock.now();
    const birthDate = parseIsoCalendarDate(input.birthDate);
    if (birthDate === undefined) {
      throw new UpdateBabyProfileError('birth_date_invalid');
    }
    if (birthDate > localCalendarDay(now)) {
      throw new UpdateBabyProfileError('birth_date_future');
    }

    const updated = validateBaby({
      ...baby,
      name,
      birthDate: input.birthDate,
      updatedAt: Math.max(now, baby.updatedAt),
    });
    await deps.babies.save(updated);
    return updated;
  };
}
