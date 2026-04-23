import type { Wafer } from './wafer.js';
import type { DieMetadata } from './metadata.js';

export interface DieConfig {
  width: number;   // mm
  height: number;  // mm
  gridSize?: number;
  offset?: { x: number; y: number };
}

export interface Die {
  id: string;
  i: number;
  j: number;
  x: number;           // display coordinate (mm)
  y: number;
  width: number;       // die size in mm — set by generateDies
  height: number;
  values?: number[];   // ordered test values (index 0 = primary)
  bins?: number[];     // ordered bin assignments (index 0 = primary)
  metadata?: DieMetadata;
  insideWafer?: boolean;
  partial?: boolean;     // true if die straddles the wafer boundary
  edgeExcluded?: boolean; // true if die centre falls within the edge exclusion zone
  probeIndex?: number;   // assigned by applyProbeSequence
}

/**
 * Generate a rectangular grid of dies centered on the wafer.
 * Each die carries its width/height for use by the renderer.
 */
export function generateDies(wafer: Wafer, dieConfig: DieConfig): Die[] {
  const { width, height, offset = { x: 0, y: 0 } } = dieConfig;
  const gridSize = dieConfig.gridSize ?? Math.ceil(wafer.radius / Math.min(width, height)) + 1;
  const dies: Die[] = [];

  for (let j = -gridSize; j <= gridSize; j++) {
    for (let i = -gridSize; i <= gridSize; i++) {
      const x = wafer.center.x + i * width + offset.x;
      const y = wafer.center.y + j * height + offset.y;
      dies.push({ id: `${i}_${j}`, i, j, x, y, width, height });
    }
  }

  return dies;
}
