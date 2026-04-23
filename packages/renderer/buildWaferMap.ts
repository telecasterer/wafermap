import type { Die } from '../core/dies.js';
import type { WaferMetadata } from '../core/metadata.js';
import type { Wafer } from '../core/wafer.js';
import type { Reticle } from '../core/reticle.js';
import { createWafer } from '../core/wafer.js';
import { generateDies } from '../core/dies.js';
import { clipDiesToWafer, applyOrientation, transformDies } from '../core/transforms.js';
import { inferWaferFromXY } from '../core/inference/wafer.js';
import { resolveGridPitch } from '../core/inference/pitch.js';
import { assignGridIndices } from '../core/inference/grid.js';
import { generateReticleGrid } from '../core/reticle.js';
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
  /**
   * Orientation mark direction.  Standard dimensions are derived automatically
   * from the wafer diameter:
   * - ≤ 100 mm → 32.5 mm orientation flat (SEMI M1)
   * - ≤ 150 mm → 57.5 mm orientation flat (SEMI M1)
   * - > 150 mm → V-notch (~3.5 mm wide, 1.25 mm deep — SEMI M1)
   */
  notch?: { type: 'top' | 'bottom' | 'left' | 'right' };
  /** Degrees, default 0. */
  orientation?: number;
  metadata?: WaferMetadata;
  /**
   * Physical edge exclusion zone in mm measured from the wafer edge inward.
   * Dies whose centres fall inside this band are rendered dimmed and marked
   * `edgeExcluded: true` on the returned Die objects.
   */
  edgeExclusion?: number;
}

/**
 * Die geometry parameters — all optional.
 * When omitted, dimensions are estimated from the grid layout.
 */
export interface DieOptions {
  /** Die width in mm (= X pitch). */
  width?: number;
  /** Die height in mm (= Y pitch). */
  height?: number;
  /**
   * Grid origin convention used by the prober.
   *
   * - `'center'`  (default) — origin already near (0,0); centroid offset applied.
   * - `'LL'`      — (0,0) at lower-left; positive x right, positive y up.
   * - `'UL'`      — (0,0) at upper-left; positive x right, positive y **down**.
   * - `'LR'`      — (0,0) at lower-right; positive x **left**, positive y up.
   * - `'UR'`      — (0,0) at upper-right; positive x left, positive y down.
   * - `'custom'`  — apply explicit `offset` (in grid steps) to centre the grid.
   *
   * Auto-detected as `'LL'` when all input coordinates are ≥ 0 (standard STDF/KLA output).
   */
  origin?: {
    type: 'center' | 'LL' | 'UL' | 'LR' | 'UR' | 'custom';
    /** Grid-step offset to the true origin.  Used only when type is `'custom'`. */
    offset?: { x: number; y: number };
  };
  /**
   * Direction in which the prober Y axis increases.
   * `'up'` (default) is standard Cartesian; `'down'` is row/matrix convention
   * (row 1 at top).  The library flips the display Y axis so the map renders
   * with +Y pointing up regardless of the prober convention.
   */
  yAxisDirection?: 'up' | 'down';
  /**
   * Direction in which the prober X axis increases.
   * `'right'` (default) is standard; `'left'` is used for backside probing or
   * mirrored coordinate systems.
   */
  xAxisDirection?: 'right' | 'left';
}

