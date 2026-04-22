# API Reference

This document describes the current public API exposed by `wafermap`.

The public package surface is exported from:
- `wafermap`
- `wafermap/core`
- `wafermap/renderer`
- `wafermap/plotly-adapter`

## Package Surface

Top-level exports include all of core, renderer, and plotly-adapter. Most consumers use one of these import styles:

```ts
import {
  createWafer,
  generateDies,
  clipDiesToWafer,
  classifyDie,
  aggregateBinCounts,
  buildScene,
  toPlotly,
} from 'wafermap';
```

Or module-specific imports:

```ts
import { createWafer, generateDies, classifyDie } from 'wafermap/core';
import { buildScene, hardBinColor, valueToViridis } from 'wafermap/renderer';
import { toPlotly } from 'wafermap/plotly-adapter';
```

---

## Core

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

```ts
getUniqueBins(dies: Die[], binIndex?: number): number[]
```

`binIndex` selects which position in `die.bins[]` to inspect (default `0` = hard bin). Useful for discovering which bins to iterate over before calling `aggregateBinCounts`.

---

### `aggregateBinCounts(diesByWafer, targetBin, binIndex?)`

Stacks multiple wafers and counts, per die position, how many wafers had a specific bin value.

```ts
aggregateBinCounts(
  diesByWafer: Die[][],   // one Die[] per wafer, all sharing the same grid layout
  targetBin: number,
  binIndex?: number       // which die.bins[] position to test, default 0
): Die[]
```

Returns one `Die` per unique `(i, j)` position where:
- `values[0]` = number of wafers that had `targetBin` at this position
- `bins[0]` = `targetBin`

Use with `plotMode: 'value'` and `valueRange: [0, diesByWafer.length]` to get a colour scale that runs from "never occurred" to "occurred on every wafer".

```ts
// Show how many of 6 wafers had bin 11 at each die position
const aggregated = aggregateBinCounts(diesByWafer, 11);
const scene = buildScene(wafer, aggregated, [], {
  plotMode: 'value',
  valueRange: [0, diesByWafer.length],
});
```

---

## Renderer

### `buildScene(wafer, dies, reticles?, options?)`

Builds the renderer-agnostic scene. All options are optional.

```ts
interface BuildSceneOptions {
  plotMode?: 'value' | 'hardbin' | 'softbin' | 'stacked_values' | 'stacked_bins'
  showText?: boolean               // die value/bin labels
  showReticle?: boolean
  showProbePath?: boolean
  showRingBoundaries?: boolean
  showQuadrantBoundaries?: boolean
  showXYIndicator?: boolean        // +X / +Y orientation arrows at bottom-left
  ringCount?: number               // default 4
  dieGap?: number                  // kerf gap in mm, default 1
  colorScheme?: 'color' | 'greyscale'   // default 'color'
  highlightBin?: number            // dim all dies except this bin
  valueRange?: [number, number]    // explicit [min, max] for value normalisation;
                                   // auto-computed from die data when omitted
  interactiveTransform?: {
    rotation?: number
    flipX?: boolean
    flipY?: boolean
  }
}
```

**Value normalisation:** `die.values` may contain raw measurements at any scale. `buildScene` normalises them to `[0, 1]` internally for colour mapping. If `valueRange` is omitted the range is auto-computed from `values[0]` (single-value modes) or all values (stacked mode). Pass an explicit `valueRange` when you need a consistent scale across multiple charts (e.g. a lot-level gallery).

Returns `Scene`:

```ts
{
  rectangles: SceneRect[]
  texts: SceneText[]
  hoverPoints: SceneHoverPoint[]
  overlays: SceneOverlay[]
  plotMode: PlotMode
  colorScheme: 'color' | 'greyscale'
  metadata: WaferMetadata | null
  sourceDies: Die[]               // parallel to hoverPoints — use for click callbacks
  valueRange: [number, number]    // actual [min, max] used for normalisation
}
```

`sourceDies` is populated in the same order as `hoverPoints`. In a Plotly click handler, `event.points[0].pointIndex` maps directly to `scene.sourceDies[pointIndex]`, giving you the original `Die` object for drill-down UIs.

**Overlay kinds** produced by buildScene:
`'wafer-boundary'`, `'reticle'`, `'probe-path'`, `'ring-boundary'`, `'quadrant-boundary'`, `'xy-indicator'`

---

### `generateTextOverlay(dies, options)`

Generates `SceneText[]` labels for the given dies and plot mode. Used internally by `buildScene`, but exported for custom rendering pipelines.

---

### Color helpers

