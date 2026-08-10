import type { BabyId, EventId, GroupId, UserId } from './ids.ts';
import { normalizeDisplayName } from '../value_objects/display-name.ts';

export type CareEventKind =
  | 'feeding'
  | 'diaper'
  | 'sleep'
  | 'temperature'
  | 'medication';
export const CARE_EVENT_KINDS: readonly CareEventKind[] = [
  'feeding',
  'diaper',
  'sleep',
  'temperature',
  'medication',
];
export type FeedingType = 'breast' | 'bottle_breastmilk' | 'formula' | 'solid';
export type DiaperType = 'wet' | 'dirty' | 'mixed';
export type SleepType = 'nap' | 'night';
export type TemperatureMeasurementSite =
  | 'armpit'
  | 'ear'
  | 'forehead'
  | 'oral'
  | 'rectal'
  | 'other';
export type MedicationCategory = 'antipyretic' | 'antibiotic' | 'other';
export type MedicationActiveIngredient =
  | 'acetaminophen'
  | 'ibuprofen'
  | 'other';
export type MedicationDoseUnit = 'ml' | 'mg' | 'tablet' | 'drop';

export const MAX_SLEEP_DURATION_MS = 48 * 60 * 60 * 1_000;

interface CareEventBase {
  readonly id: EventId;
  readonly groupId: GroupId;
  readonly babyId: BabyId;
  readonly caregiverId: UserId;
  readonly occurredAt: number;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly revision: number;
  readonly note?: string;
  readonly deletedAt?: number;
}

export interface FeedingEvent extends CareEventBase {
  readonly kind: 'feeding';
  readonly feedingType: FeedingType;
  readonly volumeMl?: number;
  readonly leftDurationSeconds?: number;
  readonly rightDurationSeconds?: number;
}

export interface DiaperEvent extends CareEventBase {
  readonly kind: 'diaper';
  readonly diaperType: DiaperType;
}

export interface SleepEvent extends CareEventBase {
  readonly kind: 'sleep';
  readonly sleepType: SleepType;
  readonly startedAt: number;
  readonly endedAt?: number;
}

export interface TemperatureEvent extends CareEventBase {
  readonly kind: 'temperature';
  readonly temperatureCelsius: number;
  readonly measurementSite: TemperatureMeasurementSite;
}

export interface MedicationEvent extends CareEventBase {
  readonly kind: 'medication';
  readonly medicationName: string;
  readonly medicationCategory: MedicationCategory;
  readonly activeIngredient: MedicationActiveIngredient;
  readonly doseAmount: number;
  readonly doseUnit: MedicationDoseUnit;
  /** User-confirmed interval from the product label or a clinician. */
  readonly minimumIntervalMinutes: number;
}

export type CareEvent =
  | FeedingEvent
  | DiaperEvent
  | SleepEvent
  | TemperatureEvent
  | MedicationEvent;

type CreateBase = Pick<
  CareEventBase,
  'groupId' | 'babyId' | 'caregiverId' | 'occurredAt' | 'note'
>;

export type CreateCareEventInput =
  | (CreateBase & Omit<FeedingEvent, keyof CareEventBase | 'kind'> & { readonly kind: 'feeding' })
  | (CreateBase & Omit<DiaperEvent, keyof CareEventBase | 'kind'> & { readonly kind: 'diaper' })
  | (Omit<CreateBase, 'occurredAt'> &
      Omit<SleepEvent, keyof CareEventBase | 'kind'> & { readonly kind: 'sleep' })
  | (CreateBase &
      Omit<TemperatureEvent, keyof CareEventBase | 'kind'> & {
        readonly kind: 'temperature';
      })
  | (CreateBase &
      Omit<MedicationEvent, keyof CareEventBase | 'kind'> & {
        readonly kind: 'medication';
      });

export interface NewEventMetadata {
  readonly id: EventId;
  readonly now: number;
}

function validateFinitePositive(value: number | undefined, label: string, max: number): void {
  if (value === undefined) {
    return;
  }
  if (!Number.isFinite(value) || value <= 0 || value > max) {
    throw new Error(`${label} must be greater than 0 and at most ${max}`);
  }
}

function normalizedNote(note: string | undefined): string | undefined {
  const value = note?.trim();
  if (!value) {
    return undefined;
  }
  if (value.length > 500) {
    throw new Error('Care event note must be at most 500 characters');
  }
  return value;
}

function normalizedMedicationName(name: string): string {
  return normalizeDisplayName(name, 'Medication name');
}

