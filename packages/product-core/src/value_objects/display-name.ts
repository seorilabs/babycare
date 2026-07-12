const UNSAFE_DISPLAY_CONTROL =
  /[\u0000-\u001F\u007F-\u009F\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/u;

export function hasUnsafeDisplayControl(value: string): boolean {
  return UNSAFE_DISPLAY_CONTROL.test(value);
}

export function normalizeDisplayName(value: string, label: string): string {
  if (hasUnsafeDisplayControl(value)) {
    throw new Error(
      `${label} must contain 1 to 80 visible characters without control characters`,
    );
  }
  const normalized = value.trim();
  if (
    normalized.length === 0 ||
    normalized.length > 80
  ) {
    throw new Error(
      `${label} must contain 1 to 80 visible characters without control characters`,
    );
  }
  return normalized;
}
