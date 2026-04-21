# wmap

`wmap` is a browser-first wafer map visualization toolkit for semiconductor data.

It is built around a clean split between wafer-domain logic and chart-library integration:
- `packages/core`: wafer geometry, die generation, clipping, transforms, metadata
- `packages/renderer`: converts wafer + dies into a renderer-agnostic scene made of rectangles, text, and overlays
- `packages/plotly-adapter`: converts that scene into Plotly `data` + `layout`
- `examples/basic-demo`: feature-rich browser demo consuming the built package
- `examples/plotly-integration-demo`: package-consumer demo using the built `wmap` output

The goal is to make wafer plotting usable for web developers without pushing wafer geometry rules down into Plotly code.

## Status

Current status: working prototype / shareable architecture baseline

What works now:
- True rectangular die rendering
- Hard bin, soft bin, value, stacked bin, and stacked value modes
- Wafer clipping with partial die detection
- Wafer orientation plus interactive rotate / flip transforms
- Die metadata and wafer metadata flows
- Centered die text overlays
- Reticle, probe, ring, and quadrant overlays
- Demo stats for total dies, pass rate, rings, and quadrants

What is still missing:
- npm packaging
- automated tests
- data loading helpers
- framework examples
- configurable fab-specific ring definitions

## Project Layout

```text
packages/
  core/
    wafer.ts
    dies.ts
    transforms.ts
    metadata.ts
    reticle.ts
    probe.ts
  renderer/
    buildScene.ts
    colorMap.ts
  plotly-adapter/
    toPlotly.ts

examples/
  basic-demo/
    index.html
    main.js
  plotly-integration-demo/
    index.html
    main.js

data/
  dummy-test.csv
  dummy-bins.csv
  dummy-advanced.csv
```

## Architecture

### Core

Core owns wafer-domain logic:
- wafer creation
- die grid generation
- clipping
- orientation
- interactive transforms
- reticle generation
- probe ordering
- metadata attachment

Core should not know about Plotly.

### Renderer

The renderer layer is the key abstraction.

`buildScene(wafer, dies, reticles?, options)` returns a scene shaped roughly like:

```ts
{
  rectangles: SceneRect[],
  texts: SceneText[],
  hoverPoints: SceneHoverPoint[],
  overlays: SceneOverlay[],
  metadata: WaferMetadata | null
}
```

This layer decides:
- which plot mode is active
- how each die is filled
- how stacked data splits a die rectangle
- how text labels are generated
- how overlays such as wafer boundary, reticle, rings, and quadrants are built

### Plotly Adapter

`toPlotly(scene)` is intentionally thin.

It maps:
- scene rectangles -> Plotly `layout.shapes`
- scene overlays -> Plotly `layout.shapes`
- hover -> invisible scatter trace
- text -> scatter text trace

## Plot Modes

Supported plot modes:
- `value`
- `hardbin`
- `softbin`
- `stacked_values`
- `stacked_bins`

## Metadata

### Die Metadata

Die metadata can include fields such as:

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

### Wafer Metadata

Wafer metadata can include fields such as:

```ts
{
  lot: string
  waferNumber: number
  testDate: string
  testProgram: string
  temperature: number
}
```

## Demos

The richer wafer-ops demo is in [examples/basic-demo/index.html](/home/paul/projects/wmap/examples/basic-demo/index.html:1) and [examples/basic-demo/main.js](/home/paul/projects/wmap/examples/basic-demo/main.js:1).

Features shown there:
- mode switching
- rotate left / right
- flip horizontal / vertical
- label toggle
- reticle toggle
- probe toggle
- ring and quadrant overlay toggles
- configurable ring count
- wafer metadata panel
- total, pass, partial, ring, and quadrant stats

