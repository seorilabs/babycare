import type {
  BootErrorCode,
  InviteJoinFailureReason,
} from '../ports/analytics.ts';

function errorCode(error: unknown): string {
  if (typeof error !== 'object' || error === null) {
    return '';
  }
  const value = (error as {readonly code?: unknown}).code;
  return typeof value === 'string' ? value.toLowerCase() : '';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message.toLowerCase() : '';
}

export function classifyInviteJoinFailure(
  error: unknown,
): InviteJoinFailureReason {
  const signal = `${errorCode(error)} ${errorMessage(error)}`;
  if (/expired/.test(signal)) {
    return 'expired';
  }
  if (/already(?:[-_ ]?exists|[-_ ]?(?:a[-_ ]?)?member)|conflict/.test(signal)) {
    return 'already_member';
  }
  if (/permission|forbidden|denied/.test(signal)) {
    return 'permission';
  }
  if (/network|unavailable|timeout|deadline|offline|fetch/.test(signal)) {
    return 'network';
  }
  if (/invalid|not[-_ ]?found|failed[-_ ]?precondition/.test(signal)) {
    return 'invalid_code';
  }
  return 'unknown';
}

export function classifyBootFailure(error: unknown): BootErrorCode {
  const signal = `${errorCode(error)} ${errorMessage(error)}`;
  if (/configuration|config|missing/.test(signal)) {
    return 'configuration';
  }
  if (/unauthenticated|auth[-_ ]?required|signed?[-_ ]?out/.test(signal)) {
    return 'unauthenticated';
  }
  if (/permission|forbidden|denied/.test(signal)) {
    return 'permission';
  }
  if (/storage|cache|persist/.test(signal)) {
    return 'storage';
  }
  if (/network|unavailable|timeout|deadline|offline|fetch/.test(signal)) {
    return 'network';
  }
  return 'unknown';
}
