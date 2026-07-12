export type VolumeUnit = 'ml' | 'oz';

const ML_PER_US_FLUID_OUNCE = 29.5735295625;

export function toMilliliters(value: number, unit: VolumeUnit): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error('Volume must be a non-negative finite number');
  }
  return unit === 'ml' ? value : value * ML_PER_US_FLUID_OUNCE;
}

export function fromMilliliters(valueMl: number, unit: VolumeUnit): number {
  if (!Number.isFinite(valueMl) || valueMl < 0) {
    throw new Error('Volume must be a non-negative finite number');
  }
  return unit === 'ml' ? valueMl : valueMl / ML_PER_US_FLUID_OUNCE;
}

export function roundVolume(value: number, unit: VolumeUnit): number {
  const precision = unit === 'ml' ? 0 : 1;
  return Number(value.toFixed(precision));
}