There is also a slimmer consumer-style example in [examples/plotly-integration-demo/index.html](/home/paul/projects/wmap/examples/plotly-integration-demo/index.html:1) and [examples/plotly-integration-demo/main.js](/home/paul/projects/wmap/examples/plotly-integration-demo/main.js:1). Both demos now import the built package through an import map instead of copying the library code inline.

### Running The Demos

Use any static file server:

```bash
cd /home/paul/projects/wmap
python3 -m http.server 8000
```

Then open:

```text
http://127.0.0.1:8000/examples/basic-demo/
```

For the package-consumer version, open:

```text
http://127.0.0.1:8000/examples/plotly-integration-demo/
```

## Minimal Plotly Usage

This is the intended flow for a web developer:

```js
import { createWafer } from '../packages/core/wafer.js';
import { generateDies } from '../packages/core/dies.js';
import { clipDiesToWafer, applyOrientation, transformDies } from '../packages/core/transforms.js';
import { buildScene } from '../packages/renderer/buildScene.js';
import { toPlotly } from '../packages/plotly-adapter/toPlotly.js';

const wafer = createWafer({
  diameter: 300,
  flat: { type: 'bottom', length: 40 },
  orientation: 0,
  metadata: {
    lot: 'LOT-42',
    waferNumber: 7,
    testDate: '2026-04-21',
    testProgram: 'CP1',
    temperature: 25,
  },
});

const dies = generateDies(wafer, { width: 10, height: 10 });
const clipped = clipDiesToWafer(dies, wafer, { width: 10, height: 10 });

const enriched = clipped.map((die, idx) => ({
  ...die,
  bins: [idx % 3 === 0 ? 1 : 2],
  values: [Math.max(0, 1 - Math.abs(die.i) * 0.06 - Math.abs(die.j) * 0.05)],
  metadata: {
    lotId: 'LOT-42',
    waferId: 'LOT-42-W07',
    deviceType: 'DemoDevice',
  },
}));

const oriented = applyOrientation(enriched, wafer);
const transformed = transformDies(oriented, { rotation: 0, flipX: false, flipY: false }, wafer.center);

const scene = buildScene(wafer, transformed, [], {
  plotMode: 'hardbin',
  showText: true,
  showRingBoundaries: true,
  showQuadrantBoundaries: true,
  ringCount: 4,
});

const { data, layout } = toPlotly(scene);
Plotly.react('chart', data, layout, { responsive: true });
```

## Good Shareable Usage Pattern

The long-term ergonomic goal should be something like:

```ts
import {
  createWafer,
  generateDies,
  clipDiesToWafer,
  buildScene,
  toPlotly,
} from 'wmap';
```

To get there, the next major steps are:
- publish and document the package surface
- add tests
- add a bundler-based integration example
- add data-loading helpers

## Current Issues

- The project builds locally to `dist/`, but is not yet published for reuse outside the repo.
- Ring segmentation is currently equal radial bands, not configurable breakpoint bands.
- Quadrant stats use transformed display coordinates, which is good for interactive views but may not match all manufacturing reporting conventions.
- Hover formatting is useful but not yet configurable through a public API.

## Recommended Next Steps

To turn this into a fully shareable wafer plot tool for Plotly users:

1. Publish the package or add a local tarball install flow.
2. Add tests for clipping, transforms, scene generation, stacked rendering, and overlays.
3. Add a bundler-based integration example aimed at a normal Plotly app.
4. Add configurable ring breakpoints.
5. Add small CSV / JSON data-loading helpers.

## Current Consumer Examples

`examples/basic-demo/` is the most feature-rich consumer example:
- imports `wmap` from built output
- exercises transforms, reticles, probe path, rings, quadrants, and richer controls

`examples/plotly-integration-demo/` is the most compact consumer example:
- imports `wmap` from built output
- loads wafer data in app code
- builds a scene through the library
- renders with Plotly
- keeps UI concerns outside the geometry/renderer layers

The next evolution from here would be a bundler-based app example such as Vite, React, or plain npm package consumption from outside this repo.
