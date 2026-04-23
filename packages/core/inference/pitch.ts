export interface PitchResult {
  pitchX: number;
  pitchY: number;
  /** 'mm' when at least one physical dimension is known; 'normalised' when
   *  dimensions are estimated solely from the circular grid constraint. */
  units: 'mm' | 'normalised';
  confidence: number;
}

/**
 * Resolve die pitch from prober-step grid positions and optional geometry.
 *
 * Input x,y are integer prober step coordinates (die grid positions), not mm.
 * Physical mm position = grid_pos × pitch.
 *
 * When neither die dimensions nor wafer diameter are known, the wafer's
 * circular shape constrains the aspect ratio:
 *   (x_range × pitchX) ≈ (y_range × pitchY)   [both span the full diameter]
 * Setting pitchX = 1 (normalised unit) gives pitchY = x_range / y_range.
 */
export function resolveGridPitch(
  gridPoints: Array<{ x: number; y: number }>,
  dieOpts?: { width?: number; height?: number },
  waferDiameter?: number,
): PitchResult {
  const hasWidth  = dieOpts?.width  !== undefined;
  const hasHeight = dieOpts?.height !== undefined;

  // Case 1: Both dimensions provided — fully specified in mm.
  if (hasWidth && hasHeight) {
    return {
      pitchX: dieOpts!.width!,
      pitchY: dieOpts!.height!,
      units: 'mm',
      confidence: 1.0,
    };
  }

  if (gridPoints.length === 0) {
    const fallback = hasWidth ? dieOpts!.width! : hasHeight ? dieOpts!.height! : 10;
    return {
      pitchX: fallback,
      pitchY: fallback,
      units: hasWidth || hasHeight || waferDiameter !== undefined ? 'mm' : 'normalised',
      confidence: 0,
    };
  }

  const xs = gridPoints.map(p => p.x);
  const ys = gridPoints.map(p => p.y);
  const xRange = Math.max(...xs) - Math.min(...xs) + 1;
  const yRange = Math.max(...ys) - Math.min(...ys) + 1;

  // Case 2: Width only — derive height from circular aspect ratio.
  if (hasWidth) {
    const pitchX = dieOpts!.width!;
    return { pitchX, pitchY: pitchX * xRange / yRange, units: 'mm', confidence: 0.8 };
  }

  // Case 3: Height only — derive width from circular aspect ratio.
  if (hasHeight) {
    const pitchY = dieOpts!.height!;
    return { pitchX: pitchY * yRange / xRange, pitchY, units: 'mm', confidence: 0.8 };
  }

  // Case 4: Wafer diameter provided but no die size.
  // Each axis independently spans approximately the full diameter in steps.
  if (waferDiameter !== undefined) {
    return {
      pitchX: waferDiameter / xRange,
      pitchY: waferDiameter / yRange,
      units: 'mm',
      confidence: 0.6,
    };
  }

  // Case 5: Nothing provided — normalised units, aspect ratio from circular constraint.
  // pitchX = 1 unit; pitchY = xRange / yRange keeps physical extents equal.
  return {
    pitchX: 1,
    pitchY: xRange / yRange,
    units: 'normalised',
    confidence: 0.4,
  };
}
