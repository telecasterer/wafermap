# API Reference

This document describes the public API exposed by `wafermap`.

The public package surface is exported from:

- `wafermap`
- `wafermap/core`
- `wafermap/renderer`
- `wafermap/plotly-adapter`

---

## Coordinate system

**`x` and `y` throughout this API are die grid positions (prober step coordinates) — integers such as −7, 0, 5.  They are NOT millimetre values.**

This matches what wafer test equipment outputs.  The library converts grid positions to physical mm internally using the die size you provide.

```text
prober outputs:  x=-5, y=3   (die grid position)
library computes: x_mm = -5 × 10 = -50 mm   (given die width = 10 mm)
```

Physical mm positions appear only on the `Die` output objects (`die.x`, `die.y`) and in the wafer model.  You never need to compute or supply mm values.

---

## Quick Start

```ts
import { buildWaferMap, toPlotly } from 'wafermap';

// x,y are prober step positions (die grid indices), not mm.
const result = buildWaferMap([
  { x: 0,  y:  0, values: [0.95] },
  { x: 1,  y:  0, values: [0.87] },
  { x: -1, y:  1, values: [0.91] },
]);

const { data, layout } = toPlotly(result.scene);
Plotly.react('chart', data, layout);
```

---

## `buildWaferMap(input, options?)`

The primary entry point.  Pass whatever data you have — prober step positions,
optional geometry hints, or a pre-built die array.  The function infers whatever
is missing and returns a fully constructed scene.

```ts
import { buildWaferMap } from 'wafermap';
```

### Input

`buildWaferMap` accepts either an array of data points or an object:

```ts
// Array form — minimal
buildWaferMap(results: DieResult[])

// Object form — with optional geometry hints
buildWaferMap({
  results?:   DieResult[],      // per-die measurements from the prober
  waferConfig?:   WaferConfig,    // physical wafer geometry (diameter, notch, orientation…)
  dieConfig?:     DieConfig,      // die size and coordinate conventions
  dies?:          Die[],          // pre-built die array; skips geometry generation
  reticleConfig?: ReticleConfig,  // stepper field grid overlay
  lotStack?:  LotStackConfig,   // collapse multiple wafers into one aggregated map
  passBins?:  number[],         // bins counted as pass for yield (default [1])
})
```

All fields are optional.  Supply what you know; the library handles the rest.

#### `DieResult`

A single die record from wafer test equipment.

```ts
{
  x:       number    // die grid X position (prober step coordinate)
  y:       number    // die grid Y position (prober step coordinate)
  values?: number[]  // multi-channel test measurement values
  bins?:   number[]  // multi-channel bin assignments (hard bin, soft bin, …)
}
```

Single-channel data is just `values: [0.95]` — an array with one element.

#### `WaferConfig`

```ts
{
  diameter?:      number         // wafer diameter in mm; inferred from grid extent × pitch if omitted
  notch?:         { type: 'top' | 'bottom' | 'left' | 'right' }
                  // physical orientation mark direction; standard dimensions derived from diameter:
                  //   ≤ 100 mm → 32.5 mm orientation flat  (SEMI M1)
                  //   ≤ 150 mm → 57.5 mm orientation flat  (SEMI M1)
                  //   > 150 mm → V-notch ~3.5 mm wide, 1.25 mm deep  (SEMI M1)
  orientation?:   number         // degrees CCW to rotate the die grid on screen; default 0 (see note below)
  edgeExclusion?: number         // exclusion band width in mm measured inward from the wafer edge; dies in this band are dimmed
  metadata?:      WaferMetadata  // arbitrary lot/wafer-level data attached to the scene (lot ID, date, etc.)
}
```

**`orientation` note:** positive values rotate the die grid counter-clockwise (standard mathematical convention).  The notch/flat position is controlled by `notch.type` and is **not** affected by `orientation` — it stays fixed as the physical alignment mark.

#### `DieConfig`

