export const STANDARD_ROUND_DUCT_DIAMETERS_MM = [
  80,
  100,
  125,
  160,
  200,
  250,
  315,
  355,
  400,
  450,
  500,
  560,
  630,
  710,
  800,
  900,
  1000,
  1120,
  1250
] as const;

export type StandardRoundDuctDiameterMm =
  (typeof STANDARD_ROUND_DUCT_DIAMETERS_MM)[number];

export function isStandardRoundDuctDiameterMm(
  value: number
): value is StandardRoundDuctDiameterMm {
  return STANDARD_ROUND_DUCT_DIAMETERS_MM.includes(
    value as StandardRoundDuctDiameterMm
  );
}

export function normalizeRoundDuctDiameterMm(
  value: number
): StandardRoundDuctDiameterMm {
  if (isStandardRoundDuctDiameterMm(value)) {
    return value;
  }

  return STANDARD_ROUND_DUCT_DIAMETERS_MM.reduce((currentClosest, candidate) =>
    Math.abs(candidate - value) < Math.abs(currentClosest - value)
      ? candidate
      : currentClosest
  );
}
