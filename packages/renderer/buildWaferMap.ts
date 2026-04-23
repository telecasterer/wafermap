import type { Die } from '../core/dies.js';
import type { WaferFlat } from '../core/wafer.js';
import type { WaferMetadata } from '../core/metadata.js';
import type { Wafer } from '../core/wafer.js';
import { createWafer } from '../core/wafer.js';
import { generateDies } from '../core/dies.js';
import { clipDiesToWafer, applyOrientation } from '../core/transforms.js';
import { inferWaferFromXY } from '../core/inference/wafer.js';
import { resolveGridPitch } from '../core/inference/pitch.js';
import { assignGridIndices } from '../core/inference/grid.js';
import { buildScene, type Scene, type BuildSceneOptions, type PlotMode } from './buildScene.js';

// ── Public input types ────────────────────────────────────────────────────────

/**
 * A single data point from wafer test equipment.
 * x and y are **die grid positions** (prober step coordinates) — integers
 * such as −7, 0, 5.  They are NOT millimetre values.
 */
export interface WaferMapPoint {
  /** Die grid X position (prober step coordinate). */
  x: number;
  /** Die grid Y position (prober step coordinate). */
  y: number;
  value?: number;
  bin?: number;
}

/** Wafer geometry parameters — all optional; any omitted fields are inferred. */
export interface WaferOptions {
  /** Wafer diameter in mm.  Inferred from grid extent × pitch when omitted. */
  diameter?: number;
  flat?: WaferFlat;
  /** Degrees, default 0. */
  orientation?: number;
  metadata?: WaferMetadata;
}

/**
 * Die geometry parameters — both in mm, both optional.
 * When omitted, dimensions are estimated from the grid layout using the
 * circular-wafer constraint (see {@link resolveGridPitch}).
 */
export interface DieOptions {
  /** Die width in mm (= X pitch). */
  width?: number;
  /** Die height in mm (= Y pitch). */
  height?: number;
}

/** Input accepted by {@link buildWaferMap}.  All fields are optional. */
export interface WaferMapInput {
  data?: WaferMapPoint[];
  wafer?: WaferOptions;
  die?: DieOptions;
  /** Pre-built die array.  When supplied, geometry generation is skipped. */
  dies?: Die[];
}

/** Options forwarded to {@link buildScene}. */
export interface WaferMapOptions extends BuildSceneOptions {
  debug?: boolean;
}

// ── Output types ──────────────────────────────────────────────────────────────

export interface WaferMapResult {
  wafer: Wafer;
  dies: Die[];
  scene: Scene;
  /**
   * Coordinate space of Die.x / Die.y and wafer dimensions:
   * - **'mm'**         — at least one physical dimension was provided (or could
   *                      be inferred from wafer diameter / die size); all spatial
   *                      values are in real-world millimetres.
   * - **'normalised'** — only grid positions were supplied; coordinates are
   *                      proportionally correct (aspect ratio preserved) but are
   *                      not in physical mm.  pitchX = 1 unit by convention.
   */
  units: 'mm' | 'normalised';
  inference: {
    wafer:    { confidence: number; method: string };
    diePitch: { confidence: number; units: 'mm' | 'normalised' };
    grid:     { confidence: number };
  };
}

// ── Internal helpers ──────────────────────────────────────────────────────────

interface Normalized {
  data:         WaferMapPoint[];
  waferOpts:    WaferOptions | undefined;
  dieOpts:      DieOptions   | undefined;
  explicitDies: Die[]        | undefined;
}

function normalizeInput(input: WaferMapPoint[] | WaferMapInput): Normalized {
  if (Array.isArray(input)) {
    return { data: input, waferOpts: undefined, dieOpts: undefined, explicitDies: undefined };
  }
  return {
    data:         input.data  ?? [],
    waferOpts:    input.wafer,
    dieOpts:      input.die,
    explicitDies: input.dies,
  };
}

function attachData(die: Die, pt: WaferMapPoint): Die {
  return {
    ...die,
    ...(pt.value !== undefined ? { values: [pt.value] } : {}),
    ...(pt.bin   !== undefined ? { bins:   [pt.bin]   } : {}),
  };
}

function autoPlotMode(data: WaferMapPoint[], opts: BuildSceneOptions): PlotMode {
  return opts.plotMode ?? (data.some(d => d.value !== undefined) ? 'value' : 'hardbin');
}

// ── Main entry point ──────────────────────────────────────────────────────────

