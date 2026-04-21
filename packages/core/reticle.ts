import type { Wafer } from './wafer.js';

export interface ReticleConfig {
  width: number;
  height: number;
  stepX: number;
  stepY: number;
  offset?: { x: number; y: number };
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
 */
export function generateReticleGrid(wafer: Wafer, config: ReticleConfig): Reticle[] {
  const { width, height, stepX, stepY, offset = { x: 0, y: 0 } } = config;
  const range = wafer.radius + Math.max(width, height);
  const reticles: Reticle[] = [];

  for (let ry = -range + offset.y; ry <= range; ry += stepY) {
    for (let rx = -range + offset.x; rx <= range; rx += stepX) {
      // Closest point on this rectangle to the wafer centre (0,0 in local frame)
      const closestX = Math.max(rx - width / 2, Math.min(0, rx + width / 2));
      const closestY = Math.max(ry - height / 2, Math.min(0, ry + height / 2));
      if (closestX * closestX + closestY * closestY <= wafer.radius * wafer.radius) {
        reticles.push({ x: wafer.center.x + rx, y: wafer.center.y + ry, width, height });
      }
    }
  }

  return reticles;
}
