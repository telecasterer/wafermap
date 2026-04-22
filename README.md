# wafermap

`wafermap` is a browser-first wafer map visualization toolkit for semiconductor data.

It is built around a clean split between wafer-domain logic and chart-library integration:

- `packages/core`: wafer geometry, die generation, clipping, transforms, metadata
- `packages/renderer`: converts wafer + dies into a renderer-agnostic scene made of rectangles, text, and overlays
- `packages/plotly-adapter`: converts that scene into Plotly `data` + `layout`
- `examples/basic-demo`: showcase demo with the richer controls and layout
- `examples/plotly-integration-demo`: integration recipe demo using the built `wafermap` output
- `examples/gallery-demo`: 2×2 lot gallery showing four wafers side-by-side
- `examples/bin-gallery-demo`: stacked bin gallery — one map per bin showing occurrence counts across all wafers
- `examples/vite-demo`: bundler-based consumer example using Vite

The goal is to make wafer plotting usable for web developers without pushing wafer geometry rules down into Plotly code.

Detailed API documentation lives in [docs/API.md](docs/API.md).
Publishing notes and release checks live in [docs/PUBLISHING.md](docs/PUBLISHING.md).
A SvelteKit integration guide lives in [docs/SVELTEKIT.md](docs/SVELTEKIT.md).

## Status

Current status: working prototype / shareable architecture baseline

What works now:

- True rectangular die rendering with configurable kerf gap
- Hard bin, soft bin, value, stacked bin, and stacked value plot modes
- Auto-ranging value scale — store raw measurements at any scale, the renderer normalises automatically; explicit `valueRange` available for cross-chart consistency
- Greyscale colour scheme option for all plot modes
- Bin highlight — dim all dies except a selected bin
- Wafer clipping with partial die detection
- Wafer orientation plus interactive rotate / flip transforms
- Die metadata and wafer metadata flows
- Centered die text overlays
- Reticle, probe, ring, and quadrant overlays
- XY orientation indicator (rotates with the wafer, fixed to bottom-left corner)
- `classifyDie` / `getRingLabel` helpers for ring and quadrant stats
- `scene.sourceDies` for Plotly click / hover callbacks with raw die data
- `scene.valueRange` — actual data range used for normalisation, reflected on the colorbar
- Configurable axis display with die-index or mm tick labels in the Plotly adapter
- `aggregateBinCounts` / `getUniqueBins` — stack N wafers and count per-position bin occurrences for lot-level defect maps
- Hard bin colour palette covers bins 0–14
- CI workflow for build, test, and package dry-run validation

What is still missing:

- npm publication
- `aggregateDieValues` helper (mean / median collapse across `die.values[]`)
- `bin_count` plot mode (colour by matching bin count across stacked tests)
- Configurable fab-specific ring breakpoints
- Built-in CSV / ATDF data loaders

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
    classify.ts       # classifyDie, getRingLabel
    aggregates.ts     # aggregateBinCounts, getUniqueBins
  renderer/
    buildScene.ts
    colorMap.ts
  plotly-adapter/
    toPlotly.ts

examples/
  basic-demo/             # single-wafer showcase with all controls
  plotly-integration-demo/  # integration recipe
  gallery-demo/           # 2×2 lot gallery (W01–W04)
  bin-gallery-demo/       # stacked bin occurrence maps, one per bin
  vite-demo/              # bundler-based consumer example

