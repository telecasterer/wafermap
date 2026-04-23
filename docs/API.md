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

```
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
  { x: 0,  y:  0, value: 0.95 },
  { x: 1,  y:  0, value: 0.87 },
  { x: -1, y:  1, value: 0.91 },
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
buildWaferMap(data: WaferMapPoint[])

// Object form — with optional geometry hints
buildWaferMap({
  data?:  WaferMapPoint[],
  wafer?: WaferOptions,
  die?:   DieOptions,
  dies?:  Die[],   // pre-built die array; skips geometry generation
})
```

All fields are optional.  Supply what you know; the library handles the rest.

#### `WaferMapPoint`

```ts
{
  x:      number   // die grid X position (prober step coordinate)
  y:      number   // die grid Y position (prober step coordinate)
  value?: number   // continuous measurement
  bin?:   number   // hard bin assignment
}
```

#### `WaferOptions`

```ts
{
  diameter?:    number                                // mm; inferred from grid extent × pitch if omitted
  flat?:        { type: 'top' | 'bottom' | 'left' | 'right'; length: number }
  orientation?: number                               // degrees, default 0
  metadata?:    WaferMetadata
}
```

#### `DieOptions`

```ts
{
  width?:  number   // die width in mm  — enables physical mm coordinates
  height?: number   // die height in mm — enables physical mm coordinates
}
```

