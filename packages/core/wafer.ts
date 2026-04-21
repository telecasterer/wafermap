import type { WaferMetadata } from './metadata.js';

export interface WaferFlat {
  type: 'top' | 'bottom' | 'left' | 'right';
  length: number; // mm
}

export interface WaferConfig {
  diameter: number;
  center?: { x: number; y: number };
  flat?: WaferFlat;
  orientation?: number; // degrees
  metadata?: WaferMetadata;
}

export interface Wafer {
  diameter: number;
  radius: number;
  center: { x: number; y: number };
  flat?: WaferFlat;
  orientation: number;
  metadata?: WaferMetadata;
}

/** Create a wafer model from config. Defaults: center={0,0}, orientation=0. */
export function createWafer(config: WaferConfig): Wafer {
  return {
    diameter: config.diameter,
    radius: config.diameter / 2,
    center: config.center ?? { x: 0, y: 0 },
    flat: config.flat,
    orientation: config.orientation ?? 0,
    metadata: config.metadata,
  };
}