/** Input accepted by {@link buildWaferMap}.  All fields are optional. */
export interface WaferMapInput {
  data?: WaferMapPoint[];
  wafer?: WaferOptions;
  die?: DieOptions;
  /** Pre-built die array.  When supplied, geometry generation is skipped. */
  dies?: Die[];
  /**
   * Reticle (stepper field) overlay.  Dimensions are in die counts; `anchor`
   * pins a specific die index to the reticle's internal (0,0) corner.
   * When provided, `showReticle` defaults to `true` in the scene options.
   */
  reticle?: {
    /** Field width in number of dies. */
    width: number;
    /** Field height in number of dies. */
    height: number;
    /**
     * Die index (i, j) that sits at the reticle field's internal (0,0) corner.
     * Controls the phase (alignment) of the reticle grid.
     * Defaults to `{x: 0, y: 0}`.
     */
    anchor?: { x: number; y: number };
  };
  /**
   * Multi-wafer stacking — collapse data from several wafers into a single map.
   * The aggregated result is used as the `data` for this map; any top-level
   * `data` field is ignored when `stack` is present.
   */
  stack?: {
    /** One `WaferMapPoint[]` per wafer. */
    data: WaferMapPoint[][];
    /** Aggregation method applied per die position across all wafers. */
    aggr: 'mean' | 'median' | 'stddev' | 'count_bin' | 'mode' | 'percent';
    /** Required when `aggr` is `'count_bin'` or `'percent'`. */
    targetBin?: number;
  };
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
   * Coordinate space of `die.x` / `die.y` and wafer dimensions:
   * - **'mm'**         — at least one physical dimension was provided or could
   *                      be inferred; all spatial values are in real millimetres.
   * - **'normalised'** — only grid positions were supplied; coordinates are
   *                      proportionally correct but not in physical mm.
   */
  units: 'mm' | 'normalised';
  inference: {
    wafer:    { confidence: number; method: string };
    diePitch: { confidence: number; units: 'mm' | 'normalised' };
    grid:     { confidence: number };
  };
  /** Die population statistics. */
  dataCoverage: {
    /** Dies inside the wafer boundary that have at least one value or bin. */
    filledDies: number;
    /** Total dies inside the wafer boundary. */
    totalDies: number;
    /** `filledDies / totalDies` in [0, 1]. */
    ratio: number;
  };
}

// ── Internal normalised model ─────────────────────────────────────────────────

interface Normalized {
  data:         WaferMapPoint[];
  waferOpts:    WaferOptions | undefined;
  dieOpts:      DieOptions   | undefined;
  explicitDies: Die[]        | undefined;
  reticleOpts:  WaferMapInput['reticle'] | undefined;
  stackOpts:    WaferMapInput['stack']   | undefined;
}

function normalizeInput(input: WaferMapPoint[] | WaferMapInput): Normalized {
  if (Array.isArray(input)) {
    return {
      data: input,
      waferOpts:    undefined,
      dieOpts:      undefined,
      explicitDies: undefined,
      reticleOpts:  undefined,
      stackOpts:    undefined,
    };
  }
  return {
    data:         input.data  ?? [],
    waferOpts:    input.wafer,
    dieOpts:      input.die,
    explicitDies: input.dies,
    reticleOpts:  input.reticle,
    stackOpts:    input.stack,
  };
}

// ── Notch helper ──────────────────────────────────────────────────────────────

/** Pass the user-supplied notch option through to createWafer unchanged.
 *  createWafer derives the standard length from the wafer diameter. */
function resolveNotch(
  waferOpts: WaferOptions | undefined,
): { type: 'top' | 'bottom' | 'left' | 'right' } | undefined {
  return waferOpts?.notch;
}

// ── Grid origin & axis helpers ────────────────────────────────────────────────

/**
 * Detect the grid origin convention.
 * When not explicitly specified, auto-detects `'LL'` if all coordinates are ≥ 0
 * (standard output from STDF / KLA Surfscan equipment).
 */
function detectOrigin(
  data: WaferMapPoint[],
  dieOpts: DieOptions | undefined,
): NonNullable<DieOptions['origin']> {
  if (dieOpts?.origin) return dieOpts.origin;
  if (data.length > 0 && data.every(p => p.x >= 0 && p.y >= 0)) {
    return { type: 'LL' };
  }
  return { type: 'center' };
}

/**
 * Compute the integer grid offset that maps prober-step coordinates to a
 * grid centred at the wafer physical origin (0,0).
 *
 * - `custom`  → user-supplied offset.
 * - `LL/UL/LR/UR` → bounding-box centre (exact symmetry for regular grids).
 * - `center`  → centroid from `assignGridIndices` (current default behaviour).
 */