```ts
{
  width?:              number   // die width in mm (= X step pitch); enables physical mm coordinates
  height?:             number   // die height in mm (= Y step pitch); enables physical mm coordinates
  coordinateOrigin?:   {
    // where the prober places coordinate (0,0) on the wafer grid
    type: 'center'           // default — grid already centred; centroid offset applied automatically
        | 'LL'               // (0,0) at lower-left corner; auto-detected when all input x,y ≥ 0
        | 'UL'               // (0,0) at upper-left corner — positive Y runs downward (flips display Y)
        | 'LR'               // (0,0) at lower-right corner — positive X runs leftward (flips display X)
        | 'UR'               // (0,0) at upper-right corner — both axes flipped
        | 'custom'           // manual offset: centre = (0,0) + offset in grid steps
    offset?: { x: number; y: number }   // grid-step offset to the true centre; only used when type is 'custom'
  }
  yAxisDirection?: 'up' | 'down'     // which direction Y increases on the prober; 'down' for row/matrix probers (default 'up')
  xAxisDirection?: 'right' | 'left'  // which direction X increases; 'left' for backside or mirrored probing (default 'right')
}
```

When `width` and `height` are omitted, the library estimates die dimensions from
the grid layout using nearest-neighbour step analysis first, falling back to the
circular-wafer aspect-ratio constraint.

#### `ReticleConfig`

```ts
{
  width:      number               // stepper field width in number of dies (e.g. 4 means 4 dies wide)
  height:     number               // stepper field height in number of dies
  anchorDie?: { x: number; y: number }
               // die grid index (i, j) that sits at the reticle field's internal (0,0) corner.
               // Shifts the entire reticle grid so this die aligns to a field boundary.
               // Default {0,0} — die (0,0) is at a corner.
}
```

When provided, reticle overlays are shown by default (`showReticle` defaults to `true`).

#### `LotStackConfig`

Collapse data from multiple wafers into a single map before rendering.  When `lotStack`
is present the top-level `results` field is ignored.

```ts
{
  results:    DieResult[][]  // input data — one DieResult[] per wafer in the lot
  method:     // aggregation applied per die position across all wafers:
    | 'mean'       // arithmetic mean of values
    | 'median'     // median of values
    | 'stddev'     // sample standard deviation of values
    | 'countBin'   // how many wafers had targetBin at this position → values[0]
    | 'mode'       // most frequent bin across wafers → bins[0]
    | 'percent'    // percentage of wafers that had targetBin → values[0] in [0,100]
  targetBin?: number   // bin value to count or measure; required for 'countBin' and 'percent'
}
```

#### `passBins`

```ts
passBins?: number[]   // default [1]  (industry convention: bin 1 = pass)
```

Bin values that count as pass for yield calculation.  Set to `[]` to suppress yield.

### Options