data/
  dummy-fulldata.csv      # LOT456, W01–W06, hbin/sbin/testA/testB/testC
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
- ring / quadrant classification
- multi-wafer bin aggregation

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
  colorScheme: 'color' | 'greyscale',
  metadata: WaferMetadata | null,
  sourceDies: Die[],
  valueRange: [number, number],   // actual [min, max] used for colour normalisation
}
```

This layer decides:

- which plot mode is active
- how each die is filled
- how stacked data splits a die rectangle
- how text labels are generated
- how overlays such as wafer boundary, reticle, rings, and quadrants are built

### Plotly Adapter

`toPlotly(scene, options?)` is intentionally thin.

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

The showcase demo is in [examples/basic-demo/index.html](examples/basic-demo/index.html) and [examples/basic-demo/main.js](examples/basic-demo/main.js).

Features shown there:

- mode switching
- rotate left / right
- flip horizontal / vertical
- label toggle
- reticle toggle
- probe toggle
- ring and quadrant overlay toggles
- XY indicator toggle
- greyscale / colour scheme toggle
- bin highlight selector
- configurable ring count
- wafer metadata panel
- total, pass, partial, ring, and quadrant stats

There is also a slimmer integration recipe in [examples/plotly-integration-demo/index.html](examples/plotly-integration-demo/index.html) and [examples/plotly-integration-demo/main.js](examples/plotly-integration-demo/main.js). Both demos import the built package through an import map.

A 2×2 lot gallery is in [examples/gallery-demo/](examples/gallery-demo/) showing four wafers from the same lot side-by-side with shared controls.

A stacked-bin gallery is in [examples/bin-gallery-demo/](examples/bin-gallery-demo/) — it uses `aggregateBinCounts` to stack all six wafers and renders one map per hard bin, where the colour at each die position shows how many wafers had that bin there.

For a normal bundler workflow, there is also [examples/vite-demo/package.json](examples/vite-demo/package.json) with source in [examples/vite-demo/src/main.js](examples/vite-demo/src/main.js). That example consumes the local package as `wafermap` through a file dependency.

### Running The Demos

Use any static file server:

```bash
cd wafermap
python3 -m http.server 8000
```

Then open any of the demos:

```text
http://127.0.0.1:8000/examples/basic-demo/
http://127.0.0.1:8000/examples/plotly-integration-demo/
http://127.0.0.1:8000/examples/gallery-demo/
http://127.0.0.1:8000/examples/bin-gallery-demo/
```

For the Vite example:

```bash
cd wafermap/examples/vite-demo
npm install
npm run dev
```

## Minimal Plotly Usage

This is the intended flow for a web developer:

```js
import {
  createWafer, generateDies, clipDiesToWafer,
  applyOrientation, transformDies,
  buildScene, toPlotly,
} from 'wafermap';

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
  // values can be raw measurements at any scale — buildScene auto-ranges them
  values: [850 - Math.abs(die.i) * 40 - Math.abs(die.j) * 35],   // e.g. mV
  metadata: { lotId: 'LOT-42', waferId: 'LOT-42-W07', deviceType: 'DemoDevice' },
}));

const oriented = applyOrientation(enriched, wafer);
const transformed = transformDies(oriented, { rotation: 0, flipX: false, flipY: false }, wafer.center);

const scene = buildScene(wafer, transformed, [], {
  plotMode: 'hardbin',
  showText: true,
  showRingBoundaries: true,
  showQuadrantBoundaries: true,
  showXYIndicator: true,
  ringCount: 4,
});

const { data, layout } = toPlotly(scene, { showAxes: true, showUnits: true });
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
} from 'wafermap';
```

To get there, the next major steps are:

- publish the package
- expand test coverage
- add data-loading helpers
- add framework examples beyond vanilla Vite

## Current Issues

- The project builds locally to `dist/`, but is not yet published for reuse outside the repo.
- Ring segmentation is currently equal radial bands, not configurable breakpoint bands.
- Quadrant stats use transformed display coordinates, which is good for interactive views but may not match all manufacturing reporting conventions.
- Hover formatting is useful but not yet configurable through a public API.

## Recommended Next Steps

To turn this into a fully shareable wafer plot tool for Plotly users:

1. Publish the package or add a local tarball install flow.
2. Add more geometry edge-case tests, especially for flats and ring segmentation.
3. Add configurable ring breakpoints.
4. Add small CSV / JSON data-loading helpers.
5. Add framework examples such as React.

## Current Consumer Examples

`examples/basic-demo/` is the showcase demo:

- imports `wafermap` from built output
- exercises transforms, reticles, probe path, rings, quadrants, and richer controls

`examples/plotly-integration-demo/` is the integration recipe:

- imports `wafermap` from built output
- loads wafer data in app code
- builds a scene through the library
- renders with Plotly
- keeps UI concerns outside the geometry/renderer layers

`examples/vite-demo/` is the bundler consumer example:

- installs `wafermap` as a local file dependency
- imports it like a normal package
- uses Plotly inside a standard Vite app structure
- shows how this should feel in a real web-dev workflow

CI is defined in [.github/workflows/ci.yml](.github/workflows/ci.yml) and currently runs install, typecheck, test, and package dry-run checks.