/**
 * Build a complete wafer map from any level of input.
 *
 * `x` and `y` in each data point are **die grid positions** (prober step
 * coordinates — integers like −7, 0, 5), not millimetre values.  Supply
 * whatever geometry you have; the library infers the rest.
 *
 * @example Minimal — grid positions + values only (all geometry inferred):
 * ```ts
 * const result = buildWaferMap([
 *   { x:  0, y:  0, value: 0.95 },
 *   { x:  1, y:  0, value: 0.87 },
 *   { x:  0, y: -1, value: 0.91 },
 * ]);
 * const { data, layout } = toPlotly(result.scene);
 * Plotly.react('chart', data, layout);
 * ```
 *
 * @example With die size (recommended — enables mm coordinates):
 * ```ts
 * const result = buildWaferMap({
 *   data,
 *   wafer: { diameter: 300, orientation: 90 },
 *   die:   { width: 10, height: 10 },
 * });
 * ```
 *
 * @example Post-enrich for multiple test channels:
 * ```ts
 * const result = buildWaferMap({ data: primaryData, wafer, die });
 * const rowMap = new Map(rows.map(r => [`${r.x},${r.y}`, r]));
 * const dies = result.dies.map(d => {
 *   const row = rowMap.get(`${d.i},${d.j}`);  // d.i === original x for centred grids
 *   if (!row) return d;
 *   return { ...d, values: [+row.testA, +row.testB], bins: [+row.hbin, +row.sbin] };
 * });
 * ```
 */
export function buildWaferMap(
  input: WaferMapPoint[] | WaferMapInput,
  options?: WaferMapOptions,
): WaferMapResult {
  const norm = normalizeInput(input);
  const { debug: _debug, ...sceneOpts } = options ?? {};

  const inference = {
    wafer:    { confidence: 1.0, method: 'provided' },
    diePitch: { confidence: 1.0, units: 'mm' as 'mm' | 'normalised' },
    grid:     { confidence: 1.0 },
  };

  // ── Explicit dies path ─────────────────────────────────────────────────────
  // Pre-built dies are used as-is; data points are matched by die.i,j directly.

  if (norm.explicitDies) {
    let dies = norm.explicitDies;

    if (norm.data.length > 0) {
      const lookup = new Map(norm.data.map(d => [`${d.x},${d.y}`, d]));
      dies = dies.map(die => {
        const pt = lookup.get(`${die.i},${die.j}`);
        return pt ? attachData(die, pt) : die;
      });
    }

    const diameter = norm.waferOpts?.diameter ?? 300;
    const wafer = createWafer({
      diameter,
      flat:        norm.waferOpts?.flat,
      orientation: norm.waferOpts?.orientation ?? 0,
      metadata:    norm.waferOpts?.metadata,
    });

    const scene = buildScene(wafer, dies, [], {
      ...sceneOpts,
      plotMode: autoPlotMode(norm.data, sceneOpts),
    });

    return { wafer, dies, scene, units: 'mm', inference };
  }

  // ── Grid-position path ─────────────────────────────────────────────────────

  const gridPoints = norm.data.map(d => ({ x: d.x, y: d.y }));

  // Step 1: Resolve pitch — mm or normalised depending on available context.
  const pitchResult = resolveGridPitch(
    gridPoints,
    norm.dieOpts,
    norm.waferOpts?.diameter,
  );
  inference.diePitch = { confidence: pitchResult.confidence, units: pitchResult.units };
  const { pitchX, pitchY } = pitchResult;
  const units = pitchResult.units;

  // Step 2: Compute grid offset (integer centroid) so the generated grid is
  // centred at the wafer's physical origin (0,0).
  const ga = assignGridIndices(gridPoints);
  inference.grid = { confidence: ga.confidence };
  const { offsetX, offsetY } = ga;

  // Step 3: Infer wafer diameter when not provided.
  // Convert grid indices to physical positions for the inference function.
  let waferDiameter = norm.waferOpts?.diameter;

  if (waferDiameter === undefined) {
    if (ga.indices.length > 0) {
      const physPoints = ga.indices.map(({ i, j }) => ({ x: i * pitchX, y: j * pitchY }));
      const wi = inferWaferFromXY(physPoints);
      waferDiameter = wi.diameter;
      inference.wafer = { confidence: wi.confidence, method: wi.method };
    } else {
      // No data — use a sensible default.
      waferDiameter = units === 'mm' ? 300 : 30;
      inference.wafer = { confidence: 0, method: 'default' };
    }
  }

  const wafer = createWafer({
    diameter:    waferDiameter,
    flat:        norm.waferOpts?.flat,
    orientation: norm.waferOpts?.orientation ?? 0,
    metadata:    norm.waferOpts?.metadata,
  });

  // Step 4: Generate and clip the full die grid.
  const dieConfig = { width: pitchX, height: pitchY };
  const allDies   = generateDies(wafer, dieConfig);
  let dies        = clipDiesToWafer(allDies, wafer, dieConfig);

  // Step 5: Attach data.
  // die.i = origX − offsetX, so origX = die.i + offsetX.
  // For grids centred at (0,0) (offsetX = 0), die.i === original x directly.
  if (norm.data.length > 0) {
    const lookup = new Map(norm.data.map(d => [`${d.x},${d.y}`, d]));
    dies = dies.map(die => {
      const pt = lookup.get(`${die.i + offsetX},${die.j + offsetY}`);
      return pt ? attachData(die, pt) : die;
    });
  }

  // Step 6: Apply orientation and build scene.
  dies = applyOrientation(dies, wafer);

  const scene = buildScene(wafer, dies, [], {
    ...sceneOpts,
    plotMode: autoPlotMode(norm.data, sceneOpts),
  });

  return { wafer, dies, scene, units, inference };
}
