import type { Die } from '../core/dies.js';
import type { WaferFlat } from '../core/wafer.js';
import type { WaferMetadata } from '../core/metadata.js';
import type { Wafer } from '../core/wafer.js';
import { createWafer } from '../core/wafer.js';
import { generateDies } from '../core/dies.js';
import { clipDiesToWafer, applyOrientation } from '../core/transforms.js';
import { inferWaferFromXY } from '../core/inference/wafer.js';
import { inferDiePitch } from '../core/inference/pitch.js';
import { inferGrid } from '../core/inference/grid.js';
import { buildScene, type Scene, type BuildSceneOptions } from './buildScene.js';

// ── Public input types ────────────────────────────────────────────────────────

/** A single data point.  Supply whatever fields you have; the rest are inferred. */
export interface WaferMapPoint {
  x: number;
  y: number;
  value?: number;
  bin?: number;
  /** Pre-computed grid column index.  When provided for all points, skips grid inference. */
  i?: number;
  /** Pre-computed grid row index.  When provided for all points, skips grid inference. */
  j?: number;
}

/** Wafer geometry parameters — all optional; any omitted fields are inferred. */
export interface WaferOptions {
  diameter?: number;
  center?: { x: number; y: number };
  flat?: WaferFlat;
  /** Degrees, default 0. */
  orientation?: number;
  metadata?: WaferMetadata;
}

/** Die geometry parameters — all optional; any omitted fields are inferred. */
export interface DieOptions {
  width?: number;
  height?: number;
  /** Grid pitch in X.  Defaults to `width` when omitted. */
  pitchX?: number;
  /** Grid pitch in Y.  Defaults to `height` when omitted. */
  pitchY?: number;
}

/** Input accepted by {@link buildWaferMap}.  All fields are optional. */
export interface WaferMapInput {
  data?: WaferMapPoint[];
  wafer?: WaferOptions;
  die?: DieOptions;
  /** Pre-built die array.  When supplied, geometry generation is skipped. */
  dies?: Die[];
}

/** Options forwarded to {@link buildScene} plus a debug flag. */
export interface WaferMapOptions extends BuildSceneOptions {
  debug?: boolean;
}

// ── Output types ──────────────────────────────────────────────────────────────

export interface WaferMapResult {
  wafer: Wafer;
  dies: Die[];
  scene: Scene;
  inference: {
    wafer: { confidence: number; method: string };
    diePitch: { confidence: number };
    grid: { confidence: number };
  };
}

// ── Internal helpers ──────────────────────────────────────────────────────────

interface Normalized {
  data: WaferMapPoint[];
  waferOpts: WaferOptions | undefined;
  dieOpts: DieOptions | undefined;
  explicitDies: Die[] | undefined;
}

function normalizeInput(input: WaferMapPoint[] | WaferMapInput): Normalized {
  if (Array.isArray(input)) {
    return { data: input, waferOpts: undefined, dieOpts: undefined, explicitDies: undefined };
  }
  return {
    data: input.data ?? [],
    waferOpts: input.wafer,
    dieOpts: input.die,
    explicitDies: input.dies,
  };
}

function resolvePitch(
  dieOpts: DieOptions | undefined,
  points: Array<{ x: number; y: number }>,
  inferenceOut: { diePitch: { confidence: number } },
): { pitchX: number; pitchY: number } {
  const userX = dieOpts?.pitchX ?? dieOpts?.width;
  const userY = dieOpts?.pitchY ?? dieOpts?.height;

  if (userX !== undefined && userY !== undefined) {
    return { pitchX: userX, pitchY: userY };
  }

  const pi = inferDiePitch(points);
  inferenceOut.diePitch = { confidence: pi.confidence };

  return {
    pitchX: userX ?? pi.pitchX,
    pitchY: userY ?? pi.pitchY,
  };
}

// ── Main entry point ──────────────────────────────────────────────────────────

/**
 * Build a complete wafer map from any level of input.
 *
 * Pass what you have — an array of XY data points, a partially specified
 * wafer config, pre-built dies, or any combination.  The function infers
 * whatever is missing and returns a fully rendered scene ready for Plotly.
 *
 * @example Minimal — XY values only:
 * ```ts
 * const result = buildWaferMap([
 *   { x: 10, y: 20, value: 0.95 },
 *   { x: 20, y: 20, value: 0.87 },
 * ]);
 * const { data, layout } = toPlotly(result.scene);
 * Plotly.react('chart', data, layout);
 * ```
 *
 * @example With partial geometry hints:
 * ```ts
 * const result = buildWaferMap({
 *   data,
 *   wafer: { diameter: 300, orientation: 90 },
 *   die:   { width: 10, height: 10 },
 * });
 * ```
 *
 * @example Fully specified (pre-built dies):
 * ```ts
 * const result = buildWaferMap({ wafer, dies });
 * ```
 */