function resolveGridOriginOffset(
  gridPoints: Array<{ x: number; y: number }>,
  origin: NonNullable<DieOptions['origin']>,
  ga: { offsetX: number; offsetY: number },
): { offsetX: number; offsetY: number } {
  if (origin.type === 'custom' && origin.offset) {
    return { offsetX: origin.offset.x, offsetY: origin.offset.y };
  }
  if (origin.type !== 'center') {
    const xs = gridPoints.map(p => p.x);
    const ys = gridPoints.map(p => p.y);
    return {
      offsetX: Math.round((Math.max(...xs) + Math.min(...xs)) / 2),
      offsetY: Math.round((Math.max(...ys) + Math.min(...ys)) / 2),
    };
  }
  return { offsetX: ga.offsetX, offsetY: ga.offsetY };
}

/**
 * Derive display-axis flip flags from the origin convention and any explicit
 * axis-direction settings.  Flips are applied only to display coordinates
 * (die.x / die.y); grid indices (i, j) are never modified.
 */
function resolveAxisFlips(
  dieOpts: DieOptions | undefined,
  origin: NonNullable<DieOptions['origin']>,
): { flipX: boolean; flipY: boolean } {
  let flipX = dieOpts?.xAxisDirection === 'left';
  let flipY = dieOpts?.yAxisDirection === 'down';

  // Corner-based origins imply axis direction:
  // UL / UR → y increases downward in prober coords → flip display Y so +Y is up.
  // LR / UR → x increases leftward → flip display X.
  if (origin.type === 'UL' || origin.type === 'UR') flipY = true;
  if (origin.type === 'LR' || origin.type === 'UR') flipX = true;

  return { flipX, flipY };
}

// ── Stack aggregation ─────────────────────────────────────────────────────────

function modeOf(values: number[]): number | null {
  if (!values.length) return null;
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let maxCount = 0;
  let result = values[0];
  for (const [v, count] of counts) {
    if (count > maxCount) { maxCount = count; result = v; }
  }
  return result;
}

