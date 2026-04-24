# wafermap

Browser-first wafer map visualization for semiconductor test data.

**[Live demos →](https://telecasterer.github.io/wafermap/)**

| Demo | Live | Source |
| --- | --- | --- |
| Plotly Integration | [open](https://telecasterer.github.io/wafermap/examples/plotly-integration-demo/) | [examples/plotly-integration-demo/](examples/plotly-integration-demo/) |
| Lot Gallery | [open](https://telecasterer.github.io/wafermap/examples/gallery-demo/) | [examples/gallery-demo/](examples/gallery-demo/) |
| Bin Gallery | [open](https://telecasterer.github.io/wafermap/examples/bin-gallery-demo/) | [examples/bin-gallery-demo/](examples/bin-gallery-demo/) |
| Inference Demo | [open](https://telecasterer.github.io/wafermap/examples/inference-demo/) | [examples/inference-demo/](examples/inference-demo/) |
| CSV Upload App | [open](https://telecasterer.github.io/wafermap/examples/app-demo/) | [examples/app-demo/](examples/app-demo/) |
| Vite Consumer | [open](https://telecasterer.github.io/wafermap/examples/vite-demo/) | [examples/vite-demo/](examples/vite-demo/) |
| Basic Demo (manual pipeline) | [open](https://telecasterer.github.io/wafermap/examples/basic-demo/) | [examples/basic-demo/](examples/basic-demo/) |

---

## Quick start

```ts
import { buildWaferMap, toPlotly } from '@paulrobins/wafermap';

const result = buildWaferMap({
  results: rows.map(r => ({ x: +r.x, y: +r.y, bins: [+r.hbin], values: [+r.testA] })),
  waferConfig: { diameter: 300, notch: { type: 'bottom' } },
  dieConfig:   { width: 10, height: 10 },
});

const { data, layout } = toPlotly(result.scene);
Plotly.react('chart', data, layout, { responsive: true });
```

`x` and `y` are **die grid positions** (prober step coordinates), not millimetres.
The library converts them internally using the die size you provide.

Full API reference: [docs/API.md](docs/API.md)

---

## Architecture

```text
packages/core/           — wafer geometry, die generation, clipping, transforms (no DOM, no Plotly)
packages/renderer/       — buildWaferMap(), buildScene() → renderer-agnostic Scene
packages/plotly-adapter/ — toPlotly() converts Scene → Plotly { data, layout }
```

### Plot modes

`'value'` · `'hardbin'` · `'softbin'` · `'stackedValues'` · `'stackedBins'`

### Key features

- True rectangular die rendering with configurable kerf gap
- Wafer clipping with partial die detection and edge exclusion zone
- Wafer orientation flat / V-notch rendered from diameter automatically
- Interactive rotate and flip transforms
- Reticle, probe path, ring, quadrant, and XY indicator overlays
- Multi-channel `values[]` and `bins[]` per die
- Lot-level stacking (`lotStack`) with mean / median / stddev / countBin / mode / percent aggregation
- Adaptive geometry inference — omit die size or diameter and the library estimates them
- Configurable colour schemes; continuous colorbar for value modes
- `getDieAtPoint` for Plotly click / hover drill-down

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