All [`SceneOptions`](#buildscenewafer-dies-options) fields are supported, plus:

```ts
{
  plotMode?: // how die colour is determined — auto-detected when omitted:
    | 'value'          // colour each die by values[0] on a continuous gradient
    | 'hardbin'        // colour each die by bins[0] using categorical bin colours
    | 'softbin'        // colour each die by bins[0] on a gradient scaled to max bin
    | 'stackedValues'  // split each die into N vertical bands, one per values[] channel
    | 'stackedBins'    // split each die into N vertical bands, one per bins[] channel
             // auto-detected: 'value' when any point has values, else 'hardbin'
  debug?: boolean   // emit internal timing and inference diagnostics to the console
}
```

### Return value

```ts
{
  wafer:   Wafer    // resolved wafer model (diameter, radius, center, notch, orientation)
  dies:    Die[]    // all dies inside the wafer boundary, with values/bins attached
  scene:   Scene    // renderer-agnostic scene — pass directly to toPlotly()
  units:   'mm' | 'normalized'   // coordinate space of die.x/die.y and wafer dimensions
  inference: {
    wafer:    { confidence: number; method: string }   // how diameter was resolved; confidence 0–1
    diePitch: { confidence: number; units: 'mm' | 'normalized' }  // how die size was resolved
    grid:     { confidence: number }                   // quality of the grid index assignment
  }
  dataCoverage: {
    filledDies:       number   // dies with at least one value or bin attached
    totalDies:        number   // all dies inside the wafer boundary (including partial)
    edgeExcludedDies: number   // dies whose centres fall within the edge exclusion band
    ratio:            number   // filledDies / totalDies ∈ [0, 1]
  }
  yield: YieldSummary   // pass/fail statistics computed against passBins
}
```

#### `YieldSummary`

```ts
{
  passDies:         number          // dies with a bin in passBins
  failDies:         number          // full dies inside wafer with a bin not in passBins
  edgeExcludedDies: number          // dies within the edge exclusion zone
  partialDies:      number          // dies straddling the wafer boundary
  totalDies:        number          // passDies + failDies
  yieldPercent:     number | null   // passDies / totalDies ∈ [0,1]; null when no bin data
}
```

Partial dies and edge-excluded dies are excluded from both numerator and denominator.

**`units`** tells you the coordinate space of `die.x`, `die.y`, and `wafer.diameter`:

- `'mm'` — at least one physical dimension was known (die size or wafer diameter); all spatial values are in real-world millimetres.
- `'normalized'` — only grid positions were supplied; coordinates are proportionally correct (aspect ratio preserved) but not in physical mm.  `pitchX = 1` normalized unit by convention.

**`inference.confidence`** runs from 0 (pure default) to 1 (fully determined).
**`inference.wafer.method`** describes how diameter was resolved: `'snapped-300mm'`, `'rounded'`, `'provided'`, `'default'`, etc.

### Inference levels

The library adapts to whatever geometry context you provide.  Four distinct levels:

| Provided | Inferred | `units` |
| -------- | -------- | ------- |
| grid positions only | Pitch from nearest-neighbour step analysis; diameter from grid extent | `'normalized'` |
| grid positions + die size | Diameter from grid extent × pitch | `'mm'` |
| grid positions + wafer diameter | Die size from `diameter / grid_extent` | `'mm'` |
| grid positions + die size + diameter | Nothing — fully specified | `'mm'` |

**Diameter snapping:** inferred diameters snap to industry-standard sizes.
100 mm, 150 mm, 200 mm, and 300 mm are preferred (±10% tolerance); other SEMI
standard sizes (25 / 50 / 75 / 450 mm) are tried next (±20%); remaining values
are rounded to the nearest 10 mm.

**Origin auto-detection:** when all input coordinates are ≥ 0, the library
automatically infers lower-left (`'LL'`) origin and centres the grid for display.

### Examples

**Minimal — grid positions only (normalized units):**

```ts
const result = buildWaferMap([
  { x: 0, y:  0, values: [0.95] },
  { x: 1, y:  0, values: [0.87] },
  { x: 0, y: -1, values: [0.91] },
]);
// result.units === 'normalized'
```

**With die size — physical mm coordinates:**

```ts
const result = buildWaferMap({
  results:   data,
  dieConfig: { width: 10, height: 10 },
});
// result.units === 'mm'
```

**Fully specified with notch:**

```ts
const result = buildWaferMap({
  results:     data,
  waferConfig: { diameter: 300, notch: { type: 'bottom' }, orientation: 90 },
  dieConfig:   { width: 10, height: 10 },
});
```

**With bin data and edge exclusion:**

```ts
const result = buildWaferMap({
  results:     csvRows.map(r => ({ x: Number(r.x), y: Number(r.y), bins: [Number(r.hbin)] })),
  waferConfig: { diameter: 200, edgeExclusion: 3 },
  dieConfig:   { width: 8, height: 8 },
});
const { yieldPercent } = result.yield;
```

**Multi-channel input — values and bins in a single pass:**

```ts
const result = buildWaferMap({
  results: rows.map(r => ({
    x: +r.x, y: +r.y,
    values: [+r.testA, +r.testB, +r.testC],
    bins:   [+r.hbin, +r.sbin],
  })),
  dieConfig: { width: 10, height: 10 },
});
```

**Reticle overlay phased to die (2, 1):**

```ts
const result = buildWaferMap({
  results:   data,
  dieConfig: { width: 10, height: 10 },
  reticleConfig: { width: 4, height: 2, anchorDie: { x: 2, y: 1 } },
});
```

**Multi-wafer lot stack — count bin 2 failures across six wafers:**

```ts
const result = buildWaferMap({
  waferConfig: { diameter: 300 },
  dieConfig:   { width: 10, height: 10 },
  lotStack:  {
    results:   [wafer1, wafer2, wafer3, wafer4, wafer5, wafer6],
    method:    'countBin',
    targetBin: 2,
  },
});
```

**Row-based prober (y increases downward, origin at upper-left):**

```ts
const result = buildWaferMap({
  results:   data,
  dieConfig: { width: 10, height: 10, coordinateOrigin: { type: 'UL' } },
});
```

**Connecting to Plotly with click drill-down:**

```ts
import { buildWaferMap, toPlotly, getDieAtPoint } from 'wafermap';

const result = buildWaferMap({ results: data, dieConfig: { width: 10, height: 10 } });
const { data: traces, layout } = toPlotly(result.scene);
Plotly.react('chart', traces, layout);

document.getElementById('chart').on('plotly_click', (ev) => {
  const die = getDieAtPoint(result.scene, ev);
  if (die) console.log(die.i, die.j, die.values, die.bins);
});
```

### Post-enrichment (advanced)

When you need to attach additional channels after the map is built, use `getDieKey`
for stable lookups:

```ts
import { buildWaferMap, getDieKey } from 'wafermap';

const result = buildWaferMap({ results: primaryData, waferConfig, dieConfig });

const rowMap = new Map(rows.map(r => [getDieKey({ i: r.x, j: r.y }), r]));
const dies = result.dies.map(d => {
  const row = rowMap.get(getDieKey(d));
  if (!row) return d;
  return {
    ...d,
    values: [Number(row.testA), Number(row.testB), Number(row.testC)],
    bins:   [Number(row.hbin), Number(row.sbin)],
  };
});
// Pass enriched `dies` to buildScene().
```

For non-centred grids (grid offset ≠ 0), the reverse mapping is
`origX = die.i + offsetX` where `offsetX = Math.round(mean of all input x values)`.

---

## `toPlotly(scene, options?)`

Converts a scene into Plotly-compatible `{ data, layout }`.

```ts
interface ToPlotlyOptions {
  showAxes?:          boolean                    // show X/Y axis tick marks and labels (default false)
  showPhysicalUnits?: boolean                    // append "(mm)" to axis titles and show raw mm tick values (default false)
  showColorbar?:      boolean                    // show the continuous-value colorbar (default true); set false to suppress
  diePitchMm?:        { x: number; y: number }  // die pitch in mm; axis ticks show die grid indices when provided
  axisLabels?:        { x?: string; y?: string } // custom axis title strings
}
```

Behaviour:

- Die rectangles → `layout.shapes` paths at `layer: 'below'`
- Overlays → `layout.shapes` paths at `layer: 'above'`
- Hover → invisible scatter trace (one point per die, indexed parallel to `scene.dies`)
- Text labels → scatter text trace (when `scene.texts.length > 0`)
- Continuous modes (`value`, `softbin`, `stackedValues`) → reference colorbar trace (suppressed when `showColorbar: false`)

---

## Package surface

Most consumers import from the top-level package:

```ts
import { buildWaferMap, toPlotly } from 'wafermap';
```

Or from subpath exports:

```ts
import { buildWaferMap }             from 'wafermap/renderer';
import { createWafer, generateDies } from 'wafermap/core';
import { toPlotly }                  from 'wafermap/plotly-adapter';
```

---

## Advanced / Manual Pipeline

For full control over each pipeline stage, use the low-level functions directly.
These are the building blocks that `buildWaferMap` uses internally.

`basic-demo` is the reference demo for this path.  Prefer `buildWaferMap` for all
other use cases.

```text
createWafer(config)
  → generateDies(wafer, dieConfig)
  → clipDiesToWafer(dies, wafer, dieConfig)
  → [attach values / bins / metadata to each die, keyed by die.i, die.j]
  → applyProbeSequence(dies, config)              // optional
  → applyOrientation(dies, wafer)
  ↓  (on each redraw)
  → transformDies(dies, interactiveTransform, wafer.center)
  → buildScene(wafer, dies, options)   → Scene
  → toPlotly(scene, options)           → { data, layout }
  → Plotly.react(el, data, layout)
```

In the manual pipeline, `die.i` and `die.j` are computed by `generateDies` as
integer grid indices centred at the wafer origin.  For data keyed by prober step
positions, match on `die.i, die.j` directly (they equal the prober step positions
for grids centered at (0,0)).

### `createWafer(spec)`

Creates a wafer model.  `diameter` is required.  Accepts a `WaferSpec`:

```ts
{
  diameter:     number                     // required
  center?:      { x: number; y: number }   // mm, default {0, 0}
  notch?:       { type: 'top' | 'bottom' | 'left' | 'right' }
                // Standard length derived from diameter automatically
  orientation?: number                     // degrees CCW, default 0
  metadata?:    WaferMetadata
}
```

Returns `Wafer` with `diameter`, `radius`, `center`, `notch` (with computed `length`), `orientation`, `metadata`.

---

### `generateDies(wafer, spec)`

Creates a rectangular die grid centred on the wafer.  Accepts a `DieSpec`:

```ts
{
  width:     number   // required
  height:    number   // required
  gridSize?: number
  offset?:   { x: number; y: number }
}
```

Returns `Die[]` with `id`, `i`, `j`, `x`, `y`, `width`, `height`.

---

### `clipDiesToWafer(dies, wafer, spec?)`

Clips dies to the wafer boundary (circle + optional notch/flat exclusion zone).  The optional third argument is a `DieSpec`.

- Removes dies entirely outside the wafer.
- Sets `insideWafer: true` on included dies.
- Sets `partial: true` on dies that straddle the boundary (requires `spec` for 4-corner test).

---

### `isInsideWafer(x, y, wafer)`

Returns `true` when the point (x, y) falls inside the wafer boundary including
the notch/flat exclusion zone.  Coordinates are wafer-local (pre-rotation).

---

### `mapDataToDies(dies, data, options)`

Maps row data onto dies, attaching `values` and/or `bins`.

```ts
{
  matchBy:     'xy' | 'ij'
  valueField?: string
  binField?:   string
}
```

---

### `applyOrientation(dies, wafer)`

Rotates die coordinates by `wafer.orientation` around `wafer.center`.
Call once after clipping and enrichment, before render-time transforms.

---

### `transformDies(dies, options, center?)`

Applies interactive display transforms (rotation + flip) around `center`.

```ts
{
  rotation?: number   // degrees
  flipX?:    boolean
  flipY?:    boolean
}
```

---

### `applyProbeSequence(dies, config)`

Assigns `probeIndex` to dies in the requested order.

Supported strategies: `'row'`, `'column'`, `'snake'`, `'custom'`
(for `'custom'` provide `customOrder: string[]` of die IDs).

---

### `generateReticleGrid(wafer, spec)`

Generates reticle rectangles covering the wafer area.  Reticles are rectangular
groups of dies; positions are computed in die-index space so edges always land
exactly on die boundaries.  Accepts a `ReticleSpec`:

```ts
{
  width:       number                      // field width in die counts
  height:      number                      // field height in die counts
  diePitchX:   number                      // die pitch in display units (mm or normalized)
  diePitchY:   number
  anchorDie?:  { x: number; y: number }   // die index at the field's (0,0) corner; default {0,0}
}
```

`anchorDie` controls the phase of the reticle grid.  Die `(anchorDie.x, anchorDie.y)` sits
at the bottom-left corner of a reticle field.

Returns `Reticle[]` — display-coordinate rectangles ready for `buildScene`.

> **Note:** When using `buildWaferMap`, pass `reticleConfig: ReticleConfig` instead — pitch is wired through automatically.  `ReticleSpec` (with explicit `diePitchX`/`diePitchY`) is only needed when calling `generateReticleGrid` directly in the manual pipeline.

---

### `classifyDie(die, wafer, options?)`

Classifies a die by radial ring and screen quadrant.

```ts
options: { ringCount?: number }   // default 4
```

Returns:

```ts
{
  ring:     number                       // 1 = innermost, ringCount = edge
  quadrant: 'NE' | 'NW' | 'SW' | 'SE'
}
```

Uses the die's current `x`/`y` display position — orientation- and transform-aware.

---

### `getRingLabel(ring, ringCount)`

Returns a human-readable label for a ring index:

| ringCount | ring 1 | ring 2 | ring 3 | ring 4 |
| --------- | ------ | ------ | ------ | ------ |
| 1 | Full Wafer | — | — | — |
| 2 | Core | Edge | — | — |
| 3 | Core | Middle | Edge | — |
| 4 | Core | Inner | Outer | Edge |
| 5+ | Core | Middle N | … | Edge |

---

### `getUniqueBins(dies, binChannel?)`

Returns all distinct bin values present in the dies, sorted ascending.

`binChannel` selects which `bins[]` index to read (default 0).

---

### `aggregateBinCounts(diesByWafer, targetBin, binChannel?)`

Stacks multiple wafers and counts, per die position, how many wafers had a specific bin value.

```ts
aggregateBinCounts(
  diesByWafer: Die[][],
  targetBin:   number,
  binChannel?: number   // which bins[] index to read, default 0
): Die[]
```

Returns one `Die` per unique `(i, j)` position where:

- `values[0]` = number of wafers that had `targetBin` at this position
- `bins[0]`   = `targetBin`

Use with `plotMode: 'value'` and `valueRange: [0, diesByWafer.length]`:

```ts
const aggregated = aggregateBinCounts(diesByWafer, 3);
const scene = buildScene(wafer, aggregated, {
  plotMode:   'value',
  valueRange: [0, diesByWafer.length],
});
```

For inline multi-wafer aggregation, prefer the `lotStack` option on `buildWaferMap`.

---

### `aggregateValues(diesByWafer, method, binChannel?)`

Aggregate a per-channel numeric value across a lot of wafers.

```ts
aggregateValues(
  diesByWafer:  Die[][],
  method:       AggregationMethod,
  binChannel?:  number   // which values[] index to aggregate, default 0
): Die[]
```

`AggregationMethod` = `'mean' | 'median' | 'stddev' | 'min' | 'max' | 'count'`

Returns one `Die` per unique `(i, j)` position with `values[0]` set to the aggregate.
Dies with no data at a position are included with `values: undefined`.

```ts
const lotMean = aggregateValues(diesByWafer, 'mean');
const scene = buildScene(wafer, lotMean, { plotMode: 'value' });
```

---

### `buildScene(wafer, dies, options?)`

Builds the renderer-agnostic scene.

```ts
interface SceneOptions {
  plotMode?:               'value' | 'hardbin' | 'softbin' | 'stackedValues' | 'stackedBins'
  showText?:               boolean
  showReticle?:            boolean
  showProbePath?:          boolean
  showRingBoundaries?:     boolean
  showQuadrantBoundaries?: boolean
  showXYIndicator?:        boolean
  ringCount?:              number    // default 4
  dieGap?:                 number    // visual kerf gap in mm, default 1
  colorScheme?:            string    // default 'color'
  highlightBin?:           number
  valueRange?:             [number, number]
  interactiveTransform?:   { rotation?: number; flipX?: boolean; flipY?: boolean }
  reticles?:               Reticle[] // overlay generated by generateReticleGrid
}
```

```ts
buildScene(wafer, dies, { plotMode: 'hardbin', reticles, showReticle: true })
```

Returns `Scene`:

```ts
{
  rectangles:  SceneRect[]
  texts:       SceneText[]
  hoverPoints: SceneHoverPoint[]
  overlays:    SceneOverlay[]
  plotMode:    PlotMode
  colorScheme: string
  metadata:    WaferMetadata | null
  dies:        Die[]
  valueRange:  [number, number]
}
```

---

### `getDieKey(die)`

Returns a stable string key for a die in `"i,j"` format.  Use for `Map` keys and
post-enrichment lookups instead of ad-hoc template literals.

```ts
getDieKey(die: { i: number; j: number }): string

const map = new Map(result.dies.map(d => [getDieKey(d), d]));
const die = map.get(getDieKey({ i: 3, j: -2 }));
```

---

### `getDieAtPoint(scene, plotlyEvent)`

Returns the die that a Plotly click or hover event points to.

```ts
getDieAtPoint(
  scene: Scene,
  plotlyEvent: { points?: Array<{ pointIndex?: number; curveNumber?: number }> }
): Die | null
```

Returns `null` when the event doesn't resolve to a die (e.g. click on an overlay
trace rather than the die scatter).

