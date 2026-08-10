import type {
  CareEvent,
  MedicationActiveIngredient,
  MedicationEvent,
} from '../domain/care-event.ts';

export interface MedicationTimingAssessment {
  readonly sameMedication?: MedicationEvent;
  readonly otherAntipyretic?: MedicationEvent;
  readonly nextAllowedAt?: number;
  readonly requiresAcknowledgement: boolean;
}

function normalizedName(value: string): string {
  return value.trim().toLocaleLowerCase('en-US').replace(/\s+/g, ' ');
}

export function medicationIdentity(event: Pick<
  MedicationEvent,
  'activeIngredient' | 'medicationName'
>): string {
  return event.activeIngredient === 'other'
    ? `name:${normalizedName(event.medicationName)}`
    : `ingredient:${event.activeIngredient}`;
}

function visibleMedicationEvents(events: readonly CareEvent[]): readonly MedicationEvent[] {
  return events.filter(
    (event): event is MedicationEvent =>
      event.kind === 'medication' && event.deletedAt === undefined,
  );
}

/**
 * Checks both sides of a retrospective entry. It never diagnoses or recommends
 * a dose; the interval is the value the caregiver confirmed from the label or
 * a clinician when the medication was logged.
 */
export function assessMedicationTiming(
  events: readonly CareEvent[],
  candidate: Pick<
    MedicationEvent,
    | 'occurredAt'
    | 'medicationName'
    | 'medicationCategory'
    | 'activeIngredient'
    | 'minimumIntervalMinutes'
  >,
): MedicationTimingAssessment {
  const identity = medicationIdentity(candidate);
  const medications = visibleMedicationEvents(events);
  const sameMedication = medications
    .filter(event => medicationIdentity(event) === identity)
    .map(event => ({
      event,
      gap: Math.abs(candidate.occurredAt - event.occurredAt),
      required:
        Math.max(
          candidate.minimumIntervalMinutes,
          event.minimumIntervalMinutes,
        ) * 60_000,
    }))
    .filter(item => item.gap < item.required)
    .sort((left, right) => left.gap - right.gap)[0]?.event;

  const previousSameMedication = medications
    .filter(
      event =>
        medicationIdentity(event) === identity &&
        event.occurredAt <= candidate.occurredAt,
    )
    .sort((left, right) => right.occurredAt - left.occurredAt)[0];
  const nextAllowedAt = previousSameMedication
    ? previousSameMedication.occurredAt +
      Math.max(
        candidate.minimumIntervalMinutes,
        previousSameMedication.minimumIntervalMinutes,
      ) *
        60_000
    : undefined;

  const otherAntipyretic =
    candidate.medicationCategory === 'antipyretic'
      ? medications
          .filter(
            event =>
              event.medicationCategory === 'antipyretic' &&
              event.activeIngredient !== candidate.activeIngredient &&
              Math.abs(event.occurredAt - candidate.occurredAt) < 60_000,
          )
          .sort(
            (left, right) =>
              Math.abs(left.occurredAt - candidate.occurredAt) -
              Math.abs(right.occurredAt - candidate.occurredAt),
          )[0]
      : undefined;

  return {
    ...(sameMedication ? {sameMedication} : {}),
    ...(otherAntipyretic ? {otherAntipyretic} : {}),
    ...(nextAllowedAt !== undefined ? {nextAllowedAt} : {}),
    requiresAcknowledgement: Boolean(sameMedication || otherAntipyretic),
  };
}

export function nextMedicationTime(
  events: readonly CareEvent[],
  ingredient: Exclude<MedicationActiveIngredient, 'other'>,
): number | undefined {
  const latest = visibleMedicationEvents(events)
    .filter(event => event.activeIngredient === ingredient)
    .sort((left, right) => right.occurredAt - left.occurredAt)[0];
  return latest
    ? latest.occurredAt + latest.minimumIntervalMinutes * 60_000
    : undefined;
}
