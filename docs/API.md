# API Reference

This document describes the public API exposed by `wafermap`.

The public package surface is exported from:
- `wafermap`
- `wafermap/core`
- `wafermap/renderer`
- `wafermap/plotly-adapter`

---

## Quick Start

```ts
import { buildWaferMap, toPlotly } from 'wafermap';

const result = buildWaferMap([
  { x: 10, y: 20, value: 0.95 },
  { x: 20, y: 20, value: 0.87 },
]);

const { data, layout } = toPlotly(result.scene);
Plotly.react('chart', data, layout);
```

---

## `buildWaferMap(input, options?)`

The primary entry point.  Pass whatever data you have — XY positions, optional
geometry hints, or a pre-built die array.  The function infers whatever is
missing and returns a fully constructed scene.

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
  data?: WaferMapPoint[],
  wafer?: WaferOptions,
  die?:   DieOptions,
  dies?:  Die[],        // pre-built die array; skips geometry generation
})
```

All fields are optional.  Supply what you know; the library handles the rest.

#### `WaferMapPoint`

```ts
{
  x: number
  y: number
  value?: number   // continuous measurement
  bin?: number     // hard bin assignment
  i?: number       // grid column index (skips grid inference when present on all points)
  j?: number       // grid row index
}
```

#### `WaferOptions`

```ts
{
  diameter?: number                                    // mm; inferred from data if omitted
  center?: { x: number; y: number }                   // mm; inferred from data centroid if omitted
  flat?: { type: 'top' | 'bottom' | 'left' | 'right'; length: number }
  orientation?: number                                 // degrees, default 0
  metadata?: WaferMetadata
}
```

#### `DieOptions`

```ts
{
  width?: number     // mm; inferred from data spacing if omitted
  height?: number
  pitchX?: number    // grid spacing in X; defaults to width
  pitchY?: number    // grid spacing in Y; defaults to height
}
```

### Options

All [`BuildSceneOptions`](#buildscene) fields are supported, plus:

```ts
{
  plotMode?: 'value' | 'hardbin' | 'softbin' | 'stacked_values' | 'stacked_bins'
             // auto-detected: 'value' when any point has a value, else 'hardbin'
  debug?: boolean   // reserved for future diagnostic output
  // ...all other BuildSceneOptions fields
}
```

### Return value

```ts
{
  wafer: Wafer          // resolved wafer model
  dies:  Die[]          // clipped, oriented die array with data attached
  scene: Scene          // renderer-agnostic scene; pass to toPlotly()
  inference: {
    wafer:    { confidence: number; method: string }
    diePitch: { confidence: number }
    grid:     { confidence: number }
  }
}
```

`confidence` values run from 0 (pure default) to 1 (fully determined from
data).  `method` describes how the wafer diameter was resolved, e.g.
`'snapped-300mm'`, `'rounded'`, `'provided'`, or `'default'`.

### Examples

**Minimal — XY data only:**
```ts
const result = buildWaferMap([
  { x: 10, y: 20, value: 0.95 },
  { x: 20, y: 20, value: 0.87 },
]);
```

**With geometry hints:**
```ts
const result = buildWaferMap({
  data,
  wafer: { diameter: 300, orientation: 90 },
  die:   { width: 10, height: 10 },
});
```

**With bin data:**
```ts
const result = buildWaferMap({
  data: csvRows.map(r => ({ x: r.x, y: r.y, bin: r.hardbin })),
  wafer: { diameter: 200 },
});
```

**Pre-built dies (full control):**
```ts
const wafer = createWafer({ diameter: 300 });
const dies  = clipDiesToWafer(generateDies(wafer, { width: 10, height: 10 }), wafer);
const result = buildWaferMap({ wafer: { diameter: 300 }, dies });
```

**Connecting to Plotly:**
```ts
const result = buildWaferMap(data);
const { data: traces, layout } = toPlotly(result.scene);
Plotly.react('chart', traces, layout);