```ts
chart.on('plotly_click', ev => {
  const die = getDieAtPoint(scene, ev);
  if (die) console.log(die.i, die.j, die.values, die.bins);
});
```

---

### Color helpers

| Function | Description |
| -------- | ----------- |
| `hardBinColor(bin)` | Categorical colour for hard bin 0–14 |
| `hardBinGreyscale(bin)` | Greyscale variant |
| `softBinColor(bin, maxBin?)` | Maps bin to Viridis position |
| `valueToViridis(t)` | Maps `t ∈ [0,1]` to Viridis RGB string |
| `valueToGreyscale(t)` | Maps `t ∈ [0,1]` to grey RGB string |
| `contrastTextColor(cssColor)` | Returns `'#000000'` or `'#ffffff'` for WCAG contrast |

---

## Important types

### `Die`

```ts
{
  id:            string
  i:             number    // die grid X position (equals input x for centred grids)
  j:             number    // die grid Y position (equals input y for centred grids)
  x:             number    // physical X in mm (or normalized units)
  y:             number    // physical Y in mm (or normalized units)
  width:         number    // die width in mm (or normalized units)
  height:        number    // die height in mm (or normalized units)
  values?:       number[]
  bins?:         number[]
  metadata?:     DieMetadata
  insideWafer?:  boolean
  partial?:      boolean   // straddles the wafer boundary
  edgeExcluded?: boolean   // centre falls within the edge exclusion zone
  probeIndex?:   number
}
```

