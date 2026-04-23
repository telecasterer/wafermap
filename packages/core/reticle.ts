import type { Wafer } from './wafer.js';

export interface ReticleConfig {
  width:   number;                      // field width in die counts
  height:  number;                      // field height in die counts
  pitchX:  number;                      // die pitch in display units (mm or normalised)
  pitchY:  number;
  anchor?: { x: number; y: number };   // die index at field (0,0) corner; default {0,0}
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
 * Width and height are in die counts; pitchX/pitchY convert to display units.
 * The anchor die index lands at the reticle's (0,0) corner.
 */
export function generateReticleGrid(wafer: Wafer, config: ReticleConfig): Reticle[] {
  const { width: W, height: H, pitchX, pitchY, anchor = { x: 0, y: 0 } } = config;

  const fw = W * pitchX;
  const fh = H * pitchY;

  // Phase: which column/row within a field the anchor die occupies.
  const phaseX = ((anchor.x % W) + W) % W;
  const phaseY = ((anchor.y % H) + H) % H;

  // Range of integer k values whose reticle could touch the wafer circle.
  const range = wafer.radius + Math.max(fw, fh);
  const kMinX = Math.ceil((-range + phaseX * pitchX) / fw);
  const kMaxX = Math.floor(( range + phaseX * pitchX) / fw);
  const kMinY = Math.ceil((-range + phaseY * pitchY) / fh);
  const kMaxY = Math.floor(( range + phaseY * pitchY) / fh);

  const reticles: Reticle[] = [];

  for (let l = kMinY; l <= kMaxY; l++) {
    const j0 = l * H - phaseY;
    const cy  = wafer.center.y + (j0 + (H - 1) / 2) * pitchY;

    for (let k = kMinX; k <= kMaxX; k++) {
      const i0 = k * W - phaseX;
      const cx  = wafer.center.x + (i0 + (W - 1) / 2) * pitchX;

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