function medianOf(sorted: number[]): number {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Collapse multi-wafer stack data into a single `WaferMapPoint[]` using the
 * requested aggregation.  The result is used directly as map data.
 */
function collapseStackData(
  stack: NonNullable<WaferMapInput['stack']>,
): WaferMapPoint[] {
  const { data: waferData, aggr, targetBin } = stack;
  const totalWafers = waferData.length;

  const grouped = new Map<string, WaferMapPoint[]>();
  for (const waferPoints of waferData) {
    for (const pt of waferPoints) {
      const key = `${pt.x},${pt.y}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(pt);
    }
  }

  const result: WaferMapPoint[] = [];

  for (const [key, points] of grouped) {
    const parts = key.split(',');
    const x = Number(parts[0]);
    const y = Number(parts[1]);

    if (aggr === 'count_bin' && targetBin !== undefined) {
      result.push({ x, y, value: points.filter(p => p.bin === targetBin).length });

    } else if (aggr === 'percent' && targetBin !== undefined) {
      result.push({
        x, y,
        value: (points.filter(p => p.bin === targetBin).length / totalWafers) * 100,
      });

    } else if (aggr === 'mean') {
      const vals = points.map(p => p.value).filter((v): v is number => v !== undefined);
      if (vals.length) result.push({ x, y, value: vals.reduce((a, b) => a + b, 0) / vals.length });

    } else if (aggr === 'median') {
      const vals = points
        .map(p => p.value)
        .filter((v): v is number => v !== undefined)
        .sort((a, b) => a - b);
      if (vals.length) result.push({ x, y, value: medianOf(vals) });

    } else if (aggr === 'stddev') {
      const vals = points.map(p => p.value).filter((v): v is number => v !== undefined);
      if (vals.length > 1) {
        const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
        const variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / (vals.length - 1);
        result.push({ x, y, value: Math.sqrt(variance) });
      }

    } else if (aggr === 'mode') {
      const bins = points.map(p => p.bin).filter((b): b is number => b !== undefined);
      const m = modeOf(bins);
      if (m !== null) result.push({ x, y, bin: m });
    }
  }

  return result;
}

// ── Coverage ──────────────────────────────────────────────────────────────────

function computeCoverage(dies: Die[]): WaferMapResult['dataCoverage'] {
  const totalDies = dies.length;
  const filledDies = dies.filter(
    d => (d.values?.length ?? 0) > 0 || (d.bins?.length ?? 0) > 0,
  ).length;
  return {
    filledDies,
    totalDies,
    ratio: totalDies > 0 ? filledDies / totalDies : 0,
  };
}

// ── Reticle builder ───────────────────────────────────────────────────────────

function buildReticles(
  reticleOpts: WaferMapInput['reticle'],
  wafer: Wafer,
  pitchX: number,
  pitchY: number,
): Reticle[] {
  if (!reticleOpts) return [];
  return generateReticleGrid(wafer, {
    width:  reticleOpts.width,
    height: reticleOpts.height,
    pitchX,
    pitchY,
    anchor: reticleOpts.anchor ?? { x: 0, y: 0 },
  });
}

// ── Edge exclusion ────────────────────────────────────────────────────────────

function applyEdgeExclusion(dies: Die[], wafer: Wafer, exclusionMm: number): Die[] {
  const innerRadiusSq = (wafer.radius - exclusionMm) ** 2;
  return dies.map(die => {
    const dx = die.x - wafer.center.x;
    const dy = die.y - wafer.center.y;
    return dx * dx + dy * dy > innerRadiusSq ? { ...die, edgeExcluded: true } : die;
  });
}

// ── Internal helpers ──────────────────────────────────────────────────────────

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
 * @example Reticle overlay phased to die (2,1):
 * ```ts
 * const result = buildWaferMap({
 *   data,
 *   die: { width: 10, height: 10 },
 *   reticle: { width: 4, height: 2, anchor: { x: 2, y: 1 } },
 * });
 * ```
 *
 * @example Aggregate bin failures across six wafers:
 * ```ts
 * const result = buildWaferMap({
 *   wafer: { diameter: 300 },
 *   die:   { width: 10, height: 10 },
 *   stack: { data: [wafer1, wafer2, wafer3, wafer4, wafer5, wafer6],
 *            aggr: 'count_bin', targetBin: 2 },
 * });
 * ```
 */
export function buildWaferMap(
  input: WaferMapPoint[] | WaferMapInput,
  options?: WaferMapOptions,
): WaferMapResult {
  const norm = normalizeInput(input);
  const { debug: _debug, ...sceneOpts } = options ?? {};

  // Collapse multi-wafer stack first so the rest of the pipeline sees a normal
  // WaferMapPoint[] regardless of how the data arrived.
  const data: WaferMapPoint[] = norm.stackOpts
    ? collapseStackData(norm.stackOpts)
    : norm.data;

  const inference = {
    wafer:    { confidence: 1.0, method: 'provided' },
    diePitch: { confidence: 1.0, units: 'mm' as 'mm' | 'normalised' },
    grid:     { confidence: 1.0 },
  };

  // ── Explicit dies path ─────────────────────────────────────────────────────
  // Pre-built dies are used as-is; data points are matched by die.(i,j) directly.

  if (norm.explicitDies) {
    let dies = norm.explicitDies;

    if (data.length > 0) {
      const lookup = new Map(data.map(d => [`${d.x},${d.y}`, d]));
      dies = dies.map(die => {
        const pt = lookup.get(`${die.i},${die.j}`);
        return pt ? attachData(die, pt) : die;
      });
    }

    const diameter = norm.waferOpts?.diameter ?? 300;
    const wafer    = createWafer({
      diameter,
      notch:       resolveNotch(norm.waferOpts),
      orientation: norm.waferOpts?.orientation ?? 0,
      metadata:    norm.waferOpts?.metadata,
    });

    const reticles    = buildReticles(norm.reticleOpts, wafer, 1, 1);
    const showReticle = sceneOpts.showReticle ?? (norm.reticleOpts !== undefined);

    const scene = buildScene(wafer, dies, reticles, {
      ...sceneOpts,
      showReticle,
      plotMode: autoPlotMode(data, sceneOpts),
    });

    return { wafer, dies, scene, units: 'mm', inference, dataCoverage: computeCoverage(dies) };
  }

  // ── Grid-position path ─────────────────────────────────────────────────────

  const gridPoints = data.map(d => ({ x: d.x, y: d.y }));

  // Step 1: Resolve pitch — mm or normalised depending on available context.
  const pitchResult = resolveGridPitch(
    gridPoints,
    norm.dieOpts,
    norm.waferOpts?.diameter,
  );
  inference.diePitch = { confidence: pitchResult.confidence, units: pitchResult.units };
  const { pitchX, pitchY } = pitchResult;
  const units = pitchResult.units;

  // Step 2: Resolve grid origin and centring offset.
  const origin      = detectOrigin(data, norm.dieOpts);
  const ga          = assignGridIndices(gridPoints);
  inference.grid    = { confidence: ga.confidence };
  const { offsetX, offsetY } = resolveGridOriginOffset(gridPoints, origin, ga);

  // Step 3: Determine display-axis flips (applied later to x/y only; i/j unchanged).
  const { flipX, flipY } = resolveAxisFlips(norm.dieOpts, origin);

  // Step 4: Infer wafer diameter when not provided.
  let waferDiameter = norm.waferOpts?.diameter;

  if (waferDiameter === undefined) {
    if (ga.indices.length > 0) {
      const physPoints = ga.indices.map(({ i, j }) => ({ x: i * pitchX, y: j * pitchY }));
      const wi = inferWaferFromXY(physPoints);
      waferDiameter = wi.diameter;
      inference.wafer = { confidence: wi.confidence, method: wi.method };
    } else {
      waferDiameter = units === 'mm' ? 300 : 30;
      inference.wafer = { confidence: 0, method: 'default' };
    }
  }

  const wafer = createWafer({
    diameter:    waferDiameter,
    notch:       resolveNotch(norm.waferOpts),
    orientation: norm.waferOpts?.orientation ?? 0,
    metadata:    norm.waferOpts?.metadata,
  });

  // Step 5: Generate and clip the full die grid.
  const dieConfig = { width: pitchX, height: pitchY };
  const allDies   = generateDies(wafer, dieConfig);
  let dies        = clipDiesToWafer(allDies, wafer, dieConfig);

  // Step 6: Attach data.
  // die.i = origX − offsetX, so origX = die.i + offsetX.
  // For centred grids (offsetX = 0), die.i === original prober x directly.
  if (data.length > 0) {
    const lookup = new Map(data.map(d => [`${d.x},${d.y}`, d]));
    dies = dies.map(die => {
      const pt = lookup.get(`${die.i + offsetX},${die.j + offsetY}`);
      return pt ? attachData(die, pt) : die;
    });
  }

  // Step 7: Apply wafer orientation rotation.
  dies = applyOrientation(dies, wafer);

  // Step 8: Apply display-axis polarity corrections.
  // These flip die.x / die.y only; die.i / die.j remain as prober indices so
  // post-enrichment lookups keyed on (i, j) continue to work correctly.
  if (flipX || flipY) {
    dies = transformDies(dies, { flipX, flipY }, wafer.center);
  }

  // Step 9: Mark edge-excluded dies.
  if (norm.waferOpts?.edgeExclusion && norm.waferOpts.edgeExclusion > 0) {
    dies = applyEdgeExclusion(dies, wafer, norm.waferOpts.edgeExclusion);
  }

  // Step 10: Build reticle overlays and scene.
  const reticles    = buildReticles(norm.reticleOpts, wafer, pitchX, pitchY);
  const showReticle = sceneOpts.showReticle ?? (norm.reticleOpts !== undefined);

  const scene = buildScene(wafer, dies, reticles, {
    ...sceneOpts,
    showReticle,
    plotMode: autoPlotMode(data, sceneOpts),
  });

  return { wafer, dies, scene, units, inference, dataCoverage: computeCoverage(dies) };
}
