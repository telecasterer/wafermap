import type { Wafer } from './wafer.js';

export interface ReticleSpec {
  width:        number;                      // field width in die counts
  height:       number;                      // field height in die counts
  diePitchX:    number;                      // die pitch in display units (mm or normalized)
  diePitchY:    number;
  anchorDie?:   { x: number; y: number };   // die index at field (0,0) corner; default {0,0}
}

/** A reticle rectangle in wafer-local (pre-rotation) coordinates. */
export interface Reticle {
  x: number; // centre x
  y: number; // centre y
  width: number;
  height: number;
}

/**
 * Generate the grid of reticle rectangles that cover the wafer area.
 * Returns positions in wafer-local coordinates (before orientation rotation).
 * Reticles that don't overlap the wafer circle are excluded.
 *
 * Width and height are in die counts; diePitchX/diePitchY convert to display units.
 * The anchorDie index lands at the reticle's (0,0) corner.
 */
export function generateReticleGrid(wafer: Wafer, config: ReticleSpec): Reticle[] {
  const { width: W, height: H, diePitchX, diePitchY, anchorDie = { x: 0, y: 0 } } = config;

  const fw = W * diePitchX;
  const fh = H * diePitchY;

  // Phase: which column/row within a field the anchor die occupies.
  const phaseX = ((anchorDie.x % W) + W) % W;
  const phaseY = ((anchorDie.y % H) + H) % H;

  // Range of integer k values whose reticle could touch the wafer circle.
  const range = wafer.radius + Math.max(fw, fh);
  const kMinX = Math.ceil((-range + phaseX * diePitchX) / fw);
  const kMaxX = Math.floor(( range + phaseX * diePitchX) / fw);
  const kMinY = Math.ceil((-range + phaseY * diePitchY) / fh);
  const kMaxY = Math.floor(( range + phaseY * diePitchY) / fh);

  const reticles: Reticle[] = [];

  for (let l = kMinY; l <= kMaxY; l++) {
    const j0 = l * H - phaseY;
    const cy  = wafer.center.y + (j0 + (H - 1) / 2) * diePitchY;

    for (let k = kMinX; k <= kMaxX; k++) {
      const i0 = k * W - phaseX;
      const cx  = wafer.center.x + (i0 + (W - 1) / 2) * diePitchX;

      // Closest point on this rectangle to the wafer centre
      const closestX = Math.max(cx - fw / 2, Math.min(wafer.center.x, cx + fw / 2));
      const closestY = Math.max(cy - fh / 2, Math.min(wafer.center.y, cy + fh / 2));
      const dx = closestX - wafer.center.x;
      const dy = closestY - wafer.center.y;

      if (dx * dx + dy * dy <= wafer.radius * wafer.radius) {
        reticles.push({ x: cx, y: cy, width: fw, height: fh });
      }
    }
  }

  return reticles;
}
