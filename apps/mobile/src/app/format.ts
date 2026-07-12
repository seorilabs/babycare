import {calculateTimeAgo, type CareEvent} from '@babycare/product-core';

export function formatTimeAgo(occurredAt: number, now: number): string {
  const timeAgo = calculateTimeAgo(occurredAt, now);
  if (timeAgo.unit === 'just_now') {
    return timeAgo.isFuture ? '곧' : '방금';
  }
  const unit = timeAgo.unit === 'minute' ? '분' : timeAgo.unit === 'hour' ? '시간' : '일';
  return timeAgo.isFuture ? `${timeAgo.value}${unit} 후` : `${timeAgo.value}${unit} 전`;
}

export function formatDuration(seconds: number): string {
  const rounded = Math.max(0, Math.round(seconds));
  const hours = Math.floor(rounded / 3_600);
  const minutes = Math.floor((rounded % 3_600) / 60);
  if (hours > 0) {
    return `${hours}시간 ${minutes}분`;
  }
  if (minutes > 0) {
    return `${minutes}분`;
  }
  return `${rounded}초`;
}

export function eventIcon(event: CareEvent): string {
  return event.kind === 'feeding' ? '🍼' : event.kind === 'diaper' ? '🧷' : '🌙';
}

export function eventTitle(event: CareEvent): string {
  if (event.kind === 'feeding') {
    if (event.feedingType === 'breast') {
      const sides = [
        event.leftDurationSeconds
          ? `왼쪽 ${formatDuration(event.leftDurationSeconds)}`
          : undefined,
        event.rightDurationSeconds
          ? `오른쪽 ${formatDuration(event.rightDurationSeconds)}`
          : undefined,
      ].filter(Boolean);
      return `모유 · ${sides.join(' / ')}`;
    }
    const label =
      event.feedingType === 'formula'
        ? '분유'
        : event.feedingType === 'bottle_breastmilk'
          ? '유축 모유'
          : '이유식';
    return `${label} ${Math.round(event.volumeMl ?? 0)}ml`;
  }
  if (event.kind === 'diaper') {
    const label = event.diaperType === 'wet' ? '소변' : event.diaperType === 'dirty' ? '대변' : '소변 + 대변';
    return `기저귀 · ${label}`;
  }
  const label = event.sleepType === 'nap' ? '낮잠' : '밤잠';
  return event.endedAt
    ? `${label} · ${formatDuration((event.endedAt - event.startedAt) / 1_000)}`
    : `${label} 자는 중`;
}
