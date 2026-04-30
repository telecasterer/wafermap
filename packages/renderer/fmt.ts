const SI_PREFIXES: [number, string][] = [
  [1e12, 'T'], [1e9, 'G'], [1e6, 'M'], [1e3, 'k'],
  [1, ''], [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n'], [1e-12, 'p'], [1e-15, 'f'],
];

function siFormat(v: number, unit: string): string {
  const abs = Math.abs(v);
  const [scale, prefix] = SI_PREFIXES.find(([s]) => abs >= s * 0.9999) ?? [1e-15, 'f'];
  const scaled = v / scale;
  const a = Math.abs(scaled);
  const digits = a >= 100 ? 0 : a >= 10 ? 1 : 2;
  return `${scaled.toFixed(digits)} ${prefix}${unit}`;
}

function engFormat(v: number): string {
  const abs = Math.abs(v);
  const exp3 = Math.floor(Math.log10(abs) / 3) * 3;
  const clamped = Math.max(-15, Math.min(12, exp3));
  const scaled = v / Math.pow(10, clamped);
  const a = Math.abs(scaled);
  const digits = a >= 100 ? 0 : a >= 10 ? 1 : 2;
  const expStr = clamped === 0 ? '' : `E${clamped > 0 ? '+' : ''}${clamped}`;
  return `${scaled.toFixed(digits)}${expStr}`;
}

/**
 * Format a numeric value for display (colorbar ticks, tooltips, overlays).
 *
 * - With a unit: always uses SI prefix (e.g. `12 µV`).
 * - Without a unit, `fallbackFormat: 'si'`: SI prefix with no unit suffix (e.g. `12 µ`).
 * - Without a unit, `fallbackFormat: 'engineering'` (default): fixed decimal for [0.1, 9999],
 *   engineering notation (E±N, multiples of 3) outside that range.
 */
export function fmt(v: number, unit?: string, fallbackFormat?: 'si' | 'engineering'): string {
  if (!isFinite(v)) return String(v);
  const abs = Math.abs(v);
  if (abs === 0) return unit ? `0 ${unit}` : '0';
  if (unit !== undefined) return siFormat(v, unit);
  if (fallbackFormat === 'si') return siFormat(v, '');
  if (abs >= 0.1 && abs < 1e4) {
    return abs >= 1000 ? v.toFixed(0) : abs >= 100 ? v.toFixed(1) : abs >= 10 ? v.toFixed(2) : v.toFixed(3);
  }
  return engFormat(v);
}
