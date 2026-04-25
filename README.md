# wafermap

Browser-first wafer map visualization for semiconductor test data.

**[Live demos →](https://telecasterer.github.io/wafermap/)**

| Demo | Live | Source |
| --- | --- | --- |
| Renderer Comparison | [open](https://telecasterer.github.io/wafermap/examples/plotly-integration-demo/) | [examples/plotly-integration-demo/](examples/plotly-integration-demo/) |
| CSV Analyzer | [open](https://telecasterer.github.io/wafermap/examples/app-demo/) | [examples/app-demo/](examples/app-demo/) |
| Lot Gallery | [open](https://telecasterer.github.io/wafermap/examples/gallery-demo/) | [examples/gallery-demo/](examples/gallery-demo/) |
| Bin Occurrence Map | [open](https://telecasterer.github.io/wafermap/examples/bin-gallery-demo/) | [examples/bin-gallery-demo/](examples/bin-gallery-demo/) |
| Geometry Inference | [open](https://telecasterer.github.io/wafermap/examples/inference-demo/) | [examples/inference-demo/](examples/inference-demo/) |
| Bundler Setup | [open](https://telecasterer.github.io/wafermap/examples/vite-demo/) | [examples/vite-demo/](examples/vite-demo/) |
| Manual Pipeline | [open](https://telecasterer.github.io/wafermap/examples/basic-demo/) | [examples/basic-demo/](examples/basic-demo/) |

---

## API overview

```text
buildWaferMap()       — data layer: prober results → wafer + dies + scene
    │
    ├── renderWaferMap()     — single interactive canvas map with full toolbar
    ├── renderWaferGallery() — multi-map gallery with shared controls + click-to-modal
    └── toPlotly()           — Plotly SVG renderer (bring your own Plotly CDN)
```

`x` and `y` are always **die grid positions** (prober step coordinates), not millimetres.

---

## Canvas rendering (no Plotly required)

### Single interactive map

```ts
import { buildWaferMap } from '@paulrobins/wafermap';
import { renderWaferMap } from '@paulrobins/wafermap/canvas-adapter';

const { wafer, dies } = buildWaferMap({
  results:     rows.map(r => ({ x: +r.x, y: +r.y, bins: [+r.hbin], values: [+r.testA] })),
  waferConfig: { diameter: 300, notch: { type: 'bottom' } },
  dieConfig:   { width: 10, height: 10 },
});

const canvas = document.getElementById('map');
const ctrl = renderWaferMap(canvas, wafer, dies, {
  sceneOptions: { plotMode: 'hardbin' },
  onClick:  die  => console.log('clicked', die),
  onSelect: dies => console.log('selected', dies.length, 'dies'),
  onSceneOptionsChange: opts => syncSidebar(opts),
});

// Programmatic control
ctrl.setOptions({ plotMode: 'value', colorScheme: 'viridis' });
ctrl.clearSelection();
ctrl.resetView();
ctrl.destroy();
```

The toolbar provides: camera download · zoom-region · pan · zoom+/− · reset · plot mode · colour scheme · ring/quadrant/label toggles · rotate · flip.

### Multi-map gallery

```ts
import { renderWaferGallery } from '@paulrobins/wafermap/canvas-adapter';

const galleryCtrl = renderWaferGallery(
  document.getElementById('gallery'),
  waferIds.map(id => ({ wafer: wafers[id], dies: dies[id], label: id })),
  {
    sceneOptions: { plotMode: 'hardbin' },
    onSceneOptionsChange: opts => syncSidebar(opts),
  },
);

// One shared control bar drives all cards simultaneously.
galleryCtrl.setOptions({ plotMode: 'value' });

// Clicking a card opens a full-screen modal with the full toolbar.
// The gallery bar also has a composite PNG download button.
```

---

## Plotly rendering

```ts
import { buildWaferMap, toPlotly } from '@paulrobins/wafermap';

const result = buildWaferMap({
  results:     rows.map(r => ({ x: +r.x, y: +r.y, bins: [+r.hbin], values: [+r.testA] })),
  waferConfig: { diameter: 300, notch: { type: 'bottom' } },
  dieConfig:   { width: 10, height: 10 },
});

const { data, layout } = toPlotly(result.scene);
Plotly.react('chart', data, layout, { responsive: true });
```

Plotly.js must be loaded separately (CDN or bundler). No runtime dependency on Plotly is included in this package.

---

## Architecture

```text
packages/core/           — wafer geometry, die generation, clipping, transforms (no DOM, no Plotly)
packages/renderer/       — buildWaferMap(), buildScene() → renderer-agnostic Scene
packages/plotly-adapter/ — toPlotly(): Scene → Plotly { data, layout }
packages/canvas-adapter/ — renderWaferMap(), renderWaferGallery(), toCanvas()
packages/worker/         — createWafermapWorker(): run buildWaferMap off the main thread
```

### Plot modes

`'value'` · `'hardbin'` · `'softbin'` · `'stackedValues'` · `'stackedBins'`

### Key features

- True rectangular die rendering with configurable kerf gap
- Wafer clipping with partial die detection and edge exclusion zone
- Wafer orientation flat / V-notch rendered from diameter automatically
- Interactive rotate, flip, zoom, pan, and die selection
- Reticle, probe path, ring, quadrant, and XY indicator overlays
- Multi-channel `values[]` and `bins[]` per die
- Lot-level stacking (`lotStack`) with mean / median / stddev / countBin / mode / percent aggregation
- Adaptive geometry inference — omit die size or diameter and the library estimates them
- Configurable colour schemes; continuous colorbar for value modes; bin legend with click-to-highlight for bin modes
- Web Worker support via `createWafermapWorker` for off-main-thread data processing

Full API reference: [docs/API.md](docs/API.md)

---

## Running demos locally

```bash
npm install
npm run build
python3 -m http.server 8000
# open http://localhost:8000/examples/plotly-integration-demo/
```

For the Vite demo:

```bash
cd examples/vite-demo
npm install
npm run dev
```