export function buildWaferMap(
  input: WaferMapPoint[] | WaferMapInput,
  options?: WaferMapOptions,
): WaferMapResult {
  const norm = normalizeInput(input);
  const { debug: _debug, ...sceneOpts } = options ?? {};

  const inference = {
    wafer: { confidence: 1.0, method: 'provided' },
    diePitch: { confidence: 1.0 },
    grid: { confidence: 1.0 },
  };

  const points = norm.data.map(d => ({ x: d.x, y: d.y }));

  // ── Step 1: Resolve wafer ──────────────────────────────────────────────────

  let waferDiameter = norm.waferOpts?.diameter;
  let waferCenter = norm.waferOpts?.center;

  if (waferDiameter === undefined) {
    const src = norm.explicitDies?.length
      ? norm.explicitDies.map(d => ({ x: d.x, y: d.y }))
      : points;

    if (src.length > 0) {
      const wi = inferWaferFromXY(src);
      waferDiameter = wi.diameter;
      if (waferCenter === undefined) waferCenter = wi.center;
      inference.wafer = { confidence: wi.confidence, method: wi.method };
    } else {
      waferDiameter = 300;
      inference.wafer = { confidence: 0, method: 'default' };
    }
  }

  waferCenter ??= { x: 0, y: 0 };

  let wafer = createWafer({
    diameter: waferDiameter,
    center: waferCenter,
    flat: norm.waferOpts?.flat,
    orientation: norm.waferOpts?.orientation ?? 0,
    metadata: norm.waferOpts?.metadata,
  });

  // ── Step 2: Resolve dies ───────────────────────────────────────────────────

  let dies: Die[];

  if (norm.explicitDies) {
    // User supplied pre-built dies — use them directly.
    dies = norm.explicitDies;

    if (points.length > 0) {
      // Attach data by XY position match.
      const xyLookup = new Map(norm.data.map(d => [`${d.x},${d.y}`, d]));
      dies = dies.map(die => {
        const pt = xyLookup.get(`${die.x},${die.y}`);
        if (!pt) return die;
        return {
          ...die,
          ...(pt.value !== undefined ? { values: [pt.value] } : {}),
          ...(pt.bin !== undefined ? { bins: [pt.bin] } : {}),
        };
      });
    }
  } else if (points.length > 0) {
    // Derive die geometry, generate grid, attach data.
    const pitch = resolvePitch(norm.dieOpts, points, inference);
    const width = norm.dieOpts?.width ?? pitch.pitchX;
    const height = norm.dieOpts?.height ?? pitch.pitchY;
    const dieConfig = { width, height };

    // Build (i,j) → data lookup.
    const allHaveIJ = norm.data.length > 0 && norm.data.every(d => d.i !== undefined && d.j !== undefined);
    let ijLookup: Map<string, WaferMapPoint>;

    if (allHaveIJ) {
      ijLookup = new Map(norm.data.map(d => [`${d.i},${d.j}`, d]));
    } else {
      const gi = inferGrid(points, pitch, wafer.center);
      inference.grid = { confidence: gi.confidence };

      // Adopt corrected grid origin unless caller pinned the centre.
      if (!norm.waferOpts?.center) {
        wafer = { ...wafer, center: gi.center };
      }

      ijLookup = new Map();
      for (let k = 0; k < gi.indices.length; k++) {
        const { i, j } = gi.indices[k];
        ijLookup.set(`${i},${j}`, norm.data[k]);
      }
    }

    const allDies = generateDies(wafer, dieConfig);
    dies = clipDiesToWafer(allDies, wafer, dieConfig);

    dies = dies.map(die => {
      const pt = ijLookup.get(`${die.i},${die.j}`);
      if (!pt) return die;
      return {
        ...die,
        ...(pt.value !== undefined ? { values: [pt.value] } : {}),
        ...(pt.bin !== undefined ? { bins: [pt.bin] } : {}),
      };
    });
  } else {
    // No data — generate an empty clipped grid.
    const width = norm.dieOpts?.width ?? norm.dieOpts?.pitchX ?? 10;
    const height = norm.dieOpts?.height ?? norm.dieOpts?.pitchY ?? 10;
    const dieConfig = { width, height };
    const allDies = generateDies(wafer, dieConfig);
    dies = clipDiesToWafer(allDies, wafer, dieConfig);
  }

  // ── Step 3: Orientation + scene ────────────────────────────────────────────

  dies = applyOrientation(dies, wafer);

  // Auto-detect plot mode if not explicitly set.
  const plotMode =
    sceneOpts.plotMode ??
    (norm.data.some(d => d.value !== undefined) ? 'value' : 'hardbin');

  const scene = buildScene(wafer, dies, [], { ...sceneOpts, plotMode });

  return { wafer, dies, scene, inference };
}
