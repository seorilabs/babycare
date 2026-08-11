import {calculateTimeAgo, type CareEvent} from '../../../../packages/product-core/src/index.ts';

import type {Strings} from './strings';

export function formatTimeAgo(
  occurredAt: number,
  now: number,
  strings: Strings,
): string {
  const timeAgo = calculateTimeAgo(occurredAt, now);
  if (timeAgo.unit === 'just_now') {
    return timeAgo.isFuture ? strings.timeAgo.soon : strings.timeAgo.justNow;
  }
  return timeAgo.isFuture
    ? strings.timeAgo.future(timeAgo.value, timeAgo.unit)
    : strings.timeAgo.past(timeAgo.value, timeAgo.unit);
}

export function formatDuration(seconds: number, strings: Strings): string {
  const rounded = Math.max(0, Math.round(seconds));
  const hours = Math.floor(rounded / 3_600);
  const minutes = Math.floor((rounded % 3_600) / 60);
  if (hours > 0) {
    return strings.duration.hoursMinutes(hours, minutes);
  }
  if (minutes > 0) {
    return strings.duration.minutes(minutes);
  }
  return strings.duration.seconds(rounded);
}

export function eventIcon(event: CareEvent): string {
  return event.kind === 'feeding'
    ? '🍼'
    : event.kind === 'diaper'
      ? '🧷'
      : event.kind === 'sleep'
        ? '🌙'
        : event.kind === 'temperature'
          ? '🌡️'
          : '💊';
}

export function eventTitle(event: CareEvent, strings: Strings): string {
  if (event.kind === 'feeding') {
    if (event.feedingType === 'breast') {
      const sides = [
        event.leftDurationSeconds
          ? strings.event.leftSide(
              formatDuration(event.leftDurationSeconds, strings),
            )
          : undefined,
        event.rightDurationSeconds
          ? strings.event.rightSide(
              formatDuration(event.rightDurationSeconds, strings),
            )
          : undefined,
      ].filter(Boolean);
      return strings.event.breastMilk(sides.join(' / '));
    }
    const label =
      event.feedingType === 'formula'
        ? strings.event.formula
        : event.feedingType === 'bottle_breastmilk'
          ? strings.event.pumped
          : strings.event.solid;
    return strings.event.volume(label, Math.round(event.volumeMl ?? 0));
  }
  if (event.kind === 'diaper') {
    const label =
      event.diaperType === 'wet'
        ? strings.event.diaperWet
        : event.diaperType === 'dirty'
          ? strings.event.diaperDirty
          : strings.event.diaperMixed;
    return strings.event.diaper(label);
  }
  if (event.kind === 'temperature') {
    const site = {
      armpit: strings.event.temperatureArmpit,
      ear: strings.event.temperatureEar,
      forehead: strings.event.temperatureForehead,
      oral: strings.event.temperatureOral,
      rectal: strings.event.temperatureRectal,
      other: strings.event.temperatureOther,
    }[event.measurementSite];
    return strings.event.temperature(event.temperatureCelsius, site);
  }
  if (event.kind === 'medication') {
    const unit =
      event.doseUnit === 'tablet'
        ? strings.intlLocale === 'ko-KR'
          ? '정'
          : ' tablet'
        : event.doseUnit === 'drop'
          ? strings.intlLocale === 'ko-KR'
            ? '방울'
            : ' drops'
          : event.doseUnit;
    return strings.event.medication(
      event.medicationName,
      `${event.doseAmount}${unit}`,
    );
  }
  const label =
    event.sleepType === 'nap' ? strings.event.nap : strings.event.nightSleep;
  return event.endedAt
    ? strings.event.sleepEnded(
        label,
        formatDuration((event.endedAt - event.startedAt) / 1_000, strings),
      )
    : strings.event.sleepActive(label);
}