export function createCareEvent(
  input: CreateCareEventInput,
  metadata: NewEventMetadata,
): CareEvent {
  const occurredAt = input.kind === 'sleep' ? input.startedAt : input.occurredAt;
  if (!Number.isFinite(occurredAt) || occurredAt < 0) {
    throw new Error('Care event occurredAt must be a valid timestamp');
  }
  if (occurredAt > metadata.now + 5 * 60 * 1_000) {
    throw new Error('Care event occurredAt is too far in the future');
  }

  const note = normalizedNote(input.note);
  const base = {
    id: metadata.id,
    groupId: input.groupId,
    babyId: input.babyId,
    caregiverId: input.caregiverId,
    occurredAt,
    createdAt: metadata.now,
    updatedAt: metadata.now,
    revision: 1,
    ...(note ? { note } : {}),
  };

  if (input.kind === 'feeding') {
    if (!['breast', 'bottle_breastmilk', 'formula', 'solid'].includes(input.feedingType)) {
      throw new Error('Feeding feedingType is invalid');
    }
    validateFinitePositive(input.volumeMl, 'Feeding volumeMl', 2_000);
    validateFinitePositive(
      input.leftDurationSeconds,
      'Feeding leftDurationSeconds',
      43_200,
    );
    validateFinitePositive(
      input.rightDurationSeconds,
      'Feeding rightDurationSeconds',
      43_200,
    );

    const breastDuration =
      (input.leftDurationSeconds ?? 0) + (input.rightDurationSeconds ?? 0);
    if (input.feedingType === 'breast' && breastDuration <= 0) {
      throw new Error('Breastfeeding requires a left or right duration');
    }
    if (input.feedingType === 'breast' && breastDuration > 43_200) {
      throw new Error('Breastfeeding total duration must not exceed 43200');
    }
    if (input.feedingType !== 'breast' && input.volumeMl === undefined) {
      throw new Error('Bottle and solid feeding require volumeMl');
    }
    if (
      input.feedingType !== 'breast' &&
      (input.leftDurationSeconds !== undefined ||
        input.rightDurationSeconds !== undefined)
    ) {
      throw new Error('Bottle and solid feeding must not contain breast durations');
    }

    return {
      ...base,
      kind: 'feeding',
      feedingType: input.feedingType,
      ...(input.volumeMl !== undefined ? { volumeMl: input.volumeMl } : {}),
      ...(input.leftDurationSeconds !== undefined
        ? { leftDurationSeconds: input.leftDurationSeconds }
        : {}),
      ...(input.rightDurationSeconds !== undefined
        ? { rightDurationSeconds: input.rightDurationSeconds }
        : {}),
    };
  }

  if (input.kind === 'diaper') {
    if (!['wet', 'dirty', 'mixed'].includes(input.diaperType)) {
      throw new Error('Diaper diaperType is invalid');
    }
    return {
      ...base,
      kind: 'diaper',
      diaperType: input.diaperType,
    };
  }

  if (input.kind === 'temperature') {
    if (
      !Number.isFinite(input.temperatureCelsius) ||
      input.temperatureCelsius < 30 ||
      input.temperatureCelsius > 45
    ) {
      throw new Error('Temperature must be from 30 to 45 degrees Celsius');
    }
    if (
      !['armpit', 'ear', 'forehead', 'oral', 'rectal', 'other'].includes(
        input.measurementSite,
      )
    ) {
      throw new Error('Temperature measurementSite is invalid');
    }
    return {
      ...base,
      kind: 'temperature',
      temperatureCelsius: Math.round(input.temperatureCelsius * 10) / 10,
      measurementSite: input.measurementSite,
    };
  }

  if (input.kind === 'medication') {
    if (!['antipyretic', 'antibiotic', 'other'].includes(input.medicationCategory)) {
      throw new Error('Medication category is invalid');
    }
    if (!['acetaminophen', 'ibuprofen', 'other'].includes(input.activeIngredient)) {
      throw new Error('Medication activeIngredient is invalid');
    }
    if (
      input.medicationCategory === 'antipyretic' &&
      input.activeIngredient === 'other'
    ) {
      throw new Error('Antipyretic medication requires a known active ingredient');
    }
    if (
      input.medicationCategory !== 'antipyretic' &&
      input.activeIngredient !== 'other'
    ) {
      throw new Error('Known antipyretic ingredients require antipyretic category');
    }
    validateFinitePositive(input.doseAmount, 'Medication doseAmount', 10_000);
    if (!['ml', 'mg', 'tablet', 'drop'].includes(input.doseUnit)) {
      throw new Error('Medication doseUnit is invalid');
    }
    if (
      !Number.isInteger(input.minimumIntervalMinutes) ||
      input.minimumIntervalMinutes < 15 ||
      input.minimumIntervalMinutes > 10_080
    ) {
      throw new Error('Medication minimumIntervalMinutes must be from 15 to 10080');
    }
    return {
      ...base,
      kind: 'medication',
      medicationName: normalizedMedicationName(input.medicationName),
      medicationCategory: input.medicationCategory,
      activeIngredient: input.activeIngredient,
      doseAmount: input.doseAmount,
      doseUnit: input.doseUnit,
      minimumIntervalMinutes: input.minimumIntervalMinutes,
    };
  }

  if (!['nap', 'night'].includes(input.sleepType)) {
    throw new Error('Sleep sleepType is invalid');
  }
  if (input.endedAt !== undefined && input.endedAt <= input.startedAt) {
    throw new Error('Sleep endedAt must be after startedAt');
  }
  if (input.endedAt !== undefined && input.endedAt > metadata.now) {
    throw new Error('Sleep endedAt must not be in the future');
  }
  if (
    input.endedAt !== undefined &&
    input.endedAt - input.startedAt > MAX_SLEEP_DURATION_MS
  ) {
    throw new Error('Sleep session must not exceed 48 hours');
  }

  return {
    ...base,
    kind: 'sleep',
    sleepType: input.sleepType,
    startedAt: input.startedAt,
    ...(input.endedAt !== undefined ? { endedAt: input.endedAt } : {}),
  };
}

export function isActiveSleep(event: CareEvent): event is SleepEvent {
  return event.kind === 'sleep' && event.endedAt === undefined && event.deletedAt === undefined;
}
