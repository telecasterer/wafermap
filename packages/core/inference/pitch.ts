export interface PitchInference {
  pitchX: number;
  pitchY: number;
  confidence: number;
}

/**
 * Infer die pitch (grid spacing) from a set of XY positions.
 * Finds the fundamental spacing in each axis by analysing the minimum
 * recurring difference between sorted unique coordinate values.
 */
export function inferDiePitch(points: Array<{ x: number; y: number }>): PitchInference {
  if (points.length < 2) {
    return { pitchX: 10, pitchY: 10, confidence: 0 };
  }

  const xResult = findPitch(points.map(p => p.x));
  const yResult = findPitch(points.map(p => p.y));

  return {
    pitchX: xResult.pitch,
    pitchY: yResult.pitch,
    confidence: (xResult.confidence + yResult.confidence) / 2,
  };
}

function findPitch(coords: number[]): { pitch: number; confidence: number } {
  // Deduplicate with rounding to suppress floating-point noise
  const unique = [...new Set(coords.map(v => Math.round(v * 100) / 100))].sort((a, b) => a - b);

  if (unique.length < 2) return { pitch: 10, confidence: 0 };

  const diffs: number[] = [];
  for (let i = 1; i < unique.length; i++) {
    const d = unique[i] - unique[i - 1];
    if (d > 1e-6) diffs.push(d);
  }

  if (diffs.length === 0) return { pitch: 10, confidence: 0 };

  // The fundamental pitch is the smallest positive difference between adjacent
  // unique values. Larger gaps are multiples of this base pitch.
  const minDiff = Math.min(...diffs);

  // Validate: fraction of diffs that are near-integer multiples of minDiff.
  const tol = 0.05;
  let matches = 0;
  for (const d of diffs) {
    const ratio = d / minDiff;
    if (Math.abs(ratio - Math.round(ratio)) / Math.max(ratio, 1) < tol) matches++;
  }

  return { pitch: minDiff, confidence: matches / diffs.length };
}
