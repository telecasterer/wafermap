# API Reference

This document describes the current public API exposed by `wafermap`.

The public package surface is exported from:
- `wafermap`
- `wafermap/core`
- `wafermap/renderer`
- `wafermap/plotly-adapter`

## Package Surface

Top-level exports currently include:
- core wafer model and transform functions
- renderer scene builders and color helpers
- Plotly adapter helpers

In practice, most consumers will want one of these import styles:

```ts
import {
  createWafer,
  generateDies,
  clipDiesToWafer,
  buildScene,
  toPlotly,
} from 'wafermap';
```

Or module-specific imports:

```ts
import { createWafer, generateDies } from 'wafermap/core';
import { buildScene } from 'wafermap/renderer';
import { toPlotly } from 'wafermap/plotly-adapter';
```

## Core

### `createWafer(config)`

Creates a wafer model.

Input:

```ts
{
  diameter: number
  center?: { x: number; y: number }
  flat?: { type: 'top' | 'bottom' | 'left' | 'right'; length: number }
  orientation?: number
  metadata?: WaferMetadata
}
```

Returns a wafer object containing:
- `diameter`
- `radius`
- `center`
- `flat`
- `orientation`
- `metadata`

### `generateDies(wafer, dieConfig)`

Creates a rectangular die grid centered on the wafer.

Input:

```ts
{
  width: number
  height: number
  gridSize?: number
  offset?: { x: number; y: number }
}
```

Returns `Die[]` with:
- `id`
- `i`, `j`
- `x`, `y`
- `width`, `height`

### `clipDiesToWafer(dies, wafer, dieConfig?)`

Clips dies to the wafer boundary.

Behavior:
- removes dies entirely outside the wafer
- marks included dies with `insideWafer: true`
- marks straddling dies with `partial: true` when `dieConfig` is provided

### `mapDataToDies(dies, data, options)`

Maps row data onto dies.

Supports:
- `matchBy: 'xy'`
- `matchBy: 'ij'`

Primary use:
- attach continuous values into `die.values`

### `applyOrientation(dies, wafer)`

Applies `wafer.orientation` to die coordinates.

Use this after clipping and enrichment, before render-time transforms.

### `transformDies(dies, options, center?)`

Applies interactive display transforms.

Input:

```ts
{
  rotation?: number
  flipX?: boolean
  flipY?: boolean
}
```

Behavior:
- rotation is around wafer center
- flips are applied after rotation

### `applyProbeSequence(dies, config)`

Assigns `probeIndex` ordering.

Supported types:
- `row`
- `column`
- `snake`
- `custom`

### `generateReticleGrid(wafer, config)`

Generates reticle rectangles covering the wafer.

Input:

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

## Renderer

### `buildScene(wafer, dies, reticles?, options?)`

Builds the renderer-agnostic scene.

Common options:

```ts
{
  plotMode?: 'value' | 'hardbin' | 'softbin' | 'stacked_values' | 'stacked_bins'
  showText?: boolean
  showReticle?: boolean
  showProbePath?: boolean
  ringCount?: number
  showRingBoundaries?: boolean
  showQuadrantBoundaries?: boolean
  interactiveTransform?: {
    rotation?: number
    flipX?: boolean
    flipY?: boolean
  }
}
```

Returns a scene with:
- `rectangles`
- `texts`
- `hoverPoints`
- `overlays`
- `plotMode`
- `metadata`

### `generateTextOverlay(dies, options)`

Creates readable centered text labels for dies.

Used internally by `buildScene`, but available as part of the renderer module.

### Color Helpers

Renderer color utilities:
- `hardBinColor(bin)`
- `softBinColor(bin, maxBin?)`
- `valueToViridis(value)`
- `contrastTextColor(cssColor)`

## Plotly Adapter

### `toPlotly(scene)`

Converts a scene into Plotly-compatible output:

```ts
{
  data: object[]
  layout: object
}
```

Behavior:
- die rectangles become `layout.shapes` paths
- overlays become `layout.shapes` paths
- hover uses an invisible scatter trace
- text uses a scatter text trace
- continuous modes add a reference colorbar trace

## Important Types

### `Die`

The die model can include:

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
}
```

## Recommended Consumer Flow

The intended flow is:

1. Create wafer
2. Generate dies
3. Clip dies
4. Attach values / bins / metadata
5. Apply wafer orientation
6. Apply interactive transforms when needed
7. Build a scene
8. Convert to Plotly

Minimal example:

```ts
const wafer = createWafer({ diameter: 300 });
const dies = generateDies(wafer, { width: 10, height: 10 });
const clipped = clipDiesToWafer(dies, wafer, { width: 10, height: 10 });
const scene = buildScene(wafer, clipped, [], { plotMode: 'hardbin' });
const plot = toPlotly(scene);
```

## Current Limitations

- The API is still evolving.
- Some advanced wafer-domain conventions are not yet parameterized.
- Ring segmentation currently uses equal-width radial bands.
- Plotly types are not yet exposed as formal peer-typed interfaces.