| Function | Description |
| -------- | ----------- |
| `hardBinColor(bin)` | Categorical colour for hard bin index 0–14 (0 = no data) |
| `hardBinGreyscale(bin)` | Same, greyscale variant |
| `softBinColor(bin, maxBin?)` | Maps bin to Viridis position |
| `valueToViridis(t)` | Maps `t ∈ [0,1]` to Viridis RGB string |
| `valueToGreyscale(t)` | Maps `t ∈ [0,1]` to grey RGB string (range 30–230) |
| `contrastTextColor(cssColor)` | Returns `'#000000'` or `'#ffffff'` for WCAG contrast |

Constants exported: `HARD_BIN_COLORS` (bins 0–14), `HARD_BIN_GREY` (bins 0–14).

---

## Plotly Adapter

### `toPlotly(scene, options?)`

Converts a scene into Plotly-compatible `{ data, layout }`.

```ts
interface ToPlotlyOptions {
  showAxes?: boolean                        // default false — show axis ticks and titles
  showUnits?: boolean                       // default false — show raw mm tick values;
                                            // when false and diePitch provided, ticks show
                                            // integer die grid indices
  diePitch?: { x: number; y: number }       // die pitch in mm; enables die-index axis ticks
  axisLabels?: { x?: string; y?: string }   // override axis titles
}
```

Behavior:

- Die rectangles → `layout.shapes` paths at `layer: 'below'`
- Overlays → `layout.shapes` paths at `layer: 'above'`
- Hover → invisible scatter trace (one point per die, indexed parallel to `scene.sourceDies`)
- Text labels → scatter text trace (present when `scene.texts.length > 0`)
- Continuous modes (`value`, `softbin`, `stacked_values`) → reference colorbar trace using `scene.valueRange` for `cmin`/`cmax`; colorscale switches to greyscale ramp when `scene.colorScheme === 'greyscale'`

**Wiring Plotly click callbacks:**

```js
const scene = buildScene(wafer, dies, [], options);
const { data, layout } = toPlotly(scene);
Plotly.react('chart', data, layout);

Plotly.on(document.getElementById('chart'), 'plotly_click', (event) => {
  const die = scene.sourceDies[event.points[0].pointIndex];
  // die.i, die.j, die.values, die.bins, die.metadata, etc.
});
```

---

## Important Types

### `Die`

```ts
{
  id: string
  i: number                    // grid column index
  j: number                    // grid row index
  x: number                    // display coordinate (mm)
  y: number
  width: number
  height: number
  values?: number[]            // raw test values; [0] = primary displayed value
  bins?: number[]              // [0] = primary hard bin
  metadata?: DieMetadata
  insideWafer?: boolean
  partial?: boolean            // straddles wafer boundary
  probeIndex?: number
}
```

Values are stored at their natural scale (e.g. millivolts, normalised 0–1, counts). `buildScene` auto-ranges them for colour mapping — no pre-normalisation required.

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
  ring: number       // 1 = innermost ring
  quadrant: 'NE' | 'NW' | 'SW' | 'SE'
}
```

---

## Recommended Consumer Flows

### Single wafer

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

### Multi-wafer bin stacking

```text
[per wafer] enriched oriented dies  →  diesByWafer: Die[][]
getUniqueBins(diesByWafer.flat())   →  bins: number[]

[per bin]
aggregateBinCounts(diesByWafer, bin)  →  Die[]  (values[0] = occurrence count)
buildScene(wafer, aggregated, [], {
  plotMode: 'value',
  valueRange: [0, diesByWafer.length],   // shared scale across all bin maps
})
→ toPlotly(scene)  →  Plotly.react(el, data, layout)
```

### Minimal example

```ts
const wafer = createWafer({ diameter: 300 });
const dies = generateDies(wafer, { width: 10, height: 10 });
const clipped = clipDiesToWafer(dies, wafer, { width: 10, height: 10 });

// attach your test data here

const scene = buildScene(wafer, applyOrientation(clipped, wafer), [], {
  plotMode: 'hardbin',
  colorScheme: 'greyscale',
  showXYIndicator: true,
});

const { data, layout } = toPlotly(scene, { showAxes: true, diePitch: { x: 10, y: 10 } });
Plotly.react('chart', data, layout, { responsive: true });
```

---

## Current Limitations

- Ring segmentation uses equal-width radial bands. Configurable breakpoints are planned.
- Plotly types are not exposed as formal peer-typed interfaces.
- `aggregateDieValues` helper (mean / median collapse across `die.values[]`) is not yet implemented.
- `bin_count` plot mode (colour by how many stacked bins match a target) is not yet implemented.
