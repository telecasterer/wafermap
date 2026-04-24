import Plotly from 'plotly.js-dist-min';
import {
  buildWaferMap,
  listColorSchemes,
  buildScene,
  toPlotly,
} from 'wafermap';
import './style.css';

const waferMeta = {
  lot: 'LOT-VITE',
  waferNumber: 12,
  testDate: '2026-04-21',
  testProgram: 'E2E-VITE',
  temperature: 25,
};

document.querySelector('#app').innerHTML = `
  <main class="shell">
    <section class="hero">
      <span class="eyebrow">Bundler Example</span>
      <h1>wafermap + Vite + Plotly</h1>
      <p>
        This example consumes the local <code>wafermap</code> package through a normal bundler workflow.
        It is the next step after the browser import-map demos.
      </p>
    </section>

    <section class="controls">
      <label>
        <span>Mode</span>
        <select id="mode">
          <option value="value">Value</option>
          <option value="hardbin">Hard Bin</option>
          <option value="softbin">Soft Bin</option>
          <option value="stackedValues">Stacked Values</option>
          <option value="stackedBins">Stacked Bins</option>
        </select>
      </label>

      <label>
        <span>Labels</span>
        <input id="labels" type="checkbox" />
      </label>

      <label>
        <span>Rings</span>
        <input id="rings" type="checkbox" checked />
      </label>

      <label>
        <span>Quadrants</span>
        <input id="quadrants" type="checkbox" />
      </label>
    </section>

    <section class="layout">
      <div class="card chart-card">
        <div id="chart"></div>
      </div>
      <aside class="card meta-card">
        <h2>Wafer Metadata</h2>
        <div id="meta"></div>
      </aside>
    </section>
  </main>
`;

// ── Synthetic wafer data ──────────────────────────────────────────────────────
// Generate test data as die grid positions (prober step coordinates).
// x,y are integers; die size and wafer diameter are passed to buildWaferMap.

const rawData = [];
for (let y = -15; y <= 15; y++) {
  for (let x = -15; x <= 15; x++) {
    if (Math.sqrt(x * x + y * y) > 15) continue;
    const r     = Math.sqrt(x * x + y * y);
    const value = Math.max(0.05, 0.97 - r * 0.055 + Math.sin(x * 0.8 + y * 0.5) * 0.03);
    rawData.push({ x, y, values: [value] });
  }
}

const baseResult = buildWaferMap({
  results: rawData,
  waferConfig: {
    diameter: 300,
    notch: { type: 'bottom' },
    metadata: waferMeta,
  },
  dieConfig: { width: 10, height: 10 },
});

// Post-enrich with multiple values and bins so stacked modes work.
function toBin(v) { return v >= 0.75 ? 1 : v >= 0.5 ? 2 : 3; }

const rawMap = new Map(rawData.map(d => [`${d.x},${d.y}`, d]));
const enrichedDies = baseResult.dies.map(die => {
  const src = rawMap.get(`${die.i},${die.j}`);
  if (!src) return die;
  const v = src.values[0];
  return {
    ...die,
    values: [v, Math.max(0.05, v - 0.08), Math.max(0.05, v - 0.14)],
    bins:   [toBin(v), toBin(v - 0.08), toBin(v - 0.14)],
    metadata: {
      lotId:  waferMeta.lot,
      waferId: `${waferMeta.lot}-W${String(waferMeta.waferNumber).padStart(2, '0')}`,
      deviceType: 'ViteDemoDevice',
    },
  };
});

// ── Render state ──────────────────────────────────────────────────────────────

const state = {
  plotMode: 'value',
  showText: false,
  showRingBoundaries: true,
  showQuadrantBoundaries: false,
};

function render() {
  const scene = buildScene(baseResult.wafer, enrichedDies, {
    plotMode: state.plotMode,
    showText: state.showText,
    showRingBoundaries: state.showRingBoundaries,
    showQuadrantBoundaries: state.showQuadrantBoundaries,
    ringCount: 4,
  });

  const plot = toPlotly(scene);
  Plotly.react('chart', plot.data, {
    ...plot.layout,
    title: { text: 'wafermap Vite Consumer', x: 0.03 },
    margin: { t: 48, l: 12, r: 24, b: 12 },
  }, { responsive: true });

  document.querySelector('#meta').innerHTML = Object.entries(waferMeta).map(([key, val]) => `
    <div class="meta-row">
      <span>${formatKey(key)}</span>
      <strong>${val}</strong>
    </div>
  `).join('');
}

function formatKey(key) {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase());
}

// ── Populate colour scheme selector ──────────────────────────────────────────
const colorSel = document.querySelector('#color-scheme');
if (colorSel) {
  colorSel.innerHTML = listColorSchemes()
    .filter(({ name }) => name !== 'color')
    .map(({ name, label }) => `<option value="${name}">${label}</option>`)
    .join('');
}

document.querySelector('#mode').addEventListener('change', e => { state.plotMode = e.target.value; render(); });
document.querySelector('#labels').addEventListener('change', e => { state.showText = e.target.checked; render(); });
document.querySelector('#rings').addEventListener('change', e => { state.showRingBoundaries = e.target.checked; render(); });
document.querySelector('#quadrants').addEventListener('change', e => { state.showQuadrantBoundaries = e.target.checked; render(); });

render();
