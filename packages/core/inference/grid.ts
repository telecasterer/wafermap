export interface GridInference {
  /** Parallel to the input points array — grid index assigned to each point. */
  indices: Array<{ x: number; y: number; i: number; j: number }>;
  /** Grid origin after alignment correction. May differ slightly from the
   *  input centroid when the centroid does not fall on a grid node. */
  center: { x: number; y: number };
  confidence: number;
}

/**
 * Assign (i, j) grid indices to XY positions given a known pitch and an
 * estimated centre.  Corrects for sub-pitch offset between the centroid and
 * the true grid origin, then reports average residual as a confidence score.
 */
export function inferGrid(
  points: Array<{ x: number; y: number }>,
  pitch: { pitchX: number; pitchY: number },
  center: { x: number; y: number },
): GridInference {
  if (points.length === 0) {
    return { indices: [], center, confidence: 0 };
  }

  const { pitchX, pitchY } = pitch;

  // First pass: assign indices using the raw centroid as origin.
  const raw = points.map(p => ({
    x: p.x,
    y: p.y,
    i: Math.round((p.x - center.x) / pitchX),
    j: Math.round((p.y - center.y) / pitchY),
  }));

  // Compute the mean residual between each actual position and its nearest
  // grid node.  This offset corrects for the centroid not sitting on a grid
  // crossing (common when the full-wafer grid has an even number of columns).
  const xOffsets = raw.map(r => r.x - (center.x + r.i * pitchX));
  const yOffsets = raw.map(r => r.y - (center.y + r.j * pitchY));
  const xMean = xOffsets.reduce((s, v) => s + v, 0) / xOffsets.length;
  const yMean = yOffsets.reduce((s, v) => s + v, 0) / yOffsets.length;

  const correctedCenter = { x: center.x + xMean, y: center.y + yMean };

  // Second pass with corrected centre.
  const indices = points.map(p => ({
    x: p.x,
    y: p.y,
    i: Math.round((p.x - correctedCenter.x) / pitchX),
    j: Math.round((p.y - correctedCenter.y) / pitchY),
  }));

  // Confidence from RMS residual relative to pitch.
  let sumSq = 0;
  for (const { x, y, i, j } of indices) {
    const dx = x - (correctedCenter.x + i * pitchX);
    const dy = y - (correctedCenter.y + j * pitchY);
    sumSq += dx * dx + dy * dy;
  }
  const rms = Math.sqrt(sumSq / indices.length);
  const avgPitch = (pitchX + pitchY) / 2;
  // Full confidence when rms < 1% of pitch; zero confidence at 10%+.
  const confidence = Math.max(0, Math.min(1, 1 - rms / (avgPitch * 0.1)));

  return { indices, center: correctedCenter, confidence };
}
