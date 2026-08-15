const ANDROID_SYSTEM_INSET_FALLBACK = 32;

function aitSystemInset(inset: number, platform: string): number {
  return inset > 0
    ? inset
    : platform === 'android'
      ? ANDROID_SYSTEM_INSET_FALLBACK
      : 0;
}

export function aitBottomInset(bottomInset: number, platform: string): number {
  return aitSystemInset(bottomInset, platform);
}

export function aitTopInset(topInset: number, platform: string): number {
  return aitSystemInset(topInset, platform);
}