`die.i` and `die.j` are the integer grid indices.  For grids centred at (0,0)
(the common case), they equal the original prober step positions passed as input.
Use `getDieKey(die)` for stable map keys.

`die.x` and `die.y` are the physical positions derived by the library.  Their unit
depends on `WaferMapResult.units`.

### `Wafer`

```ts
{
  diameter:    number
  radius:      number
  center:      { x: number; y: number }
  notch?:      { type: 'top' | 'bottom' | 'left' | 'right'; length: number }
               // length = standard chord/half-width in mm, derived from diameter
  orientation: number
  metadata?:   WaferMetadata
}
```

### `WaferNotch`

User-facing input type — `length` is derived automatically from the wafer diameter
by `createWafer` and does not need to be supplied.

```ts
{
  type: 'top' | 'bottom' | 'left' | 'right'
}
```

### `WaferMetadata`

An open key-value record — any fields are accepted.  No fixed schema is enforced.

```ts
type WaferMetadata = Record<string, unknown>
// e.g. { lot: 'LOT123', waferNumber: 1, testDate: '2026-04-23', temperature: 25 }
```

### `DieMetadata`

```ts
{
  lotId?:        string
  waferId?:      string
  deviceType?:   string
  testProgram?:  string
  temperature?:  number
  customFields?: Record<string, unknown>
  [key: string]: unknown
}
```

### `DieClassification`

```ts
{
  ring:     number
  quadrant: 'NE' | 'NW' | 'SW' | 'SE'
}
```

---

## Current limitations

- Ring segmentation uses equal-width radial bands.  Configurable breakpoints are planned.
- Plotly types are not exposed as formal peer-typed interfaces.