When `width` and `height` are omitted, the library estimates die dimensions from
the grid layout using the circular-wafer constraint (see [Inference levels](#inference-levels)).

### Options

All [`BuildSceneOptions`](#buildscene) fields are supported, plus:

```ts
{
  plotMode?: 'value' | 'hardbin' | 'softbin' | 'stacked_values' | 'stacked_bins'
             // auto-detected: 'value' when any point has a value, else 'hardbin'
  debug?: boolean
}
```

### Return value

```ts
{
  wafer: Wafer
  dies:  Die[]
  scene: Scene        // pass to toPlotly()
  units: 'mm' | 'normalised'
  inference: {
    wafer:    { confidence: number; method: string }
    diePitch: { confidence: number; units: 'mm' | 'normalised' }
    grid:     { confidence: number }
  }
}
```

**`units`** tells you the coordinate space of `die.x`, `die.y`, and `wafer.diameter`:

- `'mm'` — at least one physical dimension was known (die size or wafer diameter); all spatial values are in real-world millimetres.
- `'normalised'` — only grid positions were supplied; coordinates are proportionally correct (aspect ratio preserved) but not in physical mm.  `pitchX = 1` normalised unit by convention.

**`inference.confidence`** runs from 0 (pure default) to 1 (fully determined).
**`inference.wafer.method`** describes how diameter was resolved: `'snapped-300mm'`, `'rounded'`, `'provided'`, `'default'`, etc.

### Inference levels

The library adapts to whatever geometry context you provide.  Four distinct levels:

| Provided | Inferred | `units` |
| -------- | -------- | ------- |
| grid positions only | Pitch ratio from circular constraint; diameter from grid extent | `'normalised'` |
| grid positions + die size | Diameter from grid extent × pitch | `'mm'` |
| grid positions + wafer diameter | Die size from `diameter / grid_extent` | `'mm'` |
| grid positions + die size + diameter | Nothing — fully specified | `'mm'` |

**Circular constraint** (used when no die size is given):
since both axes span the same physical wafer diameter,
`pitchY / pitchX = x_range / y_range`.
If the grid spans 28 steps in X and 14 in Y, dies must be twice as tall as wide.

### Examples

**Minimal — grid positions only (normalised units):**

```ts
const result = buildWaferMap([
  { x: 0, y:  0, value: 0.95 },
  { x: 1, y:  0, value: 0.87 },
  { x: 0, y: -1, value: 0.91 },
]);
// result.units === 'normalised'
```

**With die size — physical mm coordinates:**

```ts
const result = buildWaferMap({
  data,
  die: { width: 10, height: 10 },
});
// result.units === 'mm'
```

**Fully specified:**

```ts
const result = buildWaferMap({
  data,
  wafer: { diameter: 300, flat: { type: 'bottom', length: 40 }, orientation: 90 },
  die:   { width: 10, height: 10 },
});
```

**With bin data:**

```ts
const result = buildWaferMap({
  data: csvRows.map(r => ({ x: Number(r.x), y: Number(r.y), bin: Number(r.hbin) })),
  wafer: { diameter: 200 },
  die:   { width: 8, height: 8 },
});
```

**Connecting to Plotly:**

```ts
const result = buildWaferMap({ data, die: { width: 10, height: 10 } });
const { data: traces, layout } = toPlotly(result.scene);
Plotly.react('chart', traces, layout);

// Click drill-down:
document.getElementById('chart').on('plotly_click', (ev) => {
  const die = result.scene.sourceDies[ev.points[0].pointIndex];
  console.log(die.i, die.j, die.values, die.bins);
});
```

### Multi-channel post-enrichment

`buildWaferMap` attaches one `value` and one `bin` per die.  For multi-channel
test data, call `buildWaferMap` for geometry, then post-enrich `result.dies`:

```ts
const result = buildWaferMap({ data: primaryData, wafer, die });

// For grids centred at (0,0) — the common case — die.i === original prober x.
const rowMap = new Map(rows.map(r => [`${r.x},${r.y}`, r]));
const dies = result.dies.map(d => {
  const row = rowMap.get(`${d.i},${d.j}`);
  if (!row) return d;
  return {
    ...d,
    values: [Number(row.testA), Number(row.testB), Number(row.testC)],
    bins:   [Number(row.hbin),  Number(row.sbin)],
  };
});
// Pass `dies` (not result.dies) to buildScene().
```

For non-centred grids (grid offset ≠ 0), the reverse mapping is
`origX = die.i + offsetX` where `offsetX = Math.round(mean of all input x values)`.

---

## `toPlotly(scene, options?)`

Converts a scene into Plotly-compatible `{ data, layout }`.

```ts
interface ToPlotlyOptions {
  showAxes?:   boolean
  showUnits?:  boolean
  diePitch?:   { x: number; y: number }
  axisLabels?: { x?: string; y?: string }
}
```

Behaviour:

- Die rectangles → `layout.shapes` paths at `layer: 'below'`
- Overlays → `layout.shapes` paths at `layer: 'above'`
- Hover → invisible scatter trace (one point per die, indexed parallel to `scene.sourceDies`)
- Text labels → scatter text trace (when `scene.texts.length > 0`)
- Continuous modes (`value`, `softbin`, `stacked_values`) → reference colorbar trace

---

## Package surface

Most consumers import from the top-level package:

```ts
import { buildWaferMap, toPlotly } from 'wafermap';
```

Or from subpath exports:

```ts
import { buildWaferMap }            from 'wafermap/renderer';
import { createWafer, generateDies } from 'wafermap/core';
import { toPlotly }                 from 'wafermap/plotly-adapter';
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
  → buildScene(wafer, dies, reticles, options)   → Scene
  → toPlotly(scene, options)                     → { data, layout }
  → Plotly.react(el, data, layout)
```

In the manual pipeline, `die.i` and `die.j` are computed by `generateDies` as
integer grid indices centred at the wafer origin.  For data keyed by prober step
positions, match on `die.i, die.j` directly (they equal the prober step positions
for grids centered at (0,0)).

### `createWafer(config)`

Creates a wafer model.  `diameter` is required.

```ts
{
  diameter:     number
  center?:      { x: number; y: number }   // mm, default {0, 0}
  flat?:        { type: 'top' | 'bottom' | 'left' | 'right'; length: number }
  orientation?: number                     // degrees, default 0
  metadata?:    WaferMetadata
}
```

Returns `Wafer` with `diameter`, `radius`, `center`, `flat`, `orientation`, `metadata`.

---

### `generateDies(wafer, dieConfig)`

Creates a rectangular die grid centred on the wafer.

```ts
{
  width:    number
  height:   number
  gridSize?: number
  offset?:  { x: number; y: number }
}
```

Returns `Die[]` with `id`, `i`, `j`, `x`, `y`, `width`, `height`.

---

### `clipDiesToWafer(dies, wafer, dieConfig?)`

Clips dies to the wafer boundary.

- Removes dies entirely outside the wafer.
- Sets `insideWafer: true` on included dies.
- Sets `partial: true` on dies that straddle the boundary (requires `dieConfig` for 4-corner test).

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

### `generateReticleGrid(wafer, config)`

Generates reticle rectangles covering the wafer area.

```ts
{
  width:   number
  height:  number
  stepX:   number
  stepY:   number
  offset?: { x: number; y: number }
}
```

Returns `Reticle[]`.

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

### `getUniqueBins(dies, binIndex?)`

Returns all distinct bin values present in the dies, sorted ascending.

---

### `aggregateBinCounts(diesByWafer, targetBin, binIndex?)`

Stacks multiple wafers and counts, per die position, how many wafers had a specific bin value.

```ts
aggregateBinCounts(
  diesByWafer: Die[][],
  targetBin:   number,
  binIndex?:   number
): Die[]
```

Returns one `Die` per unique `(i, j)` position where:

- `values[0]` = number of wafers that had `targetBin` at this position
- `bins[0]`   = `targetBin`

Use with `plotMode: 'value'` and `valueRange: [0, diesByWafer.length]`:

```ts
const aggregated = aggregateBinCounts(diesByWafer, 3);
const scene = buildScene(wafer, aggregated, [], {
  plotMode:   'value',
  valueRange: [0, diesByWafer.length],
});
```

---

### `buildScene(wafer, dies, reticles?, options?)`

Builds the renderer-agnostic scene.

```ts
interface BuildSceneOptions {
  plotMode?:               'value' | 'hardbin' | 'softbin' | 'stacked_values' | 'stacked_bins'
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
}
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
  sourceDies:  Die[]
  valueRange:  [number, number]
}
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
  id:          string
  i:           number    // die grid X position (equals input x for centred grids)
  j:           number    // die grid Y position (equals input y for centred grids)
  x:           number    // physical X in mm (or normalised units)
  y:           number    // physical Y in mm (or normalised units)
  width:       number    // die width in mm (or normalised units)
  height:      number    // die height in mm (or normalised units)
  values?:     number[]
  bins?:       number[]
  metadata?:   DieMetadata
  insideWafer?: boolean
  partial?:    boolean
  probeIndex?: number
}
```

`die.i` and `die.j` are the integer grid indices.  For grids centred at (0,0)
(the common case), they equal the original prober step positions passed as input.
Use them for post-enrichment lookups: `rowMap.get(`${die.i},${die.j}`)`.

`die.x` and `die.y` are the physical positions derived by the library.  Their unit
depends on `WaferMapResult.units`.

### `Wafer`

```ts
{
  diameter:     number
  radius:       number
  center:       { x: number; y: number }
  flat?:        WaferFlat
  orientation:  number
  metadata?:    WaferMetadata
}
```

### `WaferMetadata`

```ts
{
  lot:          string
  waferNumber:  number
  testDate:     string
  testProgram:  string
  temperature:  number
}
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
- `aggregateDieValues` helper (mean / median collapse across `die.values[]`) is not yet implemented.
- `bin_count` plot mode (colour by how many stacked bins match a target) is not yet implemented.