// Click drill-down:
Plotly.on(el, 'plotly_click', (ev) => {
  const die = result.scene.sourceDies[ev.points[0].pointIndex];
});
```

---

## `toPlotly(scene, options?)`

Converts a scene into Plotly-compatible `{ data, layout }`.

```ts
interface ToPlotlyOptions {
  showAxes?: boolean
  showUnits?: boolean
  diePitch?: { x: number; y: number }
  axisLabels?: { x?: string; y?: string }
}
```

Behavior:
- Die rectangles → `layout.shapes` paths at `layer: 'below'`
- Overlays → `layout.shapes` paths at `layer: 'above'`
- Hover → invisible scatter trace (one point per die, indexed parallel to `scene.sourceDies`)
- Text labels → scatter text trace (present when `scene.texts.length > 0`)
- Continuous modes (`value`, `softbin`, `stacked_values`) → reference colorbar trace

**Wiring click callbacks:**

```js
Plotly.on(document.getElementById('chart'), 'plotly_click', (event) => {
  const die = scene.sourceDies[event.points[0].pointIndex];
  // die.i, die.j, die.values, die.bins, die.metadata, etc.
});
```

---

## Package Surface

Most consumers import from the top-level package:

```ts
import { buildWaferMap, toPlotly } from 'wafermap';
```

Or from subpath exports:

```ts
import { buildWaferMap }           from 'wafermap/renderer';
import { createWafer, generateDies } from 'wafermap/core';
import { toPlotly }                from 'wafermap/plotly-adapter';
```

---

## Advanced / Manual Pipeline

For full control over each pipeline stage, use the low-level functions directly.
These are the building blocks that `buildWaferMap` uses internally.

### `createWafer(config)`

Creates a wafer model.

```ts
{
  diameter: number
  center?: { x: number; y: number }          // default {0, 0}
  flat?: { type: 'top' | 'bottom' | 'left' | 'right'; length: number }
  orientation?: number                        // degrees, default 0
  metadata?: WaferMetadata
}
```

Returns `Wafer` with `diameter`, `radius`, `center`, `flat`, `orientation`, `metadata`.

---

### `generateDies(wafer, dieConfig)`

Creates a rectangular die grid centered on the wafer.

```ts
{
  width: number
  height: number
  gridSize?: number
  offset?: { x: number; y: number }
}
```

Returns `Die[]` with `id`, `i`, `j`, `x`, `y`, `width`, `height`.

---

### `clipDiesToWafer(dies, wafer, dieConfig?)`

Clips dies to the wafer boundary.

- Removes dies entirely outside the wafer.
- Marks included dies with `insideWafer: true`.
- Marks straddling dies with `partial: true` when `dieConfig` is provided (4-corner test).

---

### `mapDataToDies(dies, data, options)`

Maps row data onto dies, attaching `values` and/or `bins`.

```ts
{
  matchBy: 'xy' | 'ij'
  valueField?: string
  binField?: string
}
```

---

### `applyOrientation(dies, wafer)`

Rotates die coordinates by `wafer.orientation` around `wafer.center`. Call once after clipping and enrichment, before render-time transforms.

---

### `transformDies(dies, options, center?)`

Applies interactive display transforms (rotation + flip) around `center`.

```ts
{
  rotation?: number   // degrees
  flipX?: boolean
  flipY?: boolean
}
```

---

### `applyProbeSequence(dies, config)`

Assigns `probeIndex` to dies in the requested order.

Supported strategies:

- `'row'`
- `'column'`
- `'snake'`
- `'custom'` — provide `customOrder: string[]` (die IDs)

---

### `generateReticleGrid(wafer, config)`

Generates reticle rectangles covering the wafer area.

```ts
{
  width: number
  height: number
  stepX: number
  stepY: number
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
  ring: number       // 1 = innermost, ringCount = edge
  quadrant: 'NE' | 'NW' | 'SW' | 'SE'
}
```

Uses the die's current `x`/`y` display position, so it is orientation- and transform-aware.

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
  targetBin: number,
  binIndex?: number
): Die[]
```

Returns one `Die` per unique `(i, j)` position where:
- `values[0]` = number of wafers that had `targetBin` at this position
- `bins[0]` = `targetBin`

Use with `plotMode: 'value'` and `valueRange: [0, diesByWafer.length]`:

```ts
const aggregated = aggregateBinCounts(diesByWafer, 11);
const scene = buildScene(wafer, aggregated, [], {
  plotMode: 'value',
  valueRange: [0, diesByWafer.length],
});
```

---

### `buildScene(wafer, dies, reticles?, options?)`

Builds the renderer-agnostic scene.

```ts
interface BuildSceneOptions {
  plotMode?: 'value' | 'hardbin' | 'softbin' | 'stacked_values' | 'stacked_bins'
  showText?: boolean
  showReticle?: boolean
  showProbePath?: boolean
  showRingBoundaries?: boolean
  showQuadrantBoundaries?: boolean
  showXYIndicator?: boolean
  ringCount?: number               // default 4
  dieGap?: number                  // kerf gap in mm, default 1
  colorScheme?: string             // default 'color'
  highlightBin?: number
  valueRange?: [number, number]
  interactiveTransform?: {
    rotation?: number
    flipX?: boolean
    flipY?: boolean
  }
}
```

Returns `Scene`:

```ts
{
  rectangles: SceneRect[]
  texts: SceneText[]
  hoverPoints: SceneHoverPoint[]
  overlays: SceneOverlay[]
  plotMode: PlotMode
  colorScheme: string
  metadata: WaferMetadata | null
  sourceDies: Die[]
  valueRange: [number, number]
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

## Important Types

### `Die`

```ts
{
  id: string
  i: number
  j: number
  x: number
  y: number
  width: number
  height: number
  values?: number[]
  bins?: number[]
  metadata?: DieMetadata
  insideWafer?: boolean
  partial?: boolean
  probeIndex?: number
}
```

### `WaferMetadata`

```ts
{
  lot: string
  waferNumber: number
  testDate: string
  testProgram: string
  temperature: number
}
```

### `DieMetadata`

```ts
{
  lotId?: string
  waferId?: string
  deviceType?: string
  testProgram?: string
  temperature?: number
  customFields?: Record<string, unknown>
  [key: string]: unknown
}
```

### `DieClassification`

```ts
{
  ring: number
  quadrant: 'NE' | 'NW' | 'SW' | 'SE'
}
```

---

## Manual Pipeline Flow Reference

```text
createWafer(config)
  → generateDies(wafer, dieConfig)
  → clipDiesToWafer(dies, wafer, dieConfig)
  → [attach values / bins / metadata to each die]
  → applyProbeSequence(dies, config)      // optional
  → applyOrientation(dies, wafer)
  ↓  (at render time, on each redraw)
  → transformDies(dies, interactiveTransform, wafer.center)
  → buildScene(wafer, dies, reticles, options)   → Scene
  → toPlotly(scene, options)                     → { data, layout }
  → Plotly.react(el, data, layout)
```

---

## Current Limitations

- Ring segmentation uses equal-width radial bands. Configurable breakpoints are planned.
- Plotly types are not exposed as formal peer-typed interfaces.
- `aggregateDieValues` helper (mean / median collapse across `die.values[]`) is not yet implemented.
- `bin_count` plot mode (colour by how many stacked bins match a target) is not yet implemented.
